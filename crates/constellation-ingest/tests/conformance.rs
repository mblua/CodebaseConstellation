use std::fs;
use std::path::Path;
use std::process::Command;

use constellation_ingest::{scan, ScanOptions};
use rusqlite::Connection;
use tempfile::TempDir;

#[test]
fn temporary_repository_scan_conforms_to_v1() {
    let temporary = TempDir::new().expect("temporary directory");
    let repository = temporary.path().join("repository");
    fs::create_dir_all(repository.join("src")).expect("TypeScript source directory");
    fs::create_dir_all(repository.join("core/src")).expect("Rust source directory");
    fs::write(
        repository.join("package.json"),
        r#"{
  "name": "tiny-ui",
  "version": "1.0.0",
  "dependencies": { "solid-js": "^1" }
}
"#,
    )
    .expect("npm manifest");
    fs::write(
        repository.join("src/a.ts"),
        "import { value } from './b';\nimport 'solid-js';\nexport const answer = value;\n",
    )
    .expect("TypeScript importer");
    fs::write(repository.join("src/b.ts"), "export const value = 42;\n")
        .expect("TypeScript target");
    fs::write(
        repository.join("core/Cargo.toml"),
        r#"[package]
name = "tiny-core"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = "1"
"#,
    )
    .expect("Cargo manifest");
    fs::write(
        repository.join("core/src/lib.rs"),
        "pub mod thing;\nuse serde::Serialize;\npub use thing::Thing;\n",
    )
    .expect("Rust crate root");
    fs::write(
        repository.join("core/src/thing.rs"),
        "#[derive(Debug)]\npub struct Thing;\n",
    )
    .expect("Rust module");

    git(&repository, ["init", "--initial-branch=main"]);
    git(&repository, ["config", "user.name", "Constellation Test"]);
    git(
        &repository,
        ["config", "user.email", "constellation@example.invalid"],
    );
    git(
        &repository,
        [
            "remote",
            "add",
            "origin",
            "https://github.com/example/tiny.git",
        ],
    );
    git(&repository, ["add", "."]);
    git(
        &repository,
        [
            "-c",
            "commit.gpgsign=false",
            "commit",
            "-m",
            "Implement graph #7",
        ],
    );

    let database = temporary.path().join("scan.sqlite");
    let report = scan(&ScanOptions {
        repo: repository.clone(),
        database: database.clone(),
    })
    .expect("scan succeeds");
    assert_eq!(report.status, "complete");
    assert_eq!(report.repository_key, "repo:tiny");
    assert_eq!(report.history_mode, "full");
    assert_eq!(report.tracked_file_count, 6);

    let connection = Connection::open(&database).expect("open scan database");
    connection
        .execute_batch("PRAGMA foreign_keys = ON")
        .expect("enable foreign keys");
    assert_eq!(scalar(&connection, "PRAGMA user_version"), 1);
    assert_eq!(
        scalar(&connection, "SELECT max(version) FROM schema_migrations"),
        1
    );
    assert_eq!(
        scalar(
            &connection,
            "SELECT count(*) FROM snapshots WHERE status = 'complete' AND completed_at IS NOT NULL"
        ),
        1
    );
    assert_eq!(
        scalar(
            &connection,
            r#"
            SELECT count(*) FROM (
                SELECT n.id
                FROM nodes AS n
                LEFT JOIN edges AS parent
                  ON parent.snapshot_id = n.snapshot_id
                 AND parent.target_node_id = n.id
                 AND parent.kind = 'contains'
                WHERE n.kind IN ('file', 'directory')
                GROUP BY n.snapshot_id, n.id
                HAVING count(parent.id) <> 1
            )
            "#
        ),
        0
    );
    assert_eq!(
        scalar(
            &connection,
            r#"
            SELECT count(*)
            FROM edges AS e
            JOIN nodes AS source ON source.id = e.source_node_id
            JOIN nodes AS target ON target.id = e.target_node_id
            WHERE source.snapshot_id <> e.snapshot_id OR target.snapshot_id <> e.snapshot_id
            "#
        ),
        0
    );
    assert_eq!(
        scalar(
            &connection,
            r#"
            SELECT count(*) FROM nodes
            WHERE kind IN ('file', 'directory')
              AND (stable_key <> 'fs:' || path OR path LIKE '%\%' OR path LIKE './%' OR path LIKE '/%')
            "#
        ),
        0
    );
    assert_eq!(
        scalar(
            &connection,
            r#"
            SELECT count(*) FROM edges AS e
            WHERE (e.confidence < 1 OR e.is_derived = 1)
              AND NOT EXISTS (
                  SELECT 1 FROM edge_evidence AS ev
                  WHERE ev.snapshot_id = e.snapshot_id AND ev.edge_id = e.id
              )
            "#
        ),
        0
    );
    assert!(
        scalar(
            &connection,
            "SELECT count(*) FROM edges WHERE kind = 'groups'"
        ) >= 6
    );
    assert!(
        scalar(
            &connection,
            "SELECT count(*) FROM edges WHERE kind = 'depends_on'"
        ) >= 2
    );
    assert!(
        scalar(
            &connection,
            "SELECT count(*) FROM edges WHERE kind = 'imports'"
        ) >= 4
    );
    assert!(
        scalar(
            &connection,
            "SELECT count(*) FROM edges WHERE kind = 'modifies'"
        ) >= 6
    );
    assert_eq!(
        scalar(
            &connection,
            "SELECT count(*) FROM edges WHERE kind = 'references'"
        ),
        1
    );
    assert_eq!(
        scalar(
            &connection,
            "SELECT count(*) FROM edges WHERE kind = 'touches'"
        ),
        6
    );
    assert_eq!(
        scalar(
            &connection,
            "SELECT count(*) FROM snapshot_capabilities WHERE capability IN ('filesystem', 'packages', 'syntax_graph', 'typescript_imports', 'rust_imports', 'git_history', 'issue_file_touches')"
        ),
        7
    );
    let touch_status: String = connection
        .query_row(
            "SELECT status FROM snapshot_capabilities WHERE capability = 'issue_file_touches'",
            [],
            |row| row.get(0),
        )
        .expect("touch capability");
    assert_eq!(touch_status, "available");
    assert_eq!(
        scalar(
            &connection,
            r#"
            SELECT CAST(m.value AS INTEGER)
            FROM node_metrics AS m JOIN nodes AS n ON n.id = m.node_id
            WHERE n.stable_key = 'fs:src/a.ts' AND m.key = 'loc'
            "#
        ),
        3
    );
    assert_eq!(
        scalar(&connection, "SELECT count(*) FROM pragma_foreign_key_check"),
        0
    );

    let second_database = temporary.path().join("second.sqlite");
    let second = scan(&ScanOptions {
        repo: repository,
        database: second_database.clone(),
    })
    .expect("second scan succeeds");
    assert_eq!(report.content_hash, second.content_hash);
    assert_eq!(
        stable_keys(&connection),
        stable_keys(&Connection::open(second_database).unwrap())
    );

    connection
        .execute_batch(
            r#"
            CREATE TRIGGER force_node_failure
            BEFORE INSERT ON nodes
            BEGIN
                SELECT RAISE(ABORT, 'injected node failure');
            END;
            "#,
        )
        .expect("install failure injection trigger");
    fs::write(
        temporary.path().join("repository/README.md"),
        "content change for atomic failure test\n",
    )
    .expect("write second revision");
    git(temporary.path().join("repository").as_path(), ["add", "."]);
    git(
        temporary.path().join("repository").as_path(),
        [
            "-c",
            "commit.gpgsign=false",
            "commit",
            "-m",
            "Second revision",
        ],
    );
    let failure = scan(&ScanOptions {
        repo: temporary.path().join("repository"),
        database,
    })
    .expect_err("injected graph write must fail");
    assert!(failure.to_string().contains("failed atomically"));
    assert_eq!(
        scalar(
            &connection,
            "SELECT count(*) FROM snapshots WHERE status = 'complete'"
        ),
        1
    );
    assert_eq!(
        scalar(
            &connection,
            "SELECT count(*) FROM snapshots WHERE status = 'failed' AND completed_at IS NOT NULL"
        ),
        1
    );
    assert_eq!(
        scalar(
            &connection,
            r#"
            SELECT count(*)
            FROM nodes AS n JOIN snapshots AS s ON s.id = n.snapshot_id
            WHERE s.status = 'failed'
            "#
        ),
        0
    );
}

fn git<const N: usize>(repository: &Path, args: [&str; N]) {
    let output = Command::new("git")
        .args(args)
        .current_dir(repository)
        .output()
        .expect("launch git");
    assert!(
        output.status.success(),
        "git failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn scalar(connection: &Connection, sql: &str) -> i64 {
    connection
        .query_row(sql, [], |row| row.get(0))
        .unwrap_or_else(|error| panic!("query failed: {error}\n{sql}"))
}

fn stable_keys(connection: &Connection) -> Vec<String> {
    let mut statement = connection
        .prepare("SELECT stable_key FROM nodes ORDER BY stable_key")
        .expect("stable key query");
    statement
        .query_map([], |row| row.get(0))
        .expect("stable key rows")
        .collect::<rusqlite::Result<Vec<_>>>()
        .expect("stable keys")
}

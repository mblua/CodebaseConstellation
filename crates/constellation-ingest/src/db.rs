use std::collections::HashMap;
use std::fs;
use std::path::Path;

use anyhow::{bail, Context, Result};
use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde_json::json;

use crate::git::RepositoryInfo;
use crate::model::Graph;

const MIGRATION_V1: &str = include_str!("../../../schema/migrations/0001_initial.sql");

#[derive(Debug)]
pub(crate) struct SnapshotInput<'a> {
    pub repository: &'a RepositoryInfo,
    pub content_hash: &'a str,
    pub tracked_file_count: usize,
    pub commit_issue_reference_count: usize,
    pub snapshot_attributes: serde_json::Value,
}

#[derive(Debug)]
pub(crate) struct PersistedSnapshot {
    pub snapshot_id: i64,
    pub node_count: usize,
    pub edge_count: usize,
}

pub(crate) fn persist_snapshot(
    database: &Path,
    input: &SnapshotInput<'_>,
    graph: &Graph,
) -> Result<PersistedSnapshot> {
    if let Some(parent) = database
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::create_dir_all(parent)
            .with_context(|| format!("cannot create database directory {}", parent.display()))?;
    }
    let mut connection = open_database(database)?;
    apply_or_verify_v1(&connection)?;
    let repository_id = upsert_repository(&connection, input.repository)?;
    let started_at = now();
    let snapshot_attributes = serde_json::to_string(&input.snapshot_attributes)?;
    let insert = connection.execute(
        r#"
        INSERT INTO snapshots (
            repository_id, revision, content_hash, status, history_mode,
            visible_commit_count, started_at, scanner_version, attributes_json
        ) VALUES (?, ?, ?, 'running', ?, ?, ?, ?, ?)
        "#,
        params![
            repository_id,
            input.repository.revision,
            input.content_hash,
            input.repository.history_mode(),
            input.repository.commits.len() as i64,
            started_at,
            env!("CARGO_PKG_VERSION"),
            snapshot_attributes,
        ],
    );
    if let Err(error) = insert {
        if let Some(existing) = connection
            .query_row(
                "SELECT id, status FROM snapshots WHERE repository_id = ? AND content_hash = ?",
                params![repository_id, input.content_hash],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?
        {
            bail!(
                "content is already represented by snapshot {} with status {}; snapshots are immutable",
                existing.0,
                existing.1
            );
        }
        return Err(error).context("cannot create running snapshot");
    }
    let snapshot_id = connection.last_insert_rowid();

    match write_graph_atomically(&mut connection, snapshot_id, input, graph) {
        Ok(()) => Ok(PersistedSnapshot {
            snapshot_id,
            node_count: graph.nodes.len(),
            edge_count: graph.edges.len(),
        }),
        Err(error) => {
            let failure = error.to_string();
            let _ = connection.execute(
                r#"
                UPDATE snapshots
                SET status = 'failed', completed_at = ?, attributes_json = ?
                WHERE id = ? AND status = 'running'
                "#,
                params![
                    now(),
                    serde_json::to_string(&json!({"failure": failure}))?,
                    snapshot_id,
                ],
            );
            Err(error).context(format!("snapshot {snapshot_id} failed atomically"))
        }
    }
}

fn open_database(path: &Path) -> Result<Connection> {
    let connection = Connection::open(path)
        .with_context(|| format!("cannot open SQLite database {}", path.display()))?;
    connection.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 5000;
        "#,
    )?;
    let enabled: i64 = connection.query_row("PRAGMA foreign_keys", [], |row| row.get(0))?;
    if enabled != 1 {
        bail!("SQLite foreign-key enforcement could not be enabled");
    }
    Ok(connection)
}

fn apply_or_verify_v1(connection: &Connection) -> Result<()> {
    let user_version: i64 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    match user_version {
        0 => connection
            .execute_batch(MIGRATION_V1)
            .context("cannot apply schema migration v1")?,
        1 => {}
        version => bail!("unsupported database schema version {version}; expected v1"),
    }
    let applied: Option<i64> = connection
        .query_row(
            "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .context("database does not contain the v1 migration ledger")?;
    if applied != Some(1) {
        bail!("schema_migrations does not report version 1");
    }
    let foreign_keys: i64 = connection.query_row("PRAGMA foreign_keys", [], |row| row.get(0))?;
    if foreign_keys != 1 {
        bail!("foreign keys must be enabled on every connection");
    }
    Ok(())
}

fn upsert_repository(connection: &Connection, repository: &RepositoryInfo) -> Result<i64> {
    let root_path = repository
        .root
        .to_str()
        .context("repository root is not valid UTF-8")?;
    connection.execute(
        r#"
        INSERT INTO repositories (
            stable_key, name, root_path, vcs_kind, remote_url, attributes_json
        ) VALUES (?, ?, ?, 'git', ?, ?)
        ON CONFLICT(stable_key) DO UPDATE SET
            name = excluded.name,
            root_path = excluded.root_path,
            remote_url = excluded.remote_url,
            attributes_json = excluded.attributes_json
        "#,
        params![
            repository.stable_key(),
            repository.name,
            root_path,
            repository.remote_url,
            serde_json::to_string(&json!({"scanner": "constellation-ingest"}))?,
        ],
    )?;
    connection
        .query_row(
            "SELECT id FROM repositories WHERE stable_key = ?",
            [repository.stable_key()],
            |row| row.get(0),
        )
        .context("cannot read repository id after upsert")
}

fn write_graph_atomically(
    connection: &mut Connection,
    snapshot_id: i64,
    input: &SnapshotInput<'_>,
    graph: &Graph,
) -> Result<()> {
    let transaction = connection.transaction()?;
    let node_ids = insert_nodes(&transaction, snapshot_id, graph)?;
    insert_edges(&transaction, snapshot_id, graph, &node_ids)?;
    insert_metrics(&transaction, snapshot_id, input, graph, &node_ids)?;
    insert_capabilities(&transaction, snapshot_id, graph)?;
    verify_graph_contract(&transaction, snapshot_id)?;
    let updated = transaction.execute(
        r#"
        UPDATE snapshots
        SET status = 'complete', completed_at = ?
        WHERE id = ? AND status = 'running'
        "#,
        params![now(), snapshot_id],
    )?;
    if updated != 1 {
        bail!("snapshot was not running at atomic finalization");
    }
    transaction.commit()?;
    Ok(())
}

fn insert_nodes(
    transaction: &Transaction<'_>,
    snapshot_id: i64,
    graph: &Graph,
) -> Result<HashMap<String, i64>> {
    let mut ids = HashMap::new();
    let mut statement = transaction.prepare_cached(
        r#"
        INSERT INTO nodes (
            snapshot_id, stable_key, kind, name, qualified_name, path, language,
            external, start_line, end_line, confidence, attributes_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
        "#,
    )?;
    for node in graph.nodes.values() {
        let id = statement.query_row(
            params![
                snapshot_id,
                node.stable_key,
                node.kind,
                node.name,
                node.qualified_name,
                node.path,
                node.language,
                i64::from(node.external),
                node.start_line.map(|value| value as i64),
                node.end_line.map(|value| value as i64),
                node.confidence,
                serde_json::to_string(&node.attributes)?,
            ],
            |row| row.get(0),
        )?;
        ids.insert(node.stable_key.clone(), id);
    }
    Ok(ids)
}

fn insert_edges(
    transaction: &Transaction<'_>,
    snapshot_id: i64,
    graph: &Graph,
    node_ids: &HashMap<String, i64>,
) -> Result<()> {
    let mut edge_statement = transaction.prepare_cached(
        r#"
        INSERT INTO edges (
            snapshot_id, stable_key, source_node_id, target_node_id, kind,
            weight, confidence, is_derived, attributes_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
        "#,
    )?;
    let mut evidence_statement = transaction.prepare_cached(
        r#"
        INSERT INTO edge_evidence (
            snapshot_id, edge_id, evidence_kind, file_node_id, start_line,
            end_line, commit_hash, issue_key, excerpt, attributes_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )?;
    for edge in graph.edges.values() {
        if (edge.confidence < 1.0 || edge.is_derived) && edge.evidence.is_empty() {
            bail!("edge {} requires evidence", edge.stable_key);
        }
        let source = node_ids
            .get(&edge.source_key)
            .with_context(|| format!("missing id for edge source {}", edge.source_key))?;
        let target = node_ids
            .get(&edge.target_key)
            .with_context(|| format!("missing id for edge target {}", edge.target_key))?;
        let edge_id: i64 = edge_statement.query_row(
            params![
                snapshot_id,
                edge.stable_key,
                source,
                target,
                edge.kind,
                edge.weight,
                edge.confidence,
                i64::from(edge.is_derived),
                serde_json::to_string(&edge.attributes)?,
            ],
            |row| row.get(0),
        )?;
        for item in &edge.evidence {
            let file_id = item
                .file_key
                .as_ref()
                .map(|key| {
                    node_ids
                        .get(key)
                        .copied()
                        .with_context(|| format!("missing evidence file node {key}"))
                })
                .transpose()?;
            evidence_statement.execute(params![
                snapshot_id,
                edge_id,
                item.kind,
                file_id,
                item.start_line.map(|value| value as i64),
                item.end_line.map(|value| value as i64),
                item.commit_hash,
                item.issue_key,
                item.excerpt,
                serde_json::to_string(&item.attributes)?,
            ])?;
        }
    }
    Ok(())
}

fn insert_metrics(
    transaction: &Transaction<'_>,
    snapshot_id: i64,
    input: &SnapshotInput<'_>,
    graph: &Graph,
    node_ids: &HashMap<String, i64>,
) -> Result<()> {
    let mut node_statement = transaction.prepare_cached(
        r#"
        INSERT INTO node_metrics (snapshot_id, node_id, key, value, unit, provenance)
        VALUES (?, ?, ?, ?, ?, ?)
        "#,
    )?;
    for metric in graph.node_metrics.values() {
        let node_id = node_ids
            .get(&metric.node_key)
            .with_context(|| format!("missing node for metric {}", metric.node_key))?;
        node_statement.execute(params![
            snapshot_id,
            node_id,
            metric.key,
            metric.value,
            metric.unit,
            metric.provenance,
        ])?;
    }

    let metrics = [
        (
            "tracked_file_count",
            input.tracked_file_count as f64,
            "files",
            "git-ls-files",
        ),
        (
            "visible_commit_count",
            input.repository.commits.len() as f64,
            "commits",
            "git-rev-list",
        ),
        (
            "commit_issue_reference_count",
            input.commit_issue_reference_count as f64,
            "references",
            "commit-message-regex",
        ),
        (
            "node_count",
            graph.nodes.len() as f64,
            "nodes",
            "constellation-ingest",
        ),
        (
            "edge_count",
            graph.edges.len() as f64,
            "edges",
            "constellation-ingest",
        ),
    ];
    for (key, value, unit, provenance) in metrics {
        transaction.execute(
            r#"
            INSERT INTO snapshot_metrics (snapshot_id, key, value, unit, provenance)
            VALUES (?, ?, ?, ?, ?)
            "#,
            params![snapshot_id, key, value, unit, provenance],
        )?;
    }
    Ok(())
}

fn insert_capabilities(
    transaction: &Transaction<'_>,
    snapshot_id: i64,
    graph: &Graph,
) -> Result<()> {
    let mut statement = transaction.prepare_cached(
        r#"
        INSERT INTO snapshot_capabilities (snapshot_id, capability, status, coverage, detail)
        VALUES (?, ?, ?, ?, ?)
        "#,
    )?;
    for (name, capability) in &graph.capabilities {
        statement.execute(params![
            snapshot_id,
            name,
            capability.status,
            capability.coverage,
            capability.detail,
        ])?;
    }
    Ok(())
}

fn verify_graph_contract(transaction: &Transaction<'_>, snapshot_id: i64) -> Result<()> {
    let containment_violations: i64 = transaction.query_row(
        r#"
        SELECT count(*)
        FROM (
            SELECT n.id
            FROM nodes AS n
            LEFT JOIN edges AS parent
              ON parent.snapshot_id = n.snapshot_id
             AND parent.target_node_id = n.id
             AND parent.kind = 'contains'
            WHERE n.snapshot_id = ? AND n.kind IN ('file', 'directory')
            GROUP BY n.id
            HAVING count(parent.id) <> 1
        )
        "#,
        [snapshot_id],
        |row| row.get(0),
    )?;
    if containment_violations != 0 {
        bail!("filesystem containment invariant failed for {containment_violations} nodes");
    }
    let invalid_keys: i64 = transaction.query_row(
        r#"
        SELECT count(*) FROM nodes
        WHERE snapshot_id = ?
          AND (stable_key LIKE '%\\%' OR path LIKE '%\\%' OR path LIKE './%' OR path LIKE '/%')
        "#,
        [snapshot_id],
        |row| row.get(0),
    )?;
    if invalid_keys != 0 {
        bail!("stable-key/path invariant failed for {invalid_keys} nodes");
    }
    let foreign_key_violations: i64 =
        transaction.query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })?;
    if foreign_key_violations != 0 {
        bail!("foreign-key check reported {foreign_key_violations} violations");
    }
    Ok(())
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

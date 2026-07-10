from __future__ import annotations

from pathlib import Path
import sqlite3


GRAPH_ANALYTICS_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = GRAPH_ANALYTICS_ROOT.parent
SEED_DATABASE = REPOSITORY_ROOT / "fixtures" / "seed.sqlite"
MIGRATION = REPOSITORY_ROOT / "schema" / "migrations" / "0001_initial.sql"


def _base_connection(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path)
    connection.execute("PRAGMA foreign_keys = ON")
    connection.executescript(MIGRATION.read_text(encoding="utf-8"))
    connection.execute(
        """
        INSERT INTO repositories (
            id, stable_key, name, root_path, vcs_kind, created_at, attributes_json
        ) VALUES (1, 'repo:test', 'test', '<test>', 'none', '2026-01-01T00:00:00.000Z', '{}')
        """
    )
    return connection


def create_minimal_database(path: Path, *, node_count: int) -> Path:
    if node_count not in (1, 2):
        raise ValueError("minimal helper supports one or two nodes")
    connection = _base_connection(path)
    try:
        connection.execute(
            """
            INSERT INTO snapshots (
                id, repository_id, revision, content_hash, status, history_mode,
                visible_commit_count, started_at, completed_at, scanner_version, attributes_json
            ) VALUES (
                1, 1, 'one', 'minimal:one', 'complete', 'absent', 0,
                '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:01.000Z', 'test-v1', '{}'
            )
            """
        )
        connection.execute(
            """
            INSERT INTO nodes (
                id, snapshot_id, stable_key, kind, name, external, confidence, attributes_json
            ) VALUES (1, 1, 'repo:test', 'repository', 'test', 0, 1.0, '{}')
            """
        )
        if node_count == 2:
            connection.execute(
                """
                INSERT INTO nodes (
                    id, snapshot_id, stable_key, kind, name, external, confidence, attributes_json
                ) VALUES (2, 1, 'external_system:detached', 'external_system', 'detached', 1, 1.0, '{}')
                """
            )
        connection.commit()
    finally:
        connection.close()
    return path


def create_two_snapshot_cycle_database(path: Path) -> Path:
    connection = _base_connection(path)
    try:
        for snapshot_id, suffix, started, completed in (
            (1, "one", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:01.000Z"),
            (2, "two", "2026-01-02T00:00:00.000Z", "2026-01-02T00:00:01.000Z"),
        ):
            connection.execute(
                """
                INSERT INTO snapshots (
                    id, repository_id, revision, content_hash, status, history_mode,
                    visible_commit_count, started_at, completed_at, scanner_version, attributes_json
                ) VALUES (?, 1, ?, ?, 'complete', 'absent', 0, ?, ?, 'test-v1', '{}')
                """,
                (snapshot_id, suffix, f"cycle:{suffix}", started, completed),
            )
        for snapshot_id, base in ((1, 0), (2, 100)):
            connection.executemany(
                """
                INSERT INTO nodes (
                    id, snapshot_id, stable_key, kind, name, external, confidence, attributes_json
                ) VALUES (?, ?, ?, 'package', ?, 0, 1.0, '{}')
                """,
                (
                    (base + 1, snapshot_id, "pkg:test:a", "a"),
                    (base + 2, snapshot_id, "pkg:test:b", "b"),
                ),
            )
            connection.executemany(
                """
                INSERT INTO edges (
                    id, snapshot_id, stable_key, source_node_id, target_node_id, kind,
                    weight, confidence, is_derived, attributes_json
                ) VALUES (?, ?, ?, ?, ?, 'depends_on', 1.0, 1.0, 0, '{}')
                """,
                (
                    (
                        base + 1,
                        snapshot_id,
                        "depends_on:pkg:test:a->pkg:test:b",
                        base + 1,
                        base + 2,
                    ),
                    (
                        base + 2,
                        snapshot_id,
                        "depends_on:pkg:test:b->pkg:test:a",
                        base + 2,
                        base + 1,
                    ),
                ),
            )
        connection.commit()
    finally:
        connection.close()
    return path

from __future__ import annotations

from dataclasses import asdict, dataclass
import json
from pathlib import Path
import sqlite3
from typing import Any

from .analytics import (
    OWNED_NODE_METRIC_KEYS,
    OWNED_SNAPSHOT_METRIC_KEYS,
    compute_analytics,
)
from .blobs import (
    EdgeRecord,
    PositionRecord,
    encode_edges,
    encode_positions,
    sha256_hex,
)
from .database import (
    connect_database,
    is_latest_complete_snapshot,
    load_previous_positions,
    load_snapshot_graph,
    resolve_snapshot_id,
    validate_contract,
)
from .findings import OWNED_FINDING_RULES, build_findings
from .layout import compute_layout, node_flags, node_radius
from .model import AnalyticsResult, ContractError, FindingCandidate, SnapshotGraph


LAYOUT_ALGORITHM = "forceatlas2-3d+leiden"


@dataclass(frozen=True, slots=True)
class RunConfig:
    database: Path
    snapshot_id: int | None = None
    repository_id: int | None = None
    layout_name: str = "architecture-v1"
    seed: int = 1
    iterations: int = 250


@dataclass(frozen=True, slots=True)
class RunSummary:
    database: str
    snapshot_id: int
    layout_id: int
    layout_name: str
    node_count: int
    edge_count: int
    component_count: int
    orphan_count: int
    node_metric_count: int
    snapshot_metric_count: int
    node_cycle_count: int
    package_cycle_count: int
    findings_materialized: int
    finding_threads_total: int
    cluster_count: int
    previous_snapshot_id: int | None
    previous_seed_count: int
    positions_records: int
    positions_bytes: int
    positions_sha256: str
    edge_records: int
    edge_bytes: int
    edges_sha256: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def _delete_owned_metrics(
    connection: sqlite3.Connection,
    graph: SnapshotGraph,
) -> None:
    node_keys = sorted(OWNED_NODE_METRIC_KEYS)
    snapshot_keys = sorted(OWNED_SNAPSHOT_METRIC_KEYS)
    connection.execute(
        f"DELETE FROM node_metrics WHERE snapshot_id = ? AND key IN ({','.join('?' for _ in node_keys)})",
        (graph.snapshot_id, *node_keys),
    )
    connection.execute(
        f"DELETE FROM snapshot_metrics WHERE snapshot_id = ? AND key IN ({','.join('?' for _ in snapshot_keys)})",
        (graph.snapshot_id, *snapshot_keys),
    )


def _write_metrics(
    connection: sqlite3.Connection,
    graph: SnapshotGraph,
    analytics: AnalyticsResult,
) -> None:
    _delete_owned_metrics(connection, graph)
    seen_node_metrics: set[tuple[int, str]] = set()
    node_rows: list[tuple[Any, ...]] = []
    for metric in analytics.node_metrics:
        identity = (metric.node_id, metric.key)
        if identity in seen_node_metrics:
            raise ContractError(f"analytics produced duplicate node metric {identity}")
        seen_node_metrics.add(identity)
        node_rows.append(
            (
                graph.snapshot_id,
                metric.node_id,
                metric.key,
                metric.value,
                metric.unit,
                metric.provenance,
            )
        )
    connection.executemany(
        """
        INSERT INTO node_metrics (snapshot_id, node_id, key, value, unit, provenance)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        node_rows,
    )
    connection.executemany(
        """
        INSERT INTO snapshot_metrics (snapshot_id, key, value, unit, provenance)
        VALUES (?, ?, ?, ?, ?)
        """,
        [
            (
                graph.snapshot_id,
                metric.key,
                metric.value,
                metric.unit,
                metric.provenance,
            )
            for metric in analytics.snapshot_metrics
        ],
    )


def _delete_current_owned_occurrences(
    connection: sqlite3.Connection,
    graph: SnapshotGraph,
) -> None:
    rules = sorted(OWNED_FINDING_RULES)
    connection.execute(
        f"""
        DELETE FROM finding_occurrences
        WHERE snapshot_id = ?
          AND finding_id IN (
              SELECT id
              FROM finding_threads
              WHERE repository_id = ?
                AND rule_key IN ({",".join("?" for _ in rules)})
          )
        """,
        (graph.snapshot_id, graph.repository_id, *rules),
    )


def _upsert_finding_thread(
    connection: sqlite3.Connection,
    graph: SnapshotGraph,
    finding: FindingCandidate,
    *,
    latest_snapshot: bool,
) -> int:
    row = connection.execute(
        """
        SELECT id, status, first_seen_at, last_seen_at
        FROM finding_threads
        WHERE repository_id = ? AND fingerprint = ?
        """,
        (graph.repository_id, finding.fingerprint),
    ).fetchone()
    if row is None:
        cursor = connection.execute(
            """
            INSERT INTO finding_threads (
                repository_id, fingerprint, rule_key, category, severity, status,
                title, recommendation, first_seen_at, last_seen_at, attributes_json
            ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)
            """,
            (
                graph.repository_id,
                finding.fingerprint,
                finding.rule_key,
                finding.category,
                finding.severity,
                finding.title,
                finding.recommendation,
                graph.observed_at,
                graph.observed_at,
                _json(finding.attributes),
            ),
        )
        return int(cursor.lastrowid)

    finding_id = int(row["id"])
    status = str(row["status"])
    if latest_snapshot and status == "resolved":
        status = "open"
    first_seen = min(str(row["first_seen_at"]), graph.observed_at)
    last_seen = max(str(row["last_seen_at"]), graph.observed_at)
    connection.execute(
        """
        UPDATE finding_threads
        SET rule_key = ?, category = ?, severity = ?, status = ?, title = ?,
            recommendation = ?, first_seen_at = ?, last_seen_at = ?, attributes_json = ?
        WHERE id = ?
        """,
        (
            finding.rule_key,
            finding.category,
            finding.severity,
            status,
            finding.title,
            finding.recommendation,
            first_seen,
            last_seen,
            _json(finding.attributes),
            finding_id,
        ),
    )
    return finding_id


def _write_findings(
    connection: sqlite3.Connection,
    graph: SnapshotGraph,
    findings: list[FindingCandidate],
    *,
    latest_snapshot: bool,
) -> None:
    _delete_current_owned_occurrences(connection, graph)
    observed_fingerprints: list[str] = []
    for finding in findings:
        finding_id = _upsert_finding_thread(
            connection,
            graph,
            finding,
            latest_snapshot=latest_snapshot,
        )
        observed_fingerprints.append(finding.fingerprint)
        connection.execute(
            """
            INSERT INTO finding_occurrences (
                finding_id, snapshot_id, detail, observed_at, attributes_json
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (
                finding_id,
                graph.snapshot_id,
                finding.detail,
                graph.observed_at,
                _json(finding.attributes),
            ),
        )
        connection.executemany(
            """
            INSERT INTO finding_nodes (finding_id, snapshot_id, node_id, role)
            VALUES (?, ?, ?, ?)
            """,
            [
                (finding_id, graph.snapshot_id, node_id, role)
                for node_id, role in finding.nodes
            ],
        )
        connection.executemany(
            """
            INSERT INTO finding_edges (finding_id, snapshot_id, edge_id, role)
            VALUES (?, ?, ?, ?)
            """,
            [
                (finding_id, graph.snapshot_id, edge_id, role)
                for edge_id, role in finding.edges
            ],
        )

    if latest_snapshot:
        rules = sorted(OWNED_FINDING_RULES)
        parameters: list[Any] = [graph.repository_id, *rules]
        exclusion = ""
        if observed_fingerprints:
            exclusion = f"AND fingerprint NOT IN ({','.join('?' for _ in observed_fingerprints)})"
            parameters.extend(observed_fingerprints)
        connection.execute(
            f"""
            UPDATE finding_threads
            SET status = 'resolved'
            WHERE repository_id = ?
              AND rule_key IN ({",".join("?" for _ in rules)})
              AND status IN ('open', 'acknowledged')
              {exclusion}
            """,
            parameters,
        )


def _ensure_layout(
    connection: sqlite3.Connection,
    graph: SnapshotGraph,
    layout_name: str,
) -> int:
    row = connection.execute(
        "SELECT id FROM layouts WHERE snapshot_id = ? AND name = ?",
        (graph.snapshot_id, layout_name),
    ).fetchone()
    if row is not None:
        layout_id = int(row["id"])
        connection.execute(
            """
            UPDATE layouts
            SET algorithm = ?, dimensions = 3, status = 'running',
                coordinate_system = 'cartesian-right-handed'
            WHERE id = ?
            """,
            (LAYOUT_ALGORITHM, layout_id),
        )
        return layout_id
    cursor = connection.execute(
        """
        INSERT INTO layouts (
            snapshot_id, name, algorithm, dimensions, status, coordinate_system,
            parameters_json, bounds_json, node_count, edge_count
        ) VALUES (?, ?, ?, 3, 'running', 'cartesian-right-handed', '{}', '{}', 0, 0)
        """,
        (graph.snapshot_id, layout_name, LAYOUT_ALGORITHM),
    )
    return int(cursor.lastrowid)


def _snapshot_metric_value(analytics: AnalyticsResult, key: str) -> int:
    for metric in analytics.snapshot_metrics:
        if metric.key == key:
            return int(metric.value)
    raise ContractError(f"missing expected snapshot metric {key}")


def run_pipeline(config: RunConfig) -> RunSummary:
    if not config.layout_name.strip():
        raise ValueError("layout name must not be empty")
    if config.seed < 0:
        raise ValueError("seed must be non-negative")
    if config.iterations < 1:
        raise ValueError("iterations must be at least 1")

    connection = connect_database(config.database)
    try:
        validate_contract(connection)
        snapshot_id = resolve_snapshot_id(
            connection,
            snapshot_id=config.snapshot_id,
            repository_id=config.repository_id,
        )
        graph = load_snapshot_graph(connection, config.database, snapshot_id)
        previous = load_previous_positions(connection, graph, config.layout_name)
        latest_snapshot = is_latest_complete_snapshot(connection, graph)

        analytics = compute_analytics(graph, seed=config.seed)
        findings = build_findings(graph, analytics)
        layout = compute_layout(
            graph,
            analytics.package_by_node_id,
            previous,
            seed=config.seed,
            iterations=config.iterations,
        )

        connection.execute("BEGIN IMMEDIATE")
        try:
            layout_id = _ensure_layout(connection, graph, config.layout_name)
            dense = graph.dense_index_by_id
            position_records = [
                PositionRecord(
                    node_id=node.id,
                    x=layout.coordinates_by_node_id[node.id][0],
                    y=layout.coordinates_by_node_id[node.id][1],
                    z=layout.coordinates_by_node_id[node.id][2],
                    radius=node_radius(node.kind),
                    kind_code=node.render_code,
                    flags=node_flags(
                        category=node.category,
                        external=node.external,
                        synthetic=node.attributes.get("synthetic") is True,
                    ),
                    cluster_id=layout.cluster_by_node_id[node.id],
                )
                for node in graph.nodes
            ]
            edge_records = [
                EdgeRecord(
                    edge_id=edge.id,
                    source_index=dense[edge.source_id],
                    target_index=dense[edge.target_id],
                    kind_code=edge.render_code,
                    flags=(1 if edge.directed else 0) | (2 if edge.derived else 0),
                    weight=edge.weight,
                )
                for edge in graph.edges
            ]
            positions_blob = encode_positions(
                graph.snapshot_id, layout_id, position_records
            )
            edge_blob = encode_edges(
                graph.snapshot_id,
                layout_id,
                len(position_records),
                edge_records,
            )
            positions_digest = sha256_hex(positions_blob)
            edges_digest = sha256_hex(edge_blob)

            _write_metrics(connection, graph, analytics)
            _write_findings(
                connection,
                graph,
                findings,
                latest_snapshot=latest_snapshot,
            )
            connection.execute(
                "DELETE FROM graph_blobs WHERE layout_id = ?", (layout_id,)
            )
            connection.executemany(
                """
                INSERT INTO graph_blobs (
                    layout_id, kind, format_version, byte_order, compression,
                    record_count, byte_length, sha256_hex, content
                ) VALUES (?, ?, 1, 'little', 'none', ?, ?, ?, ?)
                """,
                (
                    (
                        layout_id,
                        "positions",
                        len(position_records),
                        len(positions_blob),
                        positions_digest,
                        positions_blob,
                    ),
                    (
                        layout_id,
                        "edges",
                        len(edge_records),
                        len(edge_blob),
                        edges_digest,
                        edge_blob,
                    ),
                ),
            )
            connection.execute(
                """
                UPDATE layouts
                SET algorithm = ?, dimensions = 3, status = 'complete',
                    coordinate_system = 'cartesian-right-handed',
                    parameters_json = ?, bounds_json = ?, node_count = ?, edge_count = ?
                WHERE id = ?
                """,
                (
                    LAYOUT_ALGORITHM,
                    _json(layout.parameters),
                    _json(layout.bounds),
                    len(graph.nodes),
                    len(graph.edges),
                    layout_id,
                ),
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise

        finding_threads_total = int(
            connection.execute(
                "SELECT count(*) FROM finding_threads WHERE repository_id = ?",
                (graph.repository_id,),
            ).fetchone()[0]
        )
        return RunSummary(
            database=str(config.database.resolve()),
            snapshot_id=graph.snapshot_id,
            layout_id=layout_id,
            layout_name=config.layout_name,
            node_count=len(graph.nodes),
            edge_count=len(graph.edges),
            component_count=_snapshot_metric_value(analytics, "graph.component_count"),
            orphan_count=_snapshot_metric_value(analytics, "graph.orphan_count"),
            node_metric_count=len(analytics.node_metrics),
            snapshot_metric_count=len(analytics.snapshot_metrics),
            node_cycle_count=len(analytics.node_cycles),
            package_cycle_count=len(analytics.package_cycles),
            findings_materialized=len(findings),
            finding_threads_total=finding_threads_total,
            cluster_count=len(set(layout.cluster_by_node_id.values())),
            previous_snapshot_id=layout.previous_snapshot_id,
            previous_seed_count=layout.previous_seed_count,
            positions_records=len(position_records),
            positions_bytes=len(positions_blob),
            positions_sha256=positions_digest,
            edge_records=len(edge_records),
            edge_bytes=len(edge_blob),
            edges_sha256=edges_digest,
        )
    finally:
        connection.close()

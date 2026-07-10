from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import sqlite3

from .blobs import decode_positions
from .model import ContractError, Edge, Node, SnapshotGraph


REQUIRED_TABLES = {
    "schema_migrations",
    "repositories",
    "snapshots",
    "snapshot_capabilities",
    "node_kinds",
    "edge_kinds",
    "nodes",
    "edges",
    "node_metrics",
    "snapshot_metrics",
    "layouts",
    "graph_blobs",
    "finding_threads",
    "finding_occurrences",
    "finding_nodes",
    "finding_edges",
}


@dataclass(frozen=True, slots=True)
class PreviousPositions:
    snapshot_id: int
    layout_id: int
    coordinates_by_stable_key: dict[str, tuple[float, float, float]]


def connect_database(path: Path) -> sqlite3.Connection:
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        raise ContractError(f"database does not exist: {resolved}")
    connection = sqlite3.connect(resolved, timeout=30.0)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 30000")
    return connection


def validate_contract(connection: sqlite3.Connection) -> None:
    version = int(connection.execute("PRAGMA user_version").fetchone()[0])
    if version != 1:
        raise ContractError(
            f"expected SQLite contract v1, found user_version={version}"
        )
    migration = connection.execute(
        "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1"
    ).fetchone()
    if migration is None or int(migration[0]) != 1:
        raise ContractError("schema_migrations does not report contract v1")
    present = {
        str(row[0])
        for row in connection.execute(
            "SELECT name FROM sqlite_schema WHERE type = 'table'"
        )
    }
    missing = sorted(REQUIRED_TABLES - present)
    if missing:
        raise ContractError(f"contract v1 tables are missing: {', '.join(missing)}")
    violations = connection.execute("PRAGMA foreign_key_check").fetchall()
    if violations:
        raise ContractError(
            f"input database has foreign-key violations: {violations[:3]}"
        )


def resolve_snapshot_id(
    connection: sqlite3.Connection,
    *,
    snapshot_id: int | None,
    repository_id: int | None,
) -> int:
    if snapshot_id is not None:
        row = connection.execute(
            "SELECT id, repository_id, status FROM snapshots WHERE id = ?",
            (snapshot_id,),
        ).fetchone()
        if row is None:
            raise ContractError(f"snapshot {snapshot_id} does not exist")
        if repository_id is not None and int(row["repository_id"]) != repository_id:
            raise ContractError(
                f"snapshot {snapshot_id} does not belong to repository {repository_id}"
            )
        if str(row["status"]) != "complete":
            raise ContractError(f"snapshot {snapshot_id} is not complete")
        return snapshot_id

    query = """
        SELECT id
        FROM snapshots
        WHERE status = 'complete'
          AND (? IS NULL OR repository_id = ?)
        ORDER BY started_at DESC, id DESC
        LIMIT 1
    """
    row = connection.execute(query, (repository_id, repository_id)).fetchone()
    if row is None:
        scope = (
            "the database" if repository_id is None else f"repository {repository_id}"
        )
        raise ContractError(f"no complete snapshot exists for {scope}")
    return int(row[0])


def load_snapshot_graph(
    connection: sqlite3.Connection,
    database: Path,
    snapshot_id: int,
) -> SnapshotGraph:
    snapshot = connection.execute(
        """
        SELECT id, repository_id, started_at, completed_at, content_hash, status
        FROM snapshots
        WHERE id = ?
        """,
        (snapshot_id,),
    ).fetchone()
    if snapshot is None or str(snapshot["status"]) != "complete":
        raise ContractError(f"snapshot {snapshot_id} is missing or incomplete")

    nodes: list[Node] = []
    for row in connection.execute(
        """
        SELECT n.id, n.stable_key, n.kind, n.name, n.path, n.external,
               n.attributes_json, k.category, k.render_code
        FROM nodes AS n
        JOIN node_kinds AS k ON k.key = n.kind
        WHERE n.snapshot_id = ?
        ORDER BY n.id
        """,
        (snapshot_id,),
    ):
        try:
            attributes = json.loads(str(row["attributes_json"]))
        except (TypeError, ValueError) as error:
            raise ContractError(
                f"node {row['id']} has invalid attributes_json"
            ) from error
        if not isinstance(attributes, dict):
            raise ContractError(f"node {row['id']} attributes_json is not an object")
        nodes.append(
            Node(
                id=int(row["id"]),
                stable_key=str(row["stable_key"]),
                kind=str(row["kind"]),
                category=str(row["category"]),
                render_code=int(row["render_code"]),
                name=str(row["name"]),
                path=None if row["path"] is None else str(row["path"]),
                external=bool(row["external"]),
                attributes=attributes,
            )
        )

    node_ids = {node.id for node in nodes}
    edges: list[Edge] = []
    for row in connection.execute(
        """
        SELECT e.id, e.stable_key, e.source_node_id, e.target_node_id, e.kind,
               e.weight, e.confidence, e.is_derived,
               k.category, k.render_code, k.directed
        FROM edges AS e
        JOIN edge_kinds AS k ON k.key = e.kind
        WHERE e.snapshot_id = ?
        ORDER BY e.id
        """,
        (snapshot_id,),
    ):
        source_id = int(row["source_node_id"])
        target_id = int(row["target_node_id"])
        if source_id not in node_ids or target_id not in node_ids:
            raise ContractError(
                f"edge {row['id']} references a node outside the snapshot"
            )
        edges.append(
            Edge(
                id=int(row["id"]),
                stable_key=str(row["stable_key"]),
                source_id=source_id,
                target_id=target_id,
                kind=str(row["kind"]),
                category=str(row["category"]),
                render_code=int(row["render_code"]),
                directed=bool(row["directed"]),
                weight=float(row["weight"]),
                confidence=float(row["confidence"]),
                derived=bool(row["is_derived"]),
            )
        )

    capabilities = {
        str(row["capability"]): str(row["status"])
        for row in connection.execute(
            "SELECT capability, status FROM snapshot_capabilities WHERE snapshot_id = ?",
            (snapshot_id,),
        )
    }
    return SnapshotGraph(
        database=database.resolve(),
        snapshot_id=snapshot_id,
        repository_id=int(snapshot["repository_id"]),
        started_at=str(snapshot["started_at"]),
        observed_at=str(snapshot["completed_at"]),
        content_hash=str(snapshot["content_hash"]),
        nodes=tuple(nodes),
        edges=tuple(edges),
        capabilities=capabilities,
    )


def load_previous_positions(
    connection: sqlite3.Connection,
    graph: SnapshotGraph,
    layout_name: str,
) -> PreviousPositions | None:
    row = connection.execute(
        """
        SELECT l.id AS layout_id, l.snapshot_id, b.format_version, b.byte_order,
               b.compression, b.record_count, b.byte_length, b.sha256_hex, b.content
        FROM snapshots AS current
        JOIN snapshots AS previous
          ON previous.repository_id = current.repository_id
         AND previous.status = 'complete'
         AND (
              previous.started_at < current.started_at
              OR (previous.started_at = current.started_at AND previous.id < current.id)
         )
        JOIN layouts AS l
          ON l.snapshot_id = previous.id
         AND l.name = ?
         AND l.status = 'complete'
        JOIN graph_blobs AS b
          ON b.layout_id = l.id
         AND b.kind = 'positions'
        WHERE current.id = ?
        ORDER BY previous.started_at DESC, previous.id DESC
        LIMIT 1
        """,
        (layout_name, graph.snapshot_id),
    ).fetchone()
    if row is None:
        return None
    if (
        int(row["format_version"]) != 1
        or str(row["byte_order"]) != "little"
        or str(row["compression"]) != "none"
    ):
        raise ContractError("previous positions blob uses unsupported metadata")
    content = bytes(row["content"])
    if len(content) != int(row["byte_length"]):
        raise ContractError("previous positions byte_length mismatch")
    decoded = decode_positions(
        content,
        expected_snapshot_id=int(row["snapshot_id"]),
        expected_layout_id=int(row["layout_id"]),
        expected_sha256=str(row["sha256_hex"]),
    )
    if len(decoded.records) != int(row["record_count"]):
        raise ContractError("previous positions record_count mismatch")
    expected_nodes = {
        int(candidate["id"]): candidate
        for candidate in connection.execute(
            """
            SELECT n.id, n.stable_key, n.external, n.attributes_json,
                   k.render_code, k.category
            FROM nodes AS n
            JOIN node_kinds AS k ON k.key = n.kind
            WHERE n.snapshot_id = ?
            """,
            (decoded.snapshot_id,),
        )
    }
    coordinates: dict[str, tuple[float, float, float]] = {}
    for record in decoded.records:
        candidate = expected_nodes.get(record.node_id)
        if candidate is None:
            raise ContractError(
                f"previous positions references unknown node {record.node_id}"
            )
        try:
            attributes = json.loads(str(candidate["attributes_json"]))
        except (TypeError, ValueError) as error:
            raise ContractError(
                f"previous node {record.node_id} has invalid attributes_json"
            ) from error
        expected_flags = int(bool(candidate["external"]))
        expected_flags |= 2 if str(candidate["category"]) == "semantic" else 0
        expected_flags |= 4 if str(candidate["category"]) == "change" else 0
        expected_flags |= (
            8
            if isinstance(attributes, dict) and attributes.get("synthetic") is True
            else 0
        )
        if record.kind_code != int(candidate["render_code"]):
            raise ContractError(f"previous node {record.node_id} kind code mismatch")
        if record.flags != expected_flags:
            raise ContractError(f"previous node {record.node_id} flag mismatch")
        stable_key = str(candidate["stable_key"])
        coordinates[stable_key] = (record.x, record.y, record.z)
    if len(coordinates) != len(expected_nodes):
        raise ContractError("previous positions does not contain every previous node")
    return PreviousPositions(decoded.snapshot_id, decoded.layout_id, coordinates)


def is_latest_complete_snapshot(
    connection: sqlite3.Connection, graph: SnapshotGraph
) -> bool:
    row = connection.execute(
        """
        SELECT id
        FROM snapshots
        WHERE repository_id = ? AND status = 'complete'
        ORDER BY started_at DESC, id DESC
        LIMIT 1
        """,
        (graph.repository_id,),
    ).fetchone()
    return row is not None and int(row[0]) == graph.snapshot_id

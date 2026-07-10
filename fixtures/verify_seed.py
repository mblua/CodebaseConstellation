from __future__ import annotations

import hashlib
import math
from pathlib import Path
import sqlite3
import struct
import sys


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATABASE = ROOT / "fixtures" / "seed.sqlite"
POSITION_HEADER = struct.Struct("<4sHHIBBHQQ")
POSITION_RECORD = struct.Struct("<QffffHHI")
EDGE_HEADER = struct.Struct("<4sHHIHHQQ")
EDGE_RECORD = struct.Struct("<QIIHHf")


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _validate_positions(connection: sqlite3.Connection, row: sqlite3.Row) -> tuple[list[int], int, int]:
    content = bytes(row["content"])
    _require(len(content) == int(row["byte_length"]), "positions byte_length mismatch")
    _require(hashlib.sha256(content).hexdigest() == row["sha256_hex"], "positions SHA-256 mismatch")
    _require(len(content) >= POSITION_HEADER.size, "positions header is truncated")
    magic, version, header_bytes, count, dimensions, scalar, flags, snapshot_id, layout_id = POSITION_HEADER.unpack_from(content)
    _require(magic == b"CCP1", "positions magic mismatch")
    _require(version == 1 and int(row["format_version"]) == 1, "positions version mismatch")
    _require(header_bytes == POSITION_HEADER.size, "positions header size mismatch")
    _require(dimensions == 3 and scalar == 1 and flags == 0, "unsupported positions header")
    _require(count == int(row["record_count"]), "positions record count mismatch")
    _require(len(content) == header_bytes + count * POSITION_RECORD.size, "positions size equation failed")
    _require(layout_id == int(row["layout_id"]), "positions layout id mismatch")
    _require(snapshot_id == int(row["snapshot_id"]), "positions snapshot id mismatch")

    expected = {
        int(candidate["id"]): (int(candidate["render_code"]), str(candidate["category"]), int(candidate["external"]))
        for candidate in connection.execute(
            """
            SELECT n.id, k.render_code, k.category, n.external
            FROM nodes AS n JOIN node_kinds AS k ON k.key = n.kind
            WHERE n.snapshot_id = ?
            """,
            (snapshot_id,),
        )
    }
    node_ids: list[int] = []
    for index in range(count):
        offset = header_bytes + index * POSITION_RECORD.size
        node_id, x, y, z, radius, kind_code, node_flags, _cluster_id = POSITION_RECORD.unpack_from(content, offset)
        _require(node_id in expected, f"positions references unknown node {node_id}")
        expected_code, category, external = expected[node_id]
        _require(kind_code == expected_code, f"node {node_id} kind code mismatch")
        _require(all(math.isfinite(value) for value in (x, y, z, radius)), f"node {node_id} has non-finite position")
        _require(radius > 0.0, f"node {node_id} radius is not positive")
        _require(bool(node_flags & 1) == bool(external), f"node {node_id} external flag mismatch")
        _require(bool(node_flags & 2) == (category == "semantic"), f"node {node_id} semantic flag mismatch")
        _require(bool(node_flags & 4) == (category == "change"), f"node {node_id} change flag mismatch")
        _require(node_flags & ~0x0F == 0, f"node {node_id} uses reserved flags")
        node_ids.append(node_id)
    _require(len(node_ids) == len(set(node_ids)) == len(expected), "positions must contain every node exactly once")
    return node_ids, snapshot_id, layout_id


def _validate_edges(
    connection: sqlite3.Connection,
    row: sqlite3.Row,
    node_ids: list[int],
    expected_snapshot_id: int,
    expected_layout_id: int,
) -> None:
    content = bytes(row["content"])
    _require(len(content) == int(row["byte_length"]), "edges byte_length mismatch")
    _require(hashlib.sha256(content).hexdigest() == row["sha256_hex"], "edges SHA-256 mismatch")
    _require(len(content) >= EDGE_HEADER.size, "edges header is truncated")
    magic, version, header_bytes, count, record_bytes, flags, snapshot_id, layout_id = EDGE_HEADER.unpack_from(content)
    _require(magic == b"CCE1", "edges magic mismatch")
    _require(version == 1 and int(row["format_version"]) == 1, "edges version mismatch")
    _require(header_bytes == EDGE_HEADER.size and record_bytes == EDGE_RECORD.size, "edge size metadata mismatch")
    _require(flags == 0, "unsupported edge header flags")
    _require(count == int(row["record_count"]), "edges record count mismatch")
    _require(len(content) == header_bytes + count * record_bytes, "edges size equation failed")
    _require(snapshot_id == expected_snapshot_id == int(row["snapshot_id"]), "edges snapshot id mismatch")
    _require(layout_id == expected_layout_id == int(row["layout_id"]), "edges layout id mismatch")

    expected = {
        int(candidate["id"]): candidate
        for candidate in connection.execute(
            """
            SELECT e.id, e.source_node_id, e.target_node_id, e.weight, e.is_derived,
                   k.render_code, k.directed
            FROM edges AS e JOIN edge_kinds AS k ON k.key = e.kind
            WHERE e.snapshot_id = ?
            """,
            (snapshot_id,),
        )
    }
    seen: set[int] = set()
    for index in range(count):
        offset = header_bytes + index * record_bytes
        edge_id, source_index, target_index, kind_code, edge_flags, weight = EDGE_RECORD.unpack_from(content, offset)
        _require(edge_id in expected, f"edge blob references unknown edge {edge_id}")
        _require(source_index < len(node_ids) and target_index < len(node_ids), f"edge {edge_id} index out of range")
        candidate = expected[edge_id]
        _require(node_ids[source_index] == int(candidate["source_node_id"]), f"edge {edge_id} source mismatch")
        _require(node_ids[target_index] == int(candidate["target_node_id"]), f"edge {edge_id} target mismatch")
        _require(kind_code == int(candidate["render_code"]), f"edge {edge_id} kind code mismatch")
        expected_flags = (1 if int(candidate["directed"]) else 0) | (2 if int(candidate["is_derived"]) else 0)
        _require(edge_flags == expected_flags, f"edge {edge_id} flags mismatch")
        _require(math.isfinite(weight) and weight >= 0.0, f"edge {edge_id} has invalid weight")
        _require(math.isclose(weight, float(candidate["weight"]), rel_tol=1e-6), f"edge {edge_id} weight mismatch")
        seen.add(edge_id)
    _require(seen == set(expected), "edge blob must contain every edge exactly once")


def verify_database(path: Path = DEFAULT_DATABASE, *, verbose: bool = True) -> dict[str, int]:
    path = path.resolve()
    _require(path.is_file(), f"database not found: {path}")
    connection = sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute("PRAGMA foreign_keys = ON")
        _require(connection.execute("PRAGMA user_version").fetchone()[0] == 1, "PRAGMA user_version must be 1")
        migration = connection.execute("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").fetchone()
        _require(migration is not None and migration[0] == 1, "schema_migrations must report v1")
        _require(not connection.execute("PRAGMA foreign_key_check").fetchall(), "foreign-key violations found")

        filesystem_orphans = connection.execute(
            """
            SELECT n.id
            FROM nodes AS n
            LEFT JOIN edges AS parent
              ON parent.snapshot_id = n.snapshot_id
             AND parent.target_node_id = n.id
             AND parent.kind = 'contains'
            WHERE n.kind IN ('file', 'directory')
            GROUP BY n.snapshot_id, n.id
            HAVING count(parent.id) <> 1
            """
        ).fetchall()
        _require(not filesystem_orphans, f"filesystem containment violations: {filesystem_orphans}")
        invalid_containment = connection.execute(
            """
            SELECT e.id
            FROM edges AS e
            JOIN nodes AS source ON source.id = e.source_node_id AND source.snapshot_id = e.snapshot_id
            JOIN nodes AS target ON target.id = e.target_node_id AND target.snapshot_id = e.snapshot_id
            WHERE e.kind = 'contains'
              AND (source.kind NOT IN ('repository', 'directory') OR target.kind NOT IN ('directory', 'file'))
            """
        ).fetchall()
        _require(not invalid_containment, f"invalid contains edges: {invalid_containment}")
        missing_evidence = connection.execute(
            """
            SELECT e.id
            FROM edges AS e
            WHERE (e.confidence < 1.0 OR e.is_derived = 1)
              AND NOT EXISTS (SELECT 1 FROM edge_evidence AS ev WHERE ev.edge_id = e.id AND ev.snapshot_id = e.snapshot_id)
            """
        ).fetchall()
        _require(not missing_evidence, f"low-confidence or derived edges without evidence: {missing_evidence}")
        touch_count = int(connection.execute("SELECT count(*) FROM edges WHERE kind = 'touches'").fetchone()[0])
        _require(touch_count > 0, "fixture must exercise touches edges")
        touch_capability = connection.execute(
            "SELECT status FROM snapshot_capabilities WHERE snapshot_id = 1 AND capability = 'issue_file_touches'"
        ).fetchone()
        _require(touch_capability is not None and touch_capability[0] in ("available", "degraded"), "touch capability missing")

        blobs = {
            str(row["kind"]): row
            for row in connection.execute(
                """
                SELECT b.*, l.snapshot_id
                FROM graph_blobs AS b JOIN layouts AS l ON l.id = b.layout_id
                WHERE b.layout_id = 1
                """
            )
        }
        _require(set(blobs) == {"positions", "edges"}, "fixture requires positions and edges blobs")
        node_ids, snapshot_id, layout_id = _validate_positions(connection, blobs["positions"])
        _validate_edges(connection, blobs["edges"], node_ids, snapshot_id, layout_id)

        nodes = int(connection.execute("SELECT count(*) FROM nodes").fetchone()[0])
        edges = int(connection.execute("SELECT count(*) FROM edges").fetchone()[0])
        findings = int(connection.execute("SELECT count(*) FROM finding_threads").fetchone()[0])
        layout = connection.execute("SELECT node_count, edge_count FROM layouts WHERE id = 1").fetchone()
        _require(layout is not None and int(layout[0]) == nodes and int(layout[1]) == edges, "layout counts mismatch")
        _require(findings > 0, "fixture must include actionable findings")
        result = {"nodes": nodes, "edges": edges, "findings": findings, "touches": touch_count}
        if verbose:
            try:
                display_path = path.relative_to(ROOT)
            except ValueError:
                display_path = path
            print(
                f"verified {display_path}: {nodes} nodes, {edges} edges, "
                f"{touch_count} touches, {findings} findings, 2 valid blobs"
            )
        return result
    finally:
        connection.close()


if __name__ == "__main__":
    database = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DATABASE
    verify_database(database)

from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
import sqlite3
import struct
import sys

sys.dont_write_bytecode = True
from verify_seed import verify_database


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "schema" / "migrations" / "0001_initial.sql"
SEED_SQL = ROOT / "fixtures" / "seed.sql"
OUTPUT = ROOT / "fixtures" / "seed.sqlite"

POSITION_HEADER = struct.Struct("<4sHHIBBHQQ")
POSITION_RECORD = struct.Struct("<QffffHHI")
EDGE_HEADER = struct.Struct("<4sHHIHHQQ")
EDGE_RECORD = struct.Struct("<QIIHHf")


def _cluster_map(connection: sqlite3.Connection, nodes: list[sqlite3.Row]) -> dict[int, int]:
    grouped: dict[int, int] = {}
    package_rows = connection.execute(
        "SELECT id FROM nodes WHERE snapshot_id = 1 AND kind = 'package' ORDER BY stable_key"
    ).fetchall()
    for cluster_id, row in enumerate(package_rows, start=1):
        package_id = int(row[0])
        grouped[package_id] = cluster_id
        for target in connection.execute(
            "SELECT target_node_id FROM edges WHERE snapshot_id = 1 AND kind = 'groups' AND source_node_id = ?",
            (package_id,),
        ):
            grouped[int(target[0])] = cluster_id

    top_levels: dict[str, int] = {}
    next_cluster = len(package_rows) + 1
    for node in nodes:
        node_id = int(node["id"])
        if node_id in grouped:
            continue
        path = node["path"]
        if path:
            top = str(path).split("/", 1)[0]
            if top not in top_levels:
                top_levels[top] = next_cluster
                next_cluster += 1
            grouped[node_id] = top_levels[top]
            continue
        category = str(node["category"])
        key = f"category:{category}"
        if key not in top_levels:
            top_levels[key] = next_cluster
            next_cluster += 1
        grouped[node_id] = top_levels[key]
    return grouped


def _node_radius(kind: str) -> float:
    return {
        "repository": 1.25,
        "directory": 0.82,
        "package": 0.95,
        "file": 0.48,
        "module": 0.52,
        "symbol": 0.36,
        "actor": 0.90,
        "concept": 0.68,
        "action": 0.68,
        "data_store": 0.78,
        "external_system": 0.90,
        "commit": 0.58,
        "issue": 0.62,
    }[kind]


def _encode_blobs(connection: sqlite3.Connection) -> None:
    connection.row_factory = sqlite3.Row
    layout = connection.execute(
        "SELECT id, snapshot_id FROM layouts WHERE id = 1"
    ).fetchone()
    if layout is None:
        raise RuntimeError("fixture layout is missing")
    layout_id = int(layout["id"])
    snapshot_id = int(layout["snapshot_id"])

    nodes = connection.execute(
        """
        SELECT n.id, n.kind, n.path, n.external, n.attributes_json,
               k.category, k.render_code
        FROM nodes AS n
        JOIN node_kinds AS k ON k.key = n.kind
        WHERE n.snapshot_id = ?
        ORDER BY n.id
        """,
        (snapshot_id,),
    ).fetchall()
    clusters = _cluster_map(connection, nodes)
    cluster_ids = sorted(set(clusters.values()))
    cluster_order = {cluster_id: index for index, cluster_id in enumerate(cluster_ids)}
    local_indexes: dict[int, int] = {}
    positions = bytearray(
        POSITION_HEADER.pack(b"CCP1", 1, POSITION_HEADER.size, len(nodes), 3, 1, 0, snapshot_id, layout_id)
    )
    node_indexes: dict[int, int] = {}
    coordinates: list[tuple[float, float, float]] = []

    for node_index, node in enumerate(nodes):
        node_id = int(node["id"])
        node_indexes[node_id] = node_index
        cluster_id = clusters[node_id]
        local_index = local_indexes.get(cluster_id, 0)
        local_indexes[cluster_id] = local_index + 1

        cluster_angle = 2.0 * math.pi * cluster_order[cluster_id] / max(1, len(cluster_ids))
        center_x = 11.0 * math.cos(cluster_angle)
        center_y = 11.0 * math.sin(cluster_angle)
        local_angle = local_index * 2.399963229728653
        local_radius = 0.75 * math.sqrt(local_index)
        x = center_x + local_radius * math.cos(local_angle)
        y = center_y + local_radius * math.sin(local_angle)
        z = 0.7 * ((local_index % 7) - 3)
        coordinates.append((x, y, z))

        attributes = json.loads(str(node["attributes_json"]))
        flags = 0
        if int(node["external"]):
            flags |= 1 << 0
        if node["category"] == "semantic":
            flags |= 1 << 1
        if node["category"] == "change":
            flags |= 1 << 2
        if attributes.get("synthetic") is True:
            flags |= 1 << 3
        positions.extend(
            POSITION_RECORD.pack(
                node_id,
                x,
                y,
                z,
                _node_radius(str(node["kind"])),
                int(node["render_code"]),
                flags,
                cluster_id,
            )
        )

    edge_rows = connection.execute(
        """
        SELECT e.id, e.source_node_id, e.target_node_id, e.weight, e.is_derived,
               k.render_code, k.directed
        FROM edges AS e
        JOIN edge_kinds AS k ON k.key = e.kind
        WHERE e.snapshot_id = ?
        ORDER BY e.id
        """,
        (snapshot_id,),
    ).fetchall()
    edge_blob = bytearray(
        EDGE_HEADER.pack(b"CCE1", 1, EDGE_HEADER.size, len(edge_rows), EDGE_RECORD.size, 0, snapshot_id, layout_id)
    )
    for edge in edge_rows:
        flags = (1 if int(edge["directed"]) else 0) | (2 if int(edge["is_derived"]) else 0)
        edge_blob.extend(
            EDGE_RECORD.pack(
                int(edge["id"]),
                node_indexes[int(edge["source_node_id"])],
                node_indexes[int(edge["target_node_id"])],
                int(edge["render_code"]),
                flags,
                float(edge["weight"]),
            )
        )

    minimums = [min(axis) for axis in zip(*coordinates)]
    maximums = [max(axis) for axis in zip(*coordinates)]
    bounds = json.dumps(
        {"min": minimums, "max": maximums},
        separators=(",", ":"),
    )
    connection.execute(
        "UPDATE layouts SET bounds_json = ?, node_count = ?, edge_count = ? WHERE id = ?",
        (bounds, len(nodes), len(edge_rows), layout_id),
    )
    connection.execute("DELETE FROM graph_blobs WHERE layout_id = ?", (layout_id,))
    for kind, content, record_count in (
        ("positions", bytes(positions), len(nodes)),
        ("edges", bytes(edge_blob), len(edge_rows)),
    ):
        connection.execute(
            """
            INSERT INTO graph_blobs (
                layout_id, kind, format_version, byte_order, compression,
                record_count, byte_length, sha256_hex, content
            ) VALUES (?, ?, 1, 'little', 'none', ?, ?, ?, ?)
            """,
            (
                layout_id,
                kind,
                record_count,
                len(content),
                hashlib.sha256(content).hexdigest(),
                content,
            ),
        )


def build(output: Path = OUTPUT) -> Path:
    temporary = output.with_suffix(".sqlite.tmp")
    if temporary.exists():
        temporary.unlink()
    connection = sqlite3.connect(temporary)
    try:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA page_size = 4096")
        connection.executescript(MIGRATION.read_text(encoding="utf-8"))
        connection.executescript(SEED_SQL.read_text(encoding="utf-8"))
        _encode_blobs(connection)
        connection.commit()
        connection.execute("VACUUM")
    finally:
        connection.close()

    verify_database(temporary, verbose=False)
    os.replace(temporary, output)
    return output


if __name__ == "__main__":
    built = build()
    result = verify_database(built, verbose=False)
    print(
        f"built {built.relative_to(ROOT)}: "
        f"{result['nodes']} nodes, {result['edges']} edges, {result['findings']} findings"
    )

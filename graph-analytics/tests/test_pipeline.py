from __future__ import annotations

import hashlib
from contextlib import closing
from dataclasses import replace
import json
from pathlib import Path
import shutil
import sqlite3
import tempfile
import unittest

from constellation_analytics.blobs import (
    EDGE_HEADER,
    EDGE_RECORD,
    POSITION_HEADER,
    POSITION_RECORD,
    decode_positions,
)
from constellation_analytics.analytics import compute_analytics
from constellation_analytics.database import connect_database, load_snapshot_graph
from constellation_analytics.layout import (
    _adjacency,
    derive_layout_edge_policy,
    leiden_clusters,
)
from constellation_analytics.pipeline import RunConfig, run_pipeline

from .helpers import (
    SEED_DATABASE,
    create_minimal_database,
    create_two_snapshot_cycle_database,
)


class PipelineIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.temp_path = Path(self.temporary.name)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_real_fixture_is_byte_valid_deterministic_and_layout_scoped(self) -> None:
        database = self.temp_path / "seed.sqlite"
        shutil.copy2(SEED_DATABASE, database)
        with closing(sqlite3.connect(database)) as connection:
            fixture_blobs_before = {
                row[0]: (row[1], bytes(row[2]))
                for row in connection.execute(
                    "SELECT kind, sha256_hex, content FROM graph_blobs WHERE layout_id = 1"
                )
            }

        config = RunConfig(
            database=database,
            snapshot_id=1,
            layout_name="architecture-v1",
            seed=7,
            iterations=8,
        )
        first = run_pipeline(config)
        with closing(sqlite3.connect(database)) as connection:
            connection.row_factory = sqlite3.Row
            layout = connection.execute(
                "SELECT * FROM layouts WHERE snapshot_id = 1 AND name = 'architecture-v1'"
            ).fetchone()
            self.assertIsNotNone(layout)
            first_blobs = {
                str(row["kind"]): bytes(row["content"])
                for row in connection.execute(
                    "SELECT * FROM graph_blobs WHERE layout_id = ?", (layout["id"],)
                )
            }
            fingerprint = connection.execute(
                "SELECT fingerprint FROM finding_threads WHERE rule_key = 'package_dependency_cycle'"
            ).fetchone()[0]
            first_metric_rows = connection.execute(
                """
                SELECT node_id, key, value, unit, provenance
                FROM node_metrics
                WHERE snapshot_id=1 AND provenance LIKE 'constellation-analytics:%'
                ORDER BY node_id, key
                """
            ).fetchall()

        second = run_pipeline(config)
        self.assertEqual(first.layout_id, second.layout_id)
        self.assertEqual(first.positions_sha256, second.positions_sha256)
        self.assertEqual(first.edges_sha256, second.edges_sha256)
        self.assertEqual(first.findings_materialized, 1)
        self.assertEqual(first.node_cycle_count, 0)
        self.assertEqual(first.package_cycle_count, 1)
        self.assertEqual(first.positions_bytes, 32 + 32 * 53)
        self.assertEqual(first.edge_bytes, 32 + 24 * 92)

        with closing(sqlite3.connect(database)) as connection:
            connection.row_factory = sqlite3.Row
            fixture_blobs_after = {
                row[0]: (row[1], bytes(row[2]))
                for row in connection.execute(
                    "SELECT kind, sha256_hex, content FROM graph_blobs WHERE layout_id = 1"
                )
            }
            self.assertEqual(fixture_blobs_before, fixture_blobs_after)
            own_blobs = {
                str(row["kind"]): row
                for row in connection.execute(
                    "SELECT * FROM graph_blobs WHERE layout_id = ?", (first.layout_id,)
                )
            }
            self.assertEqual(
                bytes(own_blobs["positions"]["content"]), first_blobs["positions"]
            )
            self.assertEqual(bytes(own_blobs["edges"]["content"]), first_blobs["edges"])
            self.assertEqual(
                connection.execute(
                    "SELECT count(*) FROM finding_occurrences fo JOIN finding_threads ft ON ft.id=fo.finding_id WHERE ft.fingerprint = ?",
                    (fingerprint,),
                ).fetchone()[0],
                1,
            )
            current_fingerprint = connection.execute(
                "SELECT fingerprint FROM finding_threads WHERE rule_key = 'package_dependency_cycle'"
            ).fetchone()[0]
            self.assertEqual(fingerprint, current_fingerprint)
            self.assertEqual(
                first_metric_rows,
                connection.execute(
                    """
                    SELECT node_id, key, value, unit, provenance
                    FROM node_metrics
                    WHERE snapshot_id=1 AND provenance LIKE 'constellation-analytics:%'
                    ORDER BY node_id, key
                    """
                ).fetchall(),
            )
            self.assertEqual(
                connection.execute(
                    "SELECT value FROM snapshot_metrics WHERE snapshot_id=1 AND key='architecture.change_edge_count_excluded'"
                ).fetchone()[0],
                11.0,
            )
            self.assertEqual(
                connection.execute(
                    "SELECT count(*) FROM node_metrics WHERE snapshot_id=1 AND key LIKE 'package.%'"
                ).fetchone()[0],
                20,
            )

            position_row = own_blobs["positions"]
            position_content = bytes(position_row["content"])
            self.assertEqual(
                hashlib.sha256(position_content).hexdigest(), position_row["sha256_hex"]
            )
            decoded = decode_positions(
                position_content,
                expected_snapshot_id=1,
                expected_layout_id=first.layout_id,
                expected_sha256=str(position_row["sha256_hex"]),
            )
            node_ids = [record.node_id for record in decoded.records]
            self.assertEqual(
                node_ids,
                [
                    row[0]
                    for row in connection.execute(
                        "SELECT id FROM nodes WHERE snapshot_id=1 ORDER BY id"
                    )
                ],
            )
            expected_nodes = {
                row[0]: (row[1], row[2], bool(row[3]), json.loads(row[4]))
                for row in connection.execute(
                    """
                    SELECT n.id, k.render_code, k.category, n.external, n.attributes_json
                    FROM nodes n JOIN node_kinds k ON k.key=n.kind
                    WHERE n.snapshot_id=1
                    """
                )
            }
            for record in decoded.records:
                kind_code, category, external, attributes = expected_nodes[
                    record.node_id
                ]
                expected_flags = int(external)
                expected_flags |= 2 if category == "semantic" else 0
                expected_flags |= 4 if category == "change" else 0
                expected_flags |= 8 if attributes.get("synthetic") is True else 0
                self.assertEqual(record.kind_code, kind_code)
                self.assertEqual(record.flags, expected_flags)
                self.assertGreater(record.radius, 0.0)
            current_layout = connection.execute(
                "SELECT bounds_json, parameters_json FROM layouts WHERE id=?",
                (first.layout_id,),
            ).fetchone()
            bounds = json.loads(current_layout[0])
            parameters = json.loads(current_layout[1])
            axes = list(
                zip(
                    *[(record.x, record.y, record.z) for record in decoded.records],
                    strict=True,
                )
            )
            self.assertEqual(bounds["min"], [min(axis) for axis in axes])
            self.assertEqual(bounds["max"], [max(axis) for axis in axes])
            self.assertFalse(
                parameters["layout_edge_policy"]["change_history_included"]
            )
            self.assertEqual(
                parameters["layout_edge_policy"]["excluded_change_edge_count"], 11
            )
            self.assertEqual(
                parameters["layout_edge_policy"]["excluded_change_edge_kinds"],
                ["modifies", "references", "touches"],
            )
            self.assertTrue(
                parameters["layout_edge_policy"]["edge_blob_retains_excluded_relations"]
            )
            (
                magic,
                version,
                header_bytes,
                count,
                dimensions,
                scalar,
                flags,
                snapshot_id,
                layout_id,
            ) = POSITION_HEADER.unpack_from(position_content)
            self.assertEqual(
                (
                    magic,
                    version,
                    header_bytes,
                    count,
                    dimensions,
                    scalar,
                    flags,
                    snapshot_id,
                    layout_id,
                ),
                (b"CCP1", 1, 32, 53, 3, 1, 0, 1, first.layout_id),
            )
            self.assertEqual(
                len(position_content),
                POSITION_HEADER.size + count * POSITION_RECORD.size,
            )

            edge_row = own_blobs["edges"]
            edge_content = bytes(edge_row["content"])
            self.assertEqual(
                hashlib.sha256(edge_content).hexdigest(), edge_row["sha256_hex"]
            )
            (
                magic,
                version,
                header_bytes,
                count,
                record_bytes,
                flags,
                snapshot_id,
                layout_id,
            ) = EDGE_HEADER.unpack_from(edge_content)
            self.assertEqual(
                (
                    magic,
                    version,
                    header_bytes,
                    count,
                    record_bytes,
                    flags,
                    snapshot_id,
                    layout_id,
                ),
                (b"CCE1", 1, 32, 92, 24, 0, 1, first.layout_id),
            )
            seen_edges = set()
            expected_edges = {
                row[0]: (row[1], row[2], row[3], row[4], row[5], row[6])
                for row in connection.execute(
                    """
                    SELECT e.id, e.source_node_id, e.target_node_id, k.render_code,
                           k.directed, e.is_derived, e.weight
                    FROM edges e JOIN edge_kinds k ON k.key=e.kind
                    WHERE e.snapshot_id=1
                    """
                )
            }
            for index in range(count):
                edge_id, source_index, target_index, kind, edge_flags, weight = (
                    EDGE_RECORD.unpack_from(
                        edge_content,
                        header_bytes + index * record_bytes,
                    )
                )
                self.assertLess(source_index, len(node_ids))
                self.assertLess(target_index, len(node_ids))
                self.assertEqual(
                    (node_ids[source_index], node_ids[target_index]),
                    expected_edges[edge_id][:2],
                )
                self.assertEqual(kind, expected_edges[edge_id][2])
                self.assertEqual(
                    edge_flags,
                    (1 if expected_edges[edge_id][3] else 0)
                    | (2 if expected_edges[edge_id][4] else 0),
                )
                self.assertAlmostEqual(weight, expected_edges[edge_id][5], places=6)
                seen_edges.add(edge_id)
            self.assertEqual(seen_edges, set(expected_edges))

    def test_degraded_change_edges_do_not_affect_base_layout_graph(self) -> None:
        database = self.temp_path / "degraded.sqlite"
        shutil.copy2(SEED_DATABASE, database)
        connection = connect_database(database)
        try:
            graph = load_snapshot_graph(connection, database, 1)
        finally:
            connection.close()
        analytics = compute_analytics(graph, seed=5)
        policy = derive_layout_edge_policy(graph)
        self.assertFalse(policy.include_change_history)
        self.assertEqual(policy.excluded_change_edge_count, 11)

        full_clustering = leiden_clusters(
            graph,
            analytics.package_by_node_id,
            policy,
            seed=5,
        )
        filtered_graph = replace(
            graph,
            edges=tuple(edge for edge in graph.edges if edge.category != "change"),
        )
        filtered_policy = derive_layout_edge_policy(filtered_graph)
        filtered_clustering = leiden_clusters(
            filtered_graph,
            analytics.package_by_node_id,
            filtered_policy,
            seed=5,
        )
        self.assertEqual(
            full_clustering.cluster_by_node_id,
            filtered_clustering.cluster_by_node_id,
        )
        full_adjacency = _adjacency(
            graph,
            full_clustering.cluster_by_node_id,
            policy,
        )
        filtered_adjacency = _adjacency(
            filtered_graph,
            filtered_clustering.cluster_by_node_id,
            filtered_policy,
        )
        difference = full_adjacency - filtered_adjacency
        difference.eliminate_zeros()
        self.assertEqual(difference.nnz, 0)

    def test_direct_cycle_is_materialized_with_stable_nodes_and_edges(self) -> None:
        database = self.temp_path / "cycle.sqlite"
        shutil.copy2(SEED_DATABASE, database)
        with closing(sqlite3.connect(database)) as connection:
            connection.execute("PRAGMA foreign_keys = ON")
            connection.execute(
                """
                INSERT INTO edges (
                    snapshot_id, stable_key, source_node_id, target_node_id, kind,
                    weight, confidence, is_derived, attributes_json
                ) VALUES (1, 'imports:fs:src/shared/types.ts->fs:src/sidebar/App.tsx',
                          19, 20, 'imports', 1.0, 1.0, 0, '{}')
                """
            )
            connection.commit()
        summary = run_pipeline(
            RunConfig(database=database, snapshot_id=1, seed=3, iterations=4)
        )
        self.assertEqual(summary.component_count, 1)
        self.assertGreaterEqual(summary.node_cycle_count, 1)
        with closing(sqlite3.connect(database)) as connection:
            finding = connection.execute(
                "SELECT id, fingerprint FROM finding_threads WHERE rule_key='architecture_dependency_cycle'"
            ).fetchone()
            self.assertIsNotNone(finding)
            node_ids = {
                row[0]
                for row in connection.execute(
                    "SELECT node_id FROM finding_nodes WHERE finding_id=?",
                    (finding[0],),
                )
            }
            self.assertEqual(node_ids, {18, 19, 20})
            self.assertGreaterEqual(
                connection.execute(
                    "SELECT count(*) FROM finding_edges WHERE finding_id=?",
                    (finding[0],),
                ).fetchone()[0],
                2,
            )

    def test_single_node_and_disconnected_graphs(self) -> None:
        one = create_minimal_database(self.temp_path / "one.sqlite", node_count=1)
        one_summary = run_pipeline(
            RunConfig(database=one, snapshot_id=1, seed=1, iterations=2)
        )
        self.assertEqual(one_summary.component_count, 1)
        self.assertEqual(one_summary.orphan_count, 1)
        self.assertEqual(one_summary.positions_bytes, 64)
        self.assertEqual(one_summary.edge_bytes, 32)

        two = create_minimal_database(self.temp_path / "two.sqlite", node_count=2)
        two_summary = run_pipeline(
            RunConfig(database=two, snapshot_id=1, seed=1, iterations=2)
        )
        self.assertEqual(two_summary.component_count, 2)
        self.assertEqual(two_summary.orphan_count, 2)
        self.assertEqual(two_summary.positions_records, 2)
        with closing(sqlite3.connect(two)) as connection:
            positions = connection.execute(
                """
                SELECT b.content FROM graph_blobs b
                JOIN layouts l ON l.id=b.layout_id
                WHERE l.name='architecture-v1' AND b.kind='positions'
                """
            ).fetchone()[0]
            decoded = decode_positions(bytes(positions))
            self.assertEqual(len(decoded.records), 2)

    def test_findings_survive_rescan_and_layout_seeds_from_previous_snapshot(
        self,
    ) -> None:
        database = create_two_snapshot_cycle_database(self.temp_path / "rescans.sqlite")
        first = run_pipeline(
            RunConfig(database=database, snapshot_id=1, seed=11, iterations=3)
        )
        repeated = run_pipeline(
            RunConfig(database=database, snapshot_id=1, seed=11, iterations=3)
        )
        second = run_pipeline(
            RunConfig(database=database, snapshot_id=2, seed=11, iterations=3)
        )
        self.assertEqual(first.findings_materialized, 2)
        self.assertEqual(first.layout_id, repeated.layout_id)
        self.assertEqual(first.positions_sha256, repeated.positions_sha256)
        self.assertGreater(first.cluster_count, 1)
        self.assertEqual(second.findings_materialized, 2)
        self.assertEqual(second.previous_snapshot_id, 1)
        self.assertEqual(second.previous_seed_count, 2)
        with closing(sqlite3.connect(database)) as connection:
            community_parameters = json.loads(
                connection.execute(
                    "SELECT parameters_json FROM layouts WHERE snapshot_id=1 AND name='architecture-v1'"
                ).fetchone()[0]
            )
            self.assertGreater(community_parameters["community_resolution"], 0.75)
            self.assertGreater(
                len(community_parameters["community_resolution_attempts"]), 1
            )
            self.assertEqual(
                connection.execute(
                    "SELECT count(*) FROM finding_threads WHERE repository_id=1"
                ).fetchone()[0],
                2,
            )
            occurrences = [
                row[0]
                for row in connection.execute(
                    """
                    SELECT count(*)
                    FROM finding_occurrences
                    GROUP BY finding_id
                    ORDER BY finding_id
                    """
                )
            ]
            self.assertEqual(occurrences, [2, 2])


if __name__ == "__main__":
    unittest.main()

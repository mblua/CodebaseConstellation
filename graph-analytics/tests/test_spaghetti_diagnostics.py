from __future__ import annotations

from pathlib import Path
import unittest

from constellation_analytics.analytics import (
    _dependency_zones,
    _nearest_rank,
    _package_membership,
    compute_analytics,
)
from constellation_analytics.findings import build_findings
from constellation_analytics.model import Edge, Node, SnapshotGraph


def _node(
    node_id: int,
    stable_key: str,
    *,
    kind: str = "file",
    path: str | None = None,
    external: bool = False,
    attributes: dict | None = None,
) -> Node:
    return Node(
        id=node_id,
        stable_key=stable_key,
        kind=kind,
        category="structural" if kind == "package" else "code",
        render_code=4 if kind == "package" else 3,
        name=stable_key.rsplit("/", 1)[-1],
        path=path,
        external=external,
        attributes={} if attributes is None else attributes,
    )


def _edge(
    edge_id: int,
    source_id: int,
    target_id: int,
    *,
    kind: str,
    category: str,
) -> Edge:
    return Edge(
        id=edge_id,
        stable_key=f"{kind}:{source_id}->{target_id}:{edge_id}",
        source_id=source_id,
        target_id=target_id,
        kind=kind,
        category=category,
        render_code=2 if kind == "groups" else 4,
        directed=True,
        weight=1.0,
        confidence=1.0,
        derived=False,
    )


def _graph(nodes: list[Node], edges: list[Edge]) -> SnapshotGraph:
    return SnapshotGraph(
        database=Path("diagnostics.sqlite"),
        snapshot_id=1,
        repository_id=1,
        started_at="2026-01-01T00:00:00.000Z",
        observed_at="2026-01-01T00:00:01.000Z",
        content_hash="diagnostics",
        nodes=tuple(nodes),
        edges=tuple(edges),
        capabilities={},
    )


class DependencyZoneTests(unittest.TestCase):
    def test_deepest_explicit_package_and_source_root_rules(self) -> None:
        nodes = [
            _node(
                1,
                "pkg:npm:root",
                kind="package",
                attributes={"root": ""},
            ),
            _node(
                2,
                "pkg:npm:nested",
                kind="package",
                attributes={"root": "packages/app"},
            ),
            _node(
                10,
                "fs:packages/app/src/api/handler.ts",
                path="packages/app/src/api/handler.ts",
            ),
            _node(11, "fs:packages/app/src/main.ts", path="packages/app/src/main.ts"),
            _node(12, "fs:packages/app/config.ts", path="packages/app/config.ts"),
            _node(13, "fs:other/lib/domain/model.ts", path="other/lib/domain/model.ts"),
            _node(14, "fs:lib/domain/model.ts", path="lib/domain/model.ts"),
            _node(15, "fs:external.ts", path="external.ts", external=True),
        ]
        edges: list[Edge] = []
        edge_id = 1
        for target_id in (10, 11, 12, 13, 14):
            edges.append(
                _edge(edge_id, 1, target_id, kind="groups", category="structural")
            )
            edge_id += 1
        for target_id in (10, 11, 12):
            edges.append(
                _edge(edge_id, 2, target_id, kind="groups", category="structural")
            )
            edge_id += 1
        edges.extend(
            (
                _edge(edge_id, 10, 11, kind="imports", category="dependency"),
                _edge(edge_id + 1, 11, 12, kind="imports", category="dependency"),
                _edge(edge_id + 2, 10, 15, kind="imports", category="dependency"),
                _edge(edge_id + 3, 15, 10, kind="imports", category="dependency"),
                _edge(edge_id + 4, 12, 10, kind="imports", category="change"),
            )
        )
        graph = _graph(nodes, edges)
        membership = _package_membership(graph)
        zones = _dependency_zones(graph, membership)

        self.assertEqual(membership[10], 2)
        self.assertEqual(zones[10].identity, "pkg:npm:nested::api")
        self.assertEqual(zones[11].identity, "pkg:npm:nested::src")
        self.assertEqual(zones[12].identity, "pkg:npm:nested::<root>")
        self.assertEqual(zones[13].identity, "pkg:npm:root::other")
        self.assertEqual(zones[14].identity, "pkg:npm:root::domain")
        self.assertNotIn(15, zones)

        analytics = compute_analytics(graph, seed=1)
        stats = analytics.file_dependency_stats
        self.assertEqual(stats[10].cross_boundary_out, 1)
        self.assertEqual(stats[10].dependency_zone_count, 1)
        self.assertEqual(stats[11].cross_boundary_in, 1)
        self.assertEqual(stats[11].cross_boundary_out, 1)
        self.assertEqual(stats[12].cross_boundary_in, 1)
        self.assertNotIn(15, stats)
        metric_keys_for_external = {
            metric.key for metric in analytics.node_metrics if metric.node_id == 15
        }
        self.assertNotIn("architecture.cross_boundary_in", metric_keys_for_external)

    def test_nearest_rank_p98_is_deterministic(self) -> None:
        self.assertEqual(_nearest_rank([1] * 49 + [20], 98), 1)
        self.assertEqual(_nearest_rank([1] * 48 + [12, 20], 98), 12)
        self.assertEqual(_nearest_rank([], 98), 0)


class SpaghettiFindingTests(unittest.TestCase):
    def _finding_graph(self) -> SnapshotGraph:
        package = _node(
            1,
            "pkg:npm:app",
            kind="package",
            attributes={"root": ""},
        )
        files = [
            _node(100, "fs:src/core/hub.ts", path="src/core/hub.ts"),
            *[
                _node(
                    101 + index,
                    f"fs:src/input{index}/source.ts",
                    path=f"src/input{index}/source.ts",
                )
                for index in range(6)
            ],
            *[
                _node(
                    107 + index,
                    f"fs:src/zone{'abc'[index // 2]}/target{index}.ts",
                    path=f"src/zone{'abc'[index // 2]}/target{index}.ts",
                )
                for index in range(6)
            ],
            _node(113, "fs:src/contracts/shared.ts", path="src/contracts/shared.ts"),
            *[
                _node(
                    114 + index,
                    f"fs:src/shared-source{index}/source.ts",
                    path=f"src/shared-source{index}/source.ts",
                )
                for index in range(12)
            ],
            _node(126, "fs:src/cycle/a.ts", path="src/cycle/a.ts"),
            _node(127, "fs:src/cycle/b.ts", path="src/cycle/b.ts"),
            _node(200, "fs:external.ts", path="external.ts", external=True),
        ]
        edges: list[Edge] = []
        edge_id = 1
        for file_node in files:
            if not file_node.external:
                edges.append(
                    _edge(
                        edge_id,
                        1,
                        file_node.id,
                        kind="groups",
                        category="structural",
                    )
                )
                edge_id += 1
        for source_id in range(101, 107):
            edges.append(
                _edge(edge_id, source_id, 100, kind="imports", category="dependency")
            )
            edge_id += 1
        for target_id in range(107, 113):
            edges.append(
                _edge(edge_id, 100, target_id, kind="imports", category="dependency")
            )
            edge_id += 1
        for source_id in range(114, 126):
            edges.append(
                _edge(edge_id, source_id, 113, kind="imports", category="dependency")
            )
            edge_id += 1
        cycle_edge_ids = (edge_id, edge_id + 1)
        edges.extend(
            (
                _edge(edge_id, 126, 127, kind="imports", category="dependency"),
                _edge(edge_id + 1, 127, 126, kind="imports", category="dependency"),
                _edge(edge_id + 2, 200, 100, kind="imports", category="dependency"),
                _edge(edge_id + 3, 100, 200, kind="imports", category="dependency"),
                _edge(edge_id + 4, 100, 107, kind="imports", category="change"),
            )
        )
        self.cycle_edge_ids = cycle_edge_ids
        return _graph([package, *files], edges)

    def test_hub_sprawl_cycle_evidence_and_external_exclusion(self) -> None:
        graph = self._finding_graph()
        analytics = compute_analytics(graph, seed=7)
        findings = build_findings(graph, analytics)
        by_rule: dict[str, list] = {}
        for finding in findings:
            by_rule.setdefault(finding.rule_key, []).append(finding)

        self.assertEqual(analytics.dependency_hub_p98, 12)
        self.assertEqual(analytics.dependency_hub_threshold, 12)
        self.assertEqual(len(by_rule["architecture_dependency_hub"]), 1)
        self.assertEqual(len(by_rule["architecture_boundary_sprawl"]), 1)
        self.assertEqual(len(by_rule["architecture_dependency_cycle"]), 1)

        hub = by_rule["architecture_dependency_hub"][0]
        self.assertEqual(hub.severity, "info")
        self.assertEqual(hub.nodes[0], (100, "primary"))
        self.assertEqual(len(hub.edges), 12)
        self.assertTrue(all(role == "evidence" for _edge_id, role in hub.edges))
        self.assertEqual(hub.attributes["fan_in"], 6)
        self.assertEqual(hub.attributes["fan_out"], 6)
        self.assertEqual(hub.attributes["effective_fan_total_threshold"], 12)

        sprawl = by_rule["architecture_boundary_sprawl"][0]
        self.assertEqual(sprawl.severity, "warning")
        self.assertEqual(sprawl.nodes[0], (100, "primary"))
        self.assertEqual(len(sprawl.edges), 6)
        self.assertEqual(sprawl.attributes["outgoing_cross_boundary_imports"], 6)
        self.assertEqual(sprawl.attributes["distinct_target_zone_count"], 3)
        self.assertEqual(len(sprawl.attributes["target_zones"]), 3)

        cycle = by_rule["architecture_dependency_cycle"][0]
        self.assertEqual({node_id for node_id, _role in cycle.nodes}, {126, 127})
        self.assertEqual(
            {edge_id for edge_id, _role in cycle.edges}, set(self.cycle_edge_ids)
        )
        attached = {node_id for finding in findings for node_id, _role in finding.nodes}
        self.assertNotIn(200, attached)

        repeated = build_findings(graph, compute_analytics(graph, seed=7))
        self.assertEqual(
            [(finding.rule_key, finding.fingerprint) for finding in findings],
            [(finding.rule_key, finding.fingerprint) for finding in repeated],
        )

        internal_file_count = sum(
            node.kind == "file" and not node.external for node in graph.nodes
        )
        for key in (
            "architecture.cross_boundary_in",
            "architecture.cross_boundary_out",
            "architecture.dependency_zone_count",
        ):
            self.assertEqual(
                sum(metric.key == key for metric in analytics.node_metrics),
                internal_file_count,
            )


if __name__ == "__main__":
    unittest.main()

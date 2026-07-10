from __future__ import annotations

from collections import defaultdict
import math
from typing import Iterable

import networkit as nk

from .model import (
    AnalyticsResult,
    Cycle,
    Edge,
    NodeMetric,
    SnapshotGraph,
    SnapshotMetric,
)


VERSION = "0.1.0"
PROVENANCE = f"constellation-analytics:{VERSION}"

FAN_RELATION_KINDS = frozenset(
    {
        "imports",
        "depends_on",
        "calls",
        "invokes",
        "reads",
        "writes",
        "emits",
        "consumes",
        "flows_to",
    }
)
NODE_CYCLE_RELATION_KINDS = frozenset({"imports", "depends_on", "calls"})
NODE_CYCLE_KINDS = frozenset({"package", "module", "file", "symbol"})
STRUCTURAL_DEPTH_KINDS = frozenset({"contains", "groups", "declares"})

OWNED_NODE_METRIC_KEYS = frozenset(
    {
        "graph.in_degree",
        "graph.out_degree",
        "architecture.fan_in",
        "architecture.fan_out",
        "graph.component_id",
        "graph.component_size",
        "graph.orphan",
        "centrality.pagerank",
        "centrality.betweenness_sampled",
        "centrality.eigenvector",
        "graph.k_core",
        "structure.depth",
        "architecture.dependency_cycle_member",
        "package.afferent_coupling",
        "package.efferent_coupling",
        "package.instability",
        "package.internal_relation_count",
        "package.outgoing_relation_count",
        "package.cohesion_ratio",
        "package.dependency_cycle_member",
    }
)

OWNED_SNAPSHOT_METRIC_KEYS = frozenset(
    {
        "analytics.node_count",
        "analytics.edge_count",
        "graph.component_count",
        "graph.orphan_count",
        "centrality.betweenness_sample_count",
        "architecture.node_dependency_cycle_count",
        "architecture.package_dependency_cycle_count",
        "architecture.dependency_cycle_count",
        "architecture.change_edge_count_excluded",
    }
)


def _directed_pairs(
    graph: SnapshotGraph, edges: Iterable[Edge]
) -> set[tuple[int, int]]:
    dense = graph.dense_index_by_id
    pairs: set[tuple[int, int]] = set()
    for edge in edges:
        source = dense[edge.source_id]
        target = dense[edge.target_id]
        pairs.add((source, target))
        if not edge.directed:
            pairs.add((target, source))
    return pairs


def _undirected_pairs(
    graph: SnapshotGraph, edges: Iterable[Edge]
) -> set[tuple[int, int]]:
    dense = graph.dense_index_by_id
    pairs: set[tuple[int, int]] = set()
    for edge in edges:
        source = dense[edge.source_id]
        target = dense[edge.target_id]
        if source != target:
            pairs.add((min(source, target), max(source, target)))
    return pairs


def _networkit_graph(
    node_count: int,
    pairs: Iterable[tuple[int, int]],
    *,
    directed: bool,
) -> nk.Graph:
    result = nk.Graph(node_count, weighted=False, directed=directed)
    for source, target in sorted(set(pairs)):
        if not result.hasEdge(source, target):
            result.addEdge(source, target)
    return result


def _normalise_scores(scores: Iterable[float]) -> list[float]:
    candidates = [
        float(score) if math.isfinite(float(score)) else 0.0 for score in scores
    ]
    total = sum(candidates)
    if total <= 0.0:
        return candidates
    return [score / total for score in candidates]


def _component_mapping(
    graph: SnapshotGraph,
    undirected: nk.Graph,
) -> tuple[dict[int, int], dict[int, int]]:
    if not graph.nodes:
        return {}, {}
    decomposition = nk.components.ConnectedComponents(undirected).run()
    components = [
        sorted(int(index) for index in component)
        for component in decomposition.getComponents()
    ]
    components.sort(
        key=lambda indexes: min(graph.nodes[index].stable_key for index in indexes)
    )
    component_by_node_id: dict[int, int] = {}
    component_size_by_id: dict[int, int] = {}
    for stable_component_id, indexes in enumerate(components, start=1):
        component_size_by_id[stable_component_id] = len(indexes)
        for index in indexes:
            component_by_node_id[graph.nodes[index].id] = stable_component_id
    return component_by_node_id, component_size_by_id


def _structural_depths(graph: SnapshotGraph) -> list[float]:
    node_count = len(graph.nodes)
    if node_count == 0:
        return []
    dense = graph.dense_index_by_id
    structural_pairs = {
        (dense[edge.source_id], dense[edge.target_id])
        for edge in graph.edges
        if edge.kind in STRUCTURAL_DEPTH_KINDS
    }
    incoming = [0] * node_count
    for _source, target in structural_pairs:
        incoming[target] += 1
    super_root = node_count
    depth_graph = _networkit_graph(
        node_count + 1,
        structural_pairs
        | {(super_root, index) for index, count in enumerate(incoming) if count == 0},
        directed=True,
    )
    search = nk.distance.BFS(depth_graph, super_root, storePaths=False).run()
    distances = search.getDistances()
    return [
        float(distance - 1)
        if math.isfinite(float(distance)) and distance < 1e100
        else -1.0
        for distance in distances[:node_count]
    ]


def _package_membership(graph: SnapshotGraph) -> dict[int, int]:
    nodes = graph.node_by_id
    membership = {node.id: node.id for node in graph.nodes if node.kind == "package"}
    grouped_candidates: dict[int, set[int]] = defaultdict(set)
    for edge in graph.edges:
        source = nodes[edge.source_id]
        if edge.kind == "groups" and source.kind == "package":
            grouped_candidates[edge.target_id].add(source.id)

    def priority(package_id: int) -> tuple[int, int, str]:
        package = nodes[package_id]
        root = str(package.attributes.get("root", "")).strip("/")
        depth = 0 if not root else root.count("/") + 1
        # Explicitly grouped overlapping packages choose the deepest declared root;
        # stable_key is only a deterministic tie-breaker, never inferred membership.
        return (-depth, -len(root), package.stable_key)

    for target_id, package_ids in grouped_candidates.items():
        membership[target_id] = min(package_ids, key=priority)

    # A declared symbol inherits its declaring artifact's explicit package membership.
    changed = True
    while changed:
        changed = False
        for edge in graph.edges:
            if edge.kind != "declares" or edge.source_id not in membership:
                continue
            package_id = membership[edge.source_id]
            current = membership.get(edge.target_id)
            if current is None or priority(package_id) < priority(current):
                membership[edge.target_id] = package_id
                changed = True
    return membership


def _strong_components(
    graph: SnapshotGraph,
    pairs: set[tuple[int, int]],
    eligible_indexes: set[int],
) -> list[tuple[int, ...]]:
    if not pairs:
        return []
    directed = _networkit_graph(len(graph.nodes), pairs, directed=True)
    decomposition = nk.components.StronglyConnectedComponents(directed).run()
    components: list[tuple[int, ...]] = []
    for raw in decomposition.getComponents():
        indexes = tuple(
            sorted(int(index) for index in raw if int(index) in eligible_indexes)
        )
        if len(indexes) > 1:
            components.append(indexes)
    components.sort(
        key=lambda indexes: tuple(graph.nodes[index].stable_key for index in indexes)
    )
    return components


def _node_cycles(graph: SnapshotGraph) -> list[Cycle]:
    dense = graph.dense_index_by_id
    eligible = {
        index for index, node in enumerate(graph.nodes) if node.kind in NODE_CYCLE_KINDS
    }
    relevant_edges = [
        edge
        for edge in graph.edges
        if edge.kind in NODE_CYCLE_RELATION_KINDS
        and dense[edge.source_id] in eligible
        and dense[edge.target_id] in eligible
    ]
    pairs = {(dense[edge.source_id], dense[edge.target_id]) for edge in relevant_edges}
    cycles: list[Cycle] = []
    for indexes in _strong_components(graph, pairs, eligible):
        index_set = set(indexes)
        edge_ids = tuple(
            sorted(
                edge.id
                for edge in relevant_edges
                if dense[edge.source_id] in index_set
                and dense[edge.target_id] in index_set
            )
        )
        cycles.append(
            Cycle(tuple(graph.nodes[index].id for index in indexes), edge_ids)
        )
    return cycles


def _package_metrics_and_cycles(
    graph: SnapshotGraph,
    package_by_node_id: dict[int, int],
) -> tuple[list[NodeMetric], list[Cycle]]:
    packages = sorted(
        (node for node in graph.nodes if node.kind == "package"),
        key=lambda node: node.stable_key,
    )
    if not packages:
        return [], []
    package_ids = {package.id for package in packages}
    incoming_packages: dict[int, set[int]] = defaultdict(set)
    outgoing_packages: dict[int, set[int]] = defaultdict(set)
    internal_count: dict[int, int] = defaultdict(int)
    outgoing_count: dict[int, int] = defaultdict(int)
    evidence_by_pair: dict[tuple[int, int], list[int]] = defaultdict(list)

    for edge in graph.edges:
        if edge.kind not in FAN_RELATION_KINDS:
            continue
        source_package = package_by_node_id.get(edge.source_id)
        target_package = package_by_node_id.get(edge.target_id)
        if source_package is None or target_package is None:
            continue
        if source_package == target_package:
            internal_count[source_package] += 1
            continue
        outgoing_packages[source_package].add(target_package)
        incoming_packages[target_package].add(source_package)
        outgoing_count[source_package] += 1
        evidence_by_pair[(source_package, target_package)].append(edge.id)

    metrics: list[NodeMetric] = []
    for package in packages:
        afferent = len(incoming_packages[package.id])
        efferent = len(outgoing_packages[package.id])
        instability = efferent / (afferent + efferent) if afferent + efferent else 0.0
        internal = internal_count[package.id]
        outgoing = outgoing_count[package.id]
        cohesion = internal / (internal + outgoing) if internal + outgoing else 0.0
        metric_values = (
            (
                "package.afferent_coupling",
                afferent,
                "packages",
                "distinct inbound package dependencies",
            ),
            (
                "package.efferent_coupling",
                efferent,
                "packages",
                "distinct outbound package dependencies",
            ),
            ("package.instability", instability, "ratio", "Ce/(Ca+Ce)"),
            (
                "package.internal_relation_count",
                internal,
                "relations",
                "intra-package architectural relations",
            ),
            (
                "package.outgoing_relation_count",
                outgoing,
                "relations",
                "cross-package outgoing architectural relations",
            ),
            (
                "package.cohesion_ratio",
                cohesion,
                "ratio",
                "internal/(internal+outgoing) relations",
            ),
        )
        for key, value, unit, explanation in metric_values:
            metrics.append(
                NodeMetric(
                    package.id, key, float(value), unit, f"{PROVENANCE};{explanation}"
                )
            )

    package_index = {package.id: index for index, package in enumerate(packages)}
    package_graph = SnapshotGraph(
        database=graph.database,
        snapshot_id=graph.snapshot_id,
        repository_id=graph.repository_id,
        started_at=graph.started_at,
        observed_at=graph.observed_at,
        content_hash=graph.content_hash,
        nodes=tuple(packages),
        edges=(),
        capabilities=graph.capabilities,
    )
    pairs = {
        (package_index[source], package_index[target])
        for source, target in evidence_by_pair
        if source in package_ids and target in package_ids
    }
    eligible = set(range(len(packages)))
    cycles: list[Cycle] = []
    for indexes in _strong_components(package_graph, pairs, eligible):
        participating = {packages[index].id for index in indexes}
        edge_ids = tuple(
            sorted(
                edge_id
                for (source, target), candidates in evidence_by_pair.items()
                if source in participating and target in participating
                for edge_id in candidates
            )
        )
        cycles.append(Cycle(tuple(sorted(participating)), edge_ids))
    return metrics, cycles


def compute_analytics(graph: SnapshotGraph, *, seed: int) -> AnalyticsResult:
    nk.setNumberOfThreads(1)
    nk.setSeed(seed, False)
    result = AnalyticsResult()
    node_count = len(graph.nodes)

    full_directed = _networkit_graph(
        node_count,
        _directed_pairs(graph, graph.edges),
        directed=True,
    )
    full_undirected = _networkit_graph(
        node_count,
        _undirected_pairs(graph, graph.edges),
        directed=False,
    )
    architectural_edges = [edge for edge in graph.edges if edge.category != "change"]
    architecture_directed = _networkit_graph(
        node_count,
        _directed_pairs(graph, architectural_edges),
        directed=True,
    )
    architecture_undirected = _networkit_graph(
        node_count,
        _undirected_pairs(graph, architectural_edges),
        directed=False,
    )
    fan_edges = [edge for edge in graph.edges if edge.kind in FAN_RELATION_KINDS]
    fan_directed = _networkit_graph(
        node_count,
        _directed_pairs(graph, fan_edges),
        directed=True,
    )

    if node_count:
        in_degree = (
            nk.centrality.DegreeCentrality(full_directed, outDeg=False).run().scores()
        )
        out_degree = (
            nk.centrality.DegreeCentrality(full_directed, outDeg=True).run().scores()
        )
        fan_in = (
            nk.centrality.DegreeCentrality(fan_directed, outDeg=False).run().scores()
        )
        fan_out = (
            nk.centrality.DegreeCentrality(fan_directed, outDeg=True).run().scores()
        )
    else:
        in_degree = out_degree = fan_in = fan_out = []

    component_by_node_id, component_sizes = _component_mapping(graph, full_undirected)
    result.component_by_node_id = component_by_node_id
    depths = _structural_depths(graph)

    if node_count == 0:
        pagerank: list[float] = []
        betweenness: list[float] = []
        eigenvector: list[float] = []
        k_core: list[float] = []
    elif architecture_undirected.numberOfEdges() == 0:
        pagerank = [1.0 / node_count] * node_count
        betweenness = [0.0] * node_count
        eigenvector = [1.0 / math.sqrt(node_count)] * node_count
        k_core = [0.0] * node_count
    else:
        pagerank_algorithm = nk.centrality.PageRank(
            architecture_directed,
            damp=0.85,
            tol=1e-9,
            normalized=False,
        ).run()
        pagerank = _normalise_scores(pagerank_algorithm.scores())
        result.betweenness_samples = min(256, max(16, math.ceil(math.sqrt(node_count))))
        betweenness = list(
            nk.centrality.EstimateBetweenness(
                architecture_undirected,
                result.betweenness_samples,
                normalized=True,
                parallel=False,
            )
            .run()
            .scores()
        )
        eigenvector = list(
            nk.centrality.EigenvectorCentrality(architecture_undirected, tol=1e-9)
            .run()
            .scores()
        )
        k_core = list(
            nk.centrality.CoreDecomposition(architecture_undirected, normalized=False)
            .run()
            .scores()
        )

    metric_series = (
        (
            "graph.in_degree",
            in_degree,
            "neighbors",
            f"{PROVENANCE};networkit.DegreeCentrality(in)",
        ),
        (
            "graph.out_degree",
            out_degree,
            "neighbors",
            f"{PROVENANCE};networkit.DegreeCentrality(out)",
        ),
        (
            "architecture.fan_in",
            fan_in,
            "neighbors",
            f"{PROVENANCE};non-change architectural relations",
        ),
        (
            "architecture.fan_out",
            fan_out,
            "neighbors",
            f"{PROVENANCE};non-change architectural relations",
        ),
        (
            "centrality.pagerank",
            pagerank,
            "score",
            f"{PROVENANCE};networkit.PageRank(damp=0.85,tol=1e-9);change edges excluded",
        ),
        (
            "centrality.betweenness_sampled",
            betweenness,
            "score",
            f"{PROVENANCE};networkit.EstimateBetweenness;change edges excluded",
        ),
        (
            "centrality.eigenvector",
            eigenvector,
            "score",
            f"{PROVENANCE};networkit.EigenvectorCentrality;change edges excluded",
        ),
        (
            "graph.k_core",
            k_core,
            "core",
            f"{PROVENANCE};networkit.CoreDecomposition;change edges excluded",
        ),
        (
            "structure.depth",
            depths,
            "levels",
            f"{PROVENANCE};networkit.BFS over contains/groups/declares",
        ),
    )
    for key, scores, unit, provenance in metric_series:
        for index, node in enumerate(graph.nodes):
            score = float(scores[index])
            if not math.isfinite(score):
                score = 0.0
            result.node_metrics.append(
                NodeMetric(node.id, key, score, unit, provenance)
            )

    orphan_count = 0
    for index, node in enumerate(graph.nodes):
        component_id = component_by_node_id[node.id]
        orphan = float(in_degree[index] == 0.0 and out_degree[index] == 0.0)
        orphan_count += int(orphan)
        result.node_metrics.extend(
            (
                NodeMetric(
                    node.id,
                    "graph.component_id",
                    float(component_id),
                    "component",
                    f"{PROVENANCE};networkit.ConnectedComponents;stable-key ordered",
                ),
                NodeMetric(
                    node.id,
                    "graph.component_size",
                    float(component_sizes[component_id]),
                    "nodes",
                    f"{PROVENANCE};networkit.ConnectedComponents",
                ),
                NodeMetric(
                    node.id,
                    "graph.orphan",
                    orphan,
                    "boolean",
                    f"{PROVENANCE};zero in/out degree",
                ),
            )
        )

    result.node_cycles = _node_cycles(graph)
    result.package_by_node_id = _package_membership(graph)
    package_metrics, result.package_cycles = _package_metrics_and_cycles(
        graph, result.package_by_node_id
    )
    result.node_metrics.extend(package_metrics)

    direct_cycle_nodes = {
        node_id for cycle in result.node_cycles for node_id in cycle.node_ids
    }
    package_cycle_nodes = {
        node_id for cycle in result.package_cycles for node_id in cycle.node_ids
    }
    for node_id in sorted(direct_cycle_nodes):
        result.node_metrics.append(
            NodeMetric(
                node_id,
                "architecture.dependency_cycle_member",
                1.0,
                "boolean",
                f"{PROVENANCE};networkit.StronglyConnectedComponents",
            )
        )
    for package_id in sorted(package_cycle_nodes):
        result.node_metrics.append(
            NodeMetric(
                package_id,
                "package.dependency_cycle_member",
                1.0,
                "boolean",
                f"{PROVENANCE};package-collapsed networkit.StronglyConnectedComponents",
            )
        )

    snapshot_values = (
        ("analytics.node_count", node_count, "nodes", "input nodes"),
        ("analytics.edge_count", len(graph.edges), "edges", "input edges"),
        (
            "graph.component_count",
            len(component_sizes),
            "components",
            "networkit.ConnectedComponents",
        ),
        ("graph.orphan_count", orphan_count, "nodes", "zero in/out degree"),
        (
            "centrality.betweenness_sample_count",
            result.betweenness_samples,
            "samples",
            "networkit.EstimateBetweenness;never exact",
        ),
        (
            "architecture.node_dependency_cycle_count",
            len(result.node_cycles),
            "cycles",
            "node-level strongly connected components",
        ),
        (
            "architecture.package_dependency_cycle_count",
            len(result.package_cycles),
            "cycles",
            "package-collapsed strongly connected components",
        ),
        (
            "architecture.dependency_cycle_count",
            len(result.node_cycles) + len(result.package_cycles),
            "cycles",
            "actionable node and package cycles",
        ),
        (
            "architecture.change_edge_count_excluded",
            len(graph.edges) - len(architectural_edges),
            "edges",
            "change history excluded from architectural ranking and package coupling",
        ),
    )
    for key, value, unit, explanation in snapshot_values:
        result.snapshot_metrics.append(
            SnapshotMetric(key, float(value), unit, f"{PROVENANCE};{explanation}")
        )
    return result

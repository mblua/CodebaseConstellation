from __future__ import annotations

from collections import defaultdict
import math
from typing import Iterable

import networkit as nk

from .model import (
    AnalyticsResult,
    Cycle,
    DependencyZone,
    Edge,
    FileDependencyStats,
    NodeMetric,
    SnapshotGraph,
    SnapshotMetric,
)


VERSION = "0.2.0"
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
STRUCTURAL_DEPTH_KINDS = frozenset({"contains", "groups", "declares"})
CONVENTIONAL_SOURCE_ROOTS = frozenset({"src", "lib", "app"})

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
        "architecture.cross_boundary_in",
        "architecture.cross_boundary_out",
        "architecture.dependency_zone_count",
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


def _normalise_relative_path(value: str) -> str:
    normalised = value.replace("\\", "/").strip()
    while normalised.startswith("./"):
        normalised = normalised[2:]
    return normalised.strip("/")


def _package_root(package) -> str:
    declared = package.attributes.get("root")
    if isinstance(declared, str):
        root = _normalise_relative_path(declared)
        if root != ".":
            return root
    manifest = package.attributes.get("manifest")
    if isinstance(manifest, str):
        manifest_path = _normalise_relative_path(manifest)
        return manifest_path.rsplit("/", 1)[0] if "/" in manifest_path else ""
    return ""


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
        root = _package_root(package)
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


def _dependency_zones(
    graph: SnapshotGraph,
    package_by_node_id: dict[int, int],
) -> dict[int, DependencyZone]:
    nodes = graph.node_by_id
    zones: dict[int, DependencyZone] = {}
    for node in graph.nodes:
        if node.kind != "file" or node.external:
            continue
        package_id = package_by_node_id.get(node.id)
        package = nodes.get(package_id) if package_id is not None else None
        if package is not None and package.external:
            package = None
            package_id = None
        package_key = "<unpackaged>" if package is None else package.stable_key
        package_root = "" if package is None else _package_root(package)
        path = _normalise_relative_path(
            node.path or node.stable_key.removeprefix("fs:")
        )
        if package_root and path.startswith(f"{package_root}/"):
            relative_path = path[len(package_root) + 1 :]
        else:
            relative_path = path
        segments = [segment for segment in relative_path.split("/") if segment]
        directories = segments[:-1]
        if len(directories) >= 2 and directories[0] in CONVENTIONAL_SOURCE_ROOTS:
            directories = directories[1:]
        zone_name = directories[0] if directories else "<root>"
        zones[node.id] = DependencyZone(
            package_id=package_id,
            package_key=package_key,
            package_root=package_root,
            name=zone_name,
            identity=f"{package_key}::{zone_name}",
        )
    return zones


def _nearest_rank(values: Iterable[int], percentile: int) -> int:
    ordered = sorted(int(value) for value in values)
    if not ordered:
        return 0
    rank = max(1, math.ceil((percentile / 100.0) * len(ordered)))
    return ordered[rank - 1]


def _file_dependency_diagnostics(
    graph: SnapshotGraph,
    package_by_node_id: dict[int, int],
) -> tuple[
    dict[int, DependencyZone],
    dict[int, FileDependencyStats],
    int,
    int,
    int,
]:
    nodes = graph.node_by_id
    zones = _dependency_zones(graph, package_by_node_id)
    incoming: dict[int, list[int]] = defaultdict(list)
    outgoing: dict[int, list[int]] = defaultdict(list)
    outgoing_cross: dict[int, list[int]] = defaultdict(list)
    incoming_cross_count: dict[int, int] = defaultdict(int)
    outgoing_cross_zones: dict[int, set[str]] = defaultdict(set)

    for edge in graph.edges:
        source = nodes[edge.source_id]
        target = nodes[edge.target_id]
        if (
            edge.kind != "imports"
            or edge.category == "change"
            or source.kind != "file"
            or target.kind != "file"
            or source.external
            or target.external
        ):
            continue
        incoming[target.id].append(edge.id)
        outgoing[source.id].append(edge.id)
        if zones[source.id].identity != zones[target.id].identity:
            outgoing_cross[source.id].append(edge.id)
            incoming_cross_count[target.id] += 1
            outgoing_cross_zones[source.id].add(zones[target.id].identity)

    stats: dict[int, FileDependencyStats] = {}
    dependency_totals: list[int] = []
    for node_id in sorted(zones, key=lambda candidate: nodes[candidate].stable_key):
        incoming_ids = tuple(sorted(incoming[node_id]))
        outgoing_ids = tuple(sorted(outgoing[node_id]))
        cross_ids = tuple(sorted(outgoing_cross[node_id]))
        cross_zone_ids = tuple(sorted(outgoing_cross_zones[node_id]))
        total = len(incoming_ids) + len(outgoing_ids)
        if total > 0:
            dependency_totals.append(total)
        stats[node_id] = FileDependencyStats(
            node_id=node_id,
            fan_in=len(incoming_ids),
            fan_out=len(outgoing_ids),
            cross_boundary_in=incoming_cross_count[node_id],
            cross_boundary_out=len(cross_ids),
            dependency_zone_count=len(cross_zone_ids),
            incoming_edge_ids=incoming_ids,
            outgoing_edge_ids=outgoing_ids,
            outgoing_cross_boundary_edge_ids=cross_ids,
            outgoing_cross_boundary_zone_ids=cross_zone_ids,
        )
    p98 = _nearest_rank(dependency_totals, 98)
    return zones, stats, p98, max(12, p98), len(dependency_totals)


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
        index
        for index, node in enumerate(graph.nodes)
        if node.kind == "file" and not node.external
    }
    relevant_edges = [
        edge
        for edge in graph.edges
        if edge.kind == "imports"
        and edge.category != "change"
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

    cycle_packages = [package for package in packages if not package.external]
    cycle_package_ids = {package.id for package in cycle_packages}
    package_index = {package.id: index for index, package in enumerate(cycle_packages)}
    package_graph = SnapshotGraph(
        database=graph.database,
        snapshot_id=graph.snapshot_id,
        repository_id=graph.repository_id,
        started_at=graph.started_at,
        observed_at=graph.observed_at,
        content_hash=graph.content_hash,
        nodes=tuple(cycle_packages),
        edges=(),
        capabilities=graph.capabilities,
    )
    pairs = {
        (package_index[source], package_index[target])
        for source, target in evidence_by_pair
        if source in cycle_package_ids and target in cycle_package_ids
    }
    eligible = set(range(len(cycle_packages)))
    cycles: list[Cycle] = []
    for indexes in _strong_components(package_graph, pairs, eligible):
        participating = {cycle_packages[index].id for index in indexes}
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
    (
        result.dependency_zone_by_node_id,
        result.file_dependency_stats,
        result.dependency_hub_p98,
        result.dependency_hub_threshold,
        result.dependency_file_population,
    ) = _file_dependency_diagnostics(graph, result.package_by_node_id)
    for node_id, stats in result.file_dependency_stats.items():
        result.node_metrics.extend(
            (
                NodeMetric(
                    node_id,
                    "architecture.cross_boundary_in",
                    float(stats.cross_boundary_in),
                    "imports",
                    f"{PROVENANCE};internal file imports crossing package/zone identity",
                ),
                NodeMetric(
                    node_id,
                    "architecture.cross_boundary_out",
                    float(stats.cross_boundary_out),
                    "imports",
                    f"{PROVENANCE};internal file imports crossing package/zone identity",
                ),
                NodeMetric(
                    node_id,
                    "architecture.dependency_zone_count",
                    float(stats.dependency_zone_count),
                    "zones",
                    f"{PROVENANCE};distinct outgoing cross-boundary target zones",
                ),
            )
        )
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

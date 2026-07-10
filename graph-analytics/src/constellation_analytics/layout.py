from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import importlib.metadata
import importlib.util
import math
from pathlib import Path
import sys
import types
from typing import Any
import warnings

import igraph as ig
import leidenalg as la
import numpy as np
from scipy import sparse

from .blobs import as_f32
from .database import PreviousPositions
from .model import ContractError, Edge, SnapshotGraph


LEIDEN_RESOLUTION = 0.75
LEIDEN_RESOLUTION_SCHEDULE = (0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0, 6.0, 8.0)
PRIMARY_STRUCTURE_KINDS = frozenset({"contains", "groups", "declares"})
LAYOUT_KIND_WEIGHTS = {
    "contains": 8.0,
    "groups": 12.0,
    "declares": 8.0,
    "imports": 3.0,
    "depends_on": 4.0,
    "calls": 2.5,
    "invokes": 2.0,
    "reads": 1.5,
    "writes": 1.5,
    "emits": 1.5,
    "consumes": 1.5,
    "flows_to": 1.5,
    "performs": 1.0,
    "acts_on": 1.0,
    "models": 1.0,
    "related_to": 0.75,
    "modifies": 0.25,
    "references": 0.25,
    "touches": 0.10,
}


@dataclass(frozen=True, slots=True)
class LayoutResult:
    coordinates_by_node_id: dict[int, tuple[float, float, float]]
    cluster_by_node_id: dict[int, int]
    bounds: dict[str, list[float]]
    parameters: dict[str, Any]
    previous_seed_count: int
    previous_snapshot_id: int | None


@dataclass(frozen=True, slots=True)
class LayoutEdgePolicy:
    include_change_history: bool
    capability_statuses: dict[str, str]
    excluded_change_edge_count: int
    excluded_change_edge_kinds: tuple[str, ...]
    reason: str

    def includes(self, edge: Edge) -> bool:
        return self.include_change_history or edge.category != "change"


@dataclass(frozen=True, slots=True)
class ClusteringResult:
    cluster_by_node_id: dict[int, int]
    algorithm: str
    resolution: float
    strategy: str
    anchor_count: int
    attempts: tuple[dict[str, float | int], ...]
    protected_internal_package_count: int
    protected_top_level_count: int


@dataclass(frozen=True, slots=True)
class ForceAtlas2Tuning:
    runtime_backend: str
    barnes_hut: bool
    barnes_hut_threshold: int
    barnes_hut_theta: float


def derive_layout_edge_policy(graph: SnapshotGraph) -> LayoutEdgePolicy:
    capability_names = ("git_history", "issue_file_touches")
    statuses = {
        name: graph.capabilities[name]
        for name in capability_names
        if name in graph.capabilities
    }
    include_change_history = bool(statuses) and all(
        status == "available" for status in statuses.values()
    )
    change_edges = [edge for edge in graph.edges if edge.category == "change"]
    if not statuses:
        reason = "no change-history capability declares complete coverage"
    elif include_change_history:
        reason = "all declared change-history capabilities are available"
    else:
        degraded = ",".join(
            f"{name}={status}" for name, status in sorted(statuses.items())
        )
        reason = f"change-history capability is not complete ({degraded})"
    return LayoutEdgePolicy(
        include_change_history=include_change_history,
        capability_statuses=statuses,
        excluded_change_edge_count=0 if include_change_history else len(change_edges),
        excluded_change_edge_kinds=()
        if include_change_history
        else tuple(sorted({edge.kind for edge in change_edges})),
        reason=reason,
    )


def _anchor_by_node_id(
    graph: SnapshotGraph,
    package_by_node_id: dict[int, int],
) -> dict[int, str]:
    nodes = graph.node_by_id
    anchors: dict[int, str] = {}
    for node in graph.nodes:
        package_id = package_by_node_id.get(node.id)
        if package_id is not None:
            package = nodes[package_id]
            if package.external:
                ecosystem = str(package.attributes.get("ecosystem", "unknown"))
                anchors[node.id] = f"external-package:{ecosystem}"
            else:
                anchors[node.id] = f"package:{package.stable_key}"
        elif node.path:
            anchors[node.id] = f"containment:{node.path.split('/', 1)[0]}"
        else:
            anchors[node.id] = f"category:{node.category}"
    return anchors


def _layout_edge_weight(edge: Edge) -> float:
    base = LAYOUT_KIND_WEIGHTS.get(edge.kind, 0.5)
    # Confidence can reduce attraction, but never turns an observed relation negative.
    return max(0.0, edge.weight) * max(0.05, edge.confidence) * base


def leiden_clusters(
    graph: SnapshotGraph,
    package_by_node_id: dict[int, int],
    edge_policy: LayoutEdgePolicy,
    *,
    seed: int,
) -> ClusteringResult:
    if not graph.nodes:
        return ClusteringResult({}, "none", 0.0, "empty", 0, (), 0, 0)
    anchor_by_id = _anchor_by_node_id(graph, package_by_node_id)
    anchors = sorted(set(anchor_by_id.values()))
    anchor_index = {anchor: index for index, anchor in enumerate(anchors)}
    internal_package_anchors = sorted(
        {
            anchor_by_id[node.id]
            for node in graph.nodes
            if node.kind == "package" and not node.external
        }
    )
    top_level_anchors = sorted(
        anchor for anchor in anchors if anchor.startswith("containment:")
    )
    weights_by_pair: dict[tuple[int, int], float] = defaultdict(float)
    for edge in graph.edges:
        if not edge_policy.includes(edge):
            continue
        source = anchor_index[anchor_by_id[edge.source_id]]
        target = anchor_index[anchor_by_id[edge.target_id]]
        if source == target:
            continue
        pair = (min(source, target), max(source, target))
        weights_by_pair[pair] += _layout_edge_weight(edge)

    attempts: list[dict[str, float | int]] = []
    algorithm = "leidenalg.RBConfigurationVertexPartition"
    selected_resolution = LEIDEN_RESOLUTION
    if len(anchors) == 1:
        membership = [0]
        strategy = "single-anchor"
    elif not weights_by_pair:
        membership = list(range(len(anchors)))
        strategy = "primary-anchor-no-relations"
    else:
        ordered_pairs = sorted(weights_by_pair)
        anchor_graph = ig.Graph(n=len(anchors), edges=ordered_pairs, directed=False)
        weights = [weights_by_pair[pair] for pair in ordered_pairs]
        membership = []
        strategy = "adaptive-rb-configuration"
        for resolution in LEIDEN_RESOLUTION_SCHEDULE:
            partition = la.find_partition(
                anchor_graph,
                la.RBConfigurationVertexPartition,
                weights=weights,
                n_iterations=-1,
                seed=seed,
                resolution_parameter=resolution,
            )
            candidate = [int(value) for value in partition.membership]
            cluster_count = len(set(candidate))
            internal_cluster_count = len(
                {candidate[anchor_index[anchor]] for anchor in internal_package_anchors}
            )
            top_level_cluster_count = len(
                {candidate[anchor_index[anchor]] for anchor in top_level_anchors}
            )
            attempts.append(
                {
                    "resolution": resolution,
                    "cluster_count": cluster_count,
                    "internal_package_cluster_count": internal_cluster_count,
                    "top_level_cluster_count": top_level_cluster_count,
                }
            )
            protected_are_separated = (
                internal_cluster_count >= 2
                if len(internal_package_anchors) >= 2
                else top_level_cluster_count >= 2
                if len(top_level_anchors) >= 2
                else cluster_count >= 2
            )
            membership = candidate
            selected_resolution = resolution
            if cluster_count >= 2 and protected_are_separated:
                break
        else:
            # A CPM resolution above every aggregate attraction keeps contract-derived
            # primary anchors separate while still using a Leiden partition.
            algorithm = "leidenalg.CPMVertexPartition"
            selected_resolution = max(weights) * 2.0 + 1.0
            partition = la.find_partition(
                anchor_graph,
                la.CPMVertexPartition,
                weights=weights,
                n_iterations=-1,
                seed=seed,
                resolution_parameter=selected_resolution,
            )
            membership = [int(value) for value in partition.membership]
            strategy = "cpm-primary-anchor-fallback"
            attempts.append(
                {
                    "resolution": selected_resolution,
                    "cluster_count": len(set(membership)),
                    "internal_package_cluster_count": len(
                        {
                            membership[anchor_index[anchor]]
                            for anchor in internal_package_anchors
                        }
                    ),
                    "top_level_cluster_count": len(
                        {
                            membership[anchor_index[anchor]]
                            for anchor in top_level_anchors
                        }
                    ),
                }
            )

    anchors_by_community: dict[int, list[str]] = defaultdict(list)
    for anchor, community in zip(anchors, membership, strict=True):
        anchors_by_community[community].append(anchor)
    ordered_communities = sorted(
        anchors_by_community,
        key=lambda community: min(anchors_by_community[community]),
    )
    stable_cluster = {
        community: index for index, community in enumerate(ordered_communities, start=1)
    }
    cluster_by_node_id = {
        node.id: stable_cluster[membership[anchor_index[anchor_by_id[node.id]]]]
        for node in graph.nodes
    }
    return ClusteringResult(
        cluster_by_node_id=cluster_by_node_id,
        algorithm=algorithm,
        resolution=selected_resolution,
        strategy=strategy,
        anchor_count=len(anchors),
        attempts=tuple(attempts),
        protected_internal_package_count=len(internal_package_anchors),
        protected_top_level_count=len(top_level_anchors),
    )


def _cluster_center(cluster_index: int, cluster_count: int) -> np.ndarray:
    if cluster_count <= 1:
        return np.zeros(3, dtype=np.float64)
    golden_angle = math.pi * (3.0 - math.sqrt(5.0))
    z = 1.0 - 2.0 * (cluster_index + 0.5) / cluster_count
    radial = math.sqrt(max(0.0, 1.0 - z * z))
    theta = golden_angle * cluster_index
    scale = 12.0 * max(1.0, cluster_count ** (1.0 / 3.0))
    return scale * np.asarray(
        [radial * math.cos(theta), radial * math.sin(theta), z],
        dtype=np.float64,
    )


def _local_offset(local_index: int) -> np.ndarray:
    golden_angle = math.pi * (3.0 - math.sqrt(5.0))
    angle = local_index * golden_angle
    radius = 0.65 * math.sqrt(local_index)
    return np.asarray(
        [
            radius * math.cos(angle),
            radius * math.sin(angle),
            0.55 * ((local_index % 7) - 3),
        ],
        dtype=np.float64,
    )


def _initial_positions(
    graph: SnapshotGraph,
    cluster_by_node_id: dict[int, int],
    previous: PreviousPositions | None,
) -> tuple[np.ndarray, int]:
    initial = np.zeros((len(graph.nodes), 3), dtype=np.float64)
    indexes_by_cluster: dict[int, list[int]] = defaultdict(list)
    for index, node in enumerate(graph.nodes):
        indexes_by_cluster[cluster_by_node_id[node.id]].append(index)
    for indexes in indexes_by_cluster.values():
        indexes.sort(key=lambda index: graph.nodes[index].stable_key)

    previous_coordinates = (
        {} if previous is None else previous.coordinates_by_stable_key
    )
    previous_seed_count = 0
    cluster_ids = sorted(indexes_by_cluster)
    for cluster_order, cluster_id in enumerate(cluster_ids):
        indexes = indexes_by_cluster[cluster_id]
        seeded = [
            np.asarray(
                previous_coordinates[graph.nodes[index].stable_key], dtype=np.float64
            )
            for index in indexes
            if graph.nodes[index].stable_key in previous_coordinates
        ]
        center = (
            np.mean(np.stack(seeded), axis=0)
            if seeded
            else _cluster_center(cluster_order, len(cluster_ids))
        )
        new_index = 0
        for index in indexes:
            stable_key = graph.nodes[index].stable_key
            if stable_key in previous_coordinates:
                initial[index] = np.asarray(
                    previous_coordinates[stable_key], dtype=np.float64
                )
                previous_seed_count += 1
            else:
                initial[index] = center + _local_offset(new_index)
                new_index += 1
    return initial, previous_seed_count


def _adjacency(
    graph: SnapshotGraph,
    cluster_by_node_id: dict[int, int],
    edge_policy: LayoutEdgePolicy,
) -> sparse.csr_matrix:
    node_count = len(graph.nodes)
    dense = graph.dense_index_by_id
    weights: dict[tuple[int, int], float] = defaultdict(float)
    for edge in graph.edges:
        if not edge_policy.includes(edge):
            continue
        source = dense[edge.source_id]
        target = dense[edge.target_id]
        if source == target:
            continue
        pair = (min(source, target), max(source, target))
        weights[pair] += _layout_edge_weight(edge)

    # Layout-only tethers retain Leiden communities without entering the renderer blob.
    indexes_by_cluster: dict[int, list[int]] = defaultdict(list)
    for index, node in enumerate(graph.nodes):
        indexes_by_cluster[cluster_by_node_id[node.id]].append(index)
    for indexes in indexes_by_cluster.values():
        indexes.sort(key=lambda index: graph.nodes[index].stable_key)
        if not indexes:
            continue
        anchor = indexes[0]
        for index in indexes[1:]:
            pair = (min(anchor, index), max(anchor, index))
            weights[pair] += 2.0

    if not weights:
        return sparse.csr_matrix((node_count, node_count), dtype=np.float64)
    rows: list[int] = []
    columns: list[int] = []
    values: list[float] = []
    for (source, target), weight in sorted(weights.items()):
        rows.extend((source, target))
        columns.extend((target, source))
        values.extend((weight, weight))
    return sparse.csr_matrix((values, (rows, columns)), shape=(node_count, node_count))


def _load_forceatlas2_class():
    try:
        from fa2 import ForceAtlas2

        return ForceAtlas2
    except ImportError as original_error:
        # fa2 ships a supported pure-Python fallback. Some Windows builds leave an
        # empty extension behind when compilation fails, which masks that fallback.
        try:
            distribution = importlib.metadata.distribution("fa2")
            package_dir = Path(distribution.locate_file("fa2"))
            util_path = package_dir / "fa2util.py"
            force_path = package_dir / "forceatlas2.py"
            if not util_path.is_file() or not force_path.is_file():
                raise original_error

            for name in tuple(sys.modules):
                if name == "fa2" or name.startswith("fa2."):
                    sys.modules.pop(name, None)
            package = types.ModuleType("fa2")
            package.__file__ = str(package_dir / "__init__.py")
            package.__package__ = "fa2"
            package.__path__ = [str(package_dir)]
            package.__version__ = distribution.version
            sys.modules["fa2"] = package

            util_spec = importlib.util.spec_from_file_location("fa2.fa2util", util_path)
            if util_spec is None or util_spec.loader is None:
                raise original_error
            util_module = importlib.util.module_from_spec(util_spec)
            sys.modules["fa2.fa2util"] = util_module
            util_spec.loader.exec_module(util_module)
            package.fa2util = util_module

            force_spec = importlib.util.spec_from_file_location(
                "fa2.forceatlas2", force_path
            )
            if force_spec is None or force_spec.loader is None:
                raise original_error
            force_module = importlib.util.module_from_spec(force_spec)
            sys.modules["fa2.forceatlas2"] = force_module
            force_spec.loader.exec_module(force_module)
            warnings.warn(
                "fa2 acceleration could not load; using its supported pure-Python backend",
                RuntimeWarning,
                stacklevel=2,
            )
            return force_module.ForceAtlas2
        except Exception as fallback_error:
            raise ContractError(
                "ForceAtlas2 could not load its compiled or pure-Python backend"
            ) from fallback_error


def _forceatlas2(
    adjacency: sparse.csr_matrix,
    initial: np.ndarray,
    *,
    seed: int,
    iterations: int,
) -> tuple[np.ndarray, ForceAtlas2Tuning]:
    ForceAtlas2 = _load_forceatlas2_class()
    util_module = sys.modules.get("fa2.fa2util")
    util_file = "" if util_module is None else str(getattr(util_module, "__file__", ""))
    accelerated = not util_file.lower().endswith(".py")
    if accelerated:
        tuning = ForceAtlas2Tuning(
            runtime_backend="compiled",
            barnes_hut=adjacency.shape[0] >= 1_000,
            barnes_hut_threshold=1_000,
            barnes_hut_theta=1.2,
        )
    else:
        threshold = 256
        tuning = ForceAtlas2Tuning(
            runtime_backend="python-fallback",
            barnes_hut=adjacency.shape[0] >= threshold,
            barnes_hut_threshold=threshold,
            barnes_hut_theta=1.6 if adjacency.shape[0] < 5_000 else 1.8,
        )
    engine = ForceAtlas2(
        outboundAttractionDistribution=False,
        linLogMode=True,
        adjustSizes=False,
        edgeWeightInfluence=1.0,
        jitterTolerance=1.0,
        barnesHutOptimize=tuning.barnes_hut,
        barnesHutTheta=tuning.barnes_hut_theta,
        scalingRatio=2.0,
        strongGravityMode=False,
        gravity=0.75,
        dim=3,
        backend="loop",
        seed=seed,
        verbose=False,
    )
    return (
        np.asarray(
            engine.forceatlas2(adjacency, pos=initial, iterations=iterations),
            dtype=np.float64,
        ),
        tuning,
    )


def compute_layout(
    graph: SnapshotGraph,
    package_by_node_id: dict[int, int],
    previous: PreviousPositions | None,
    *,
    seed: int,
    iterations: int,
) -> LayoutResult:
    if iterations < 1:
        raise ValueError("ForceAtlas2 iterations must be at least 1")
    edge_policy = derive_layout_edge_policy(graph)
    clustering = leiden_clusters(
        graph,
        package_by_node_id,
        edge_policy,
        seed=seed,
    )
    clusters = clustering.cluster_by_node_id
    initial, previous_seed_count = _initial_positions(graph, clusters, previous)
    tuning = ForceAtlas2Tuning("not-run", False, 256, 1.6)
    if not graph.nodes:
        final = initial
    elif len(graph.nodes) == 1:
        final = np.zeros((1, 3), dtype=np.float64)
    else:
        final, tuning = _forceatlas2(
            _adjacency(graph, clusters, edge_policy),
            initial,
            seed=seed,
            iterations=iterations,
        )
        if final.shape != (len(graph.nodes), 3):
            raise ContractError(f"ForceAtlas2 returned unexpected shape {final.shape}")
        final -= np.mean(final, axis=0)
    if not np.all(np.isfinite(final)):
        raise ContractError("ForceAtlas2 produced non-finite coordinates")

    coordinates: dict[int, tuple[float, float, float]] = {}
    for index, node in enumerate(graph.nodes):
        coordinates[node.id] = tuple(as_f32(float(value)) for value in final[index])
    if coordinates:
        axes = list(zip(*coordinates.values(), strict=True))
        bounds = {
            "min": [float(min(axis)) for axis in axes],
            "max": [float(max(axis)) for axis in axes],
        }
    else:
        bounds = {"min": [0.0, 0.0, 0.0], "max": [0.0, 0.0, 0.0]}

    parameters: dict[str, Any] = {
        "seed": seed,
        "iterations": iterations,
        "community_algorithm": clustering.algorithm,
        "community_resolution": clustering.resolution,
        "community_resolution_attempts": clustering.attempts,
        "community_strategy": clustering.strategy,
        "community_anchor_count": clustering.anchor_count,
        "community_anchor_strategy": (
            "internal-package,external-ecosystem,then-top-level-containment"
        ),
        "community_protected_internal_package_count": (
            clustering.protected_internal_package_count
        ),
        "community_protected_top_level_count": clustering.protected_top_level_count,
        "primary_structure": sorted(PRIMARY_STRUCTURE_KINDS),
        "layout_relation_weights": dict(sorted(LAYOUT_KIND_WEIGHTS.items())),
        "layout_edge_policy": {
            "change_history_included": edge_policy.include_change_history,
            "change_history_capabilities": edge_policy.capability_statuses,
            "excluded_change_edge_count": edge_policy.excluded_change_edge_count,
            "excluded_change_edge_kinds": edge_policy.excluded_change_edge_kinds,
            "edge_blob_retains_excluded_relations": True,
            "reason": edge_policy.reason,
        },
        "forceatlas2": {
            "dimensions": 3,
            "lin_log_mode": True,
            "gravity": 0.75,
            "scaling_ratio": 2.0,
            "backend": "loop",
            "runtime_backend": tuning.runtime_backend,
            "barnes_hut": tuning.barnes_hut,
            "barnes_hut_threshold": tuning.barnes_hut_threshold,
            "barnes_hut_theta": tuning.barnes_hut_theta,
        },
        "previous_snapshot_id": None if previous is None else previous.snapshot_id,
        "previous_layout_id": None if previous is None else previous.layout_id,
        "previous_seed_count": previous_seed_count,
        "issue_file_touches_capability": graph.capabilities.get(
            "issue_file_touches", "unavailable"
        ),
        "change_history_used_for_architectural_ranking": False,
        "libraries": {
            name: importlib.metadata.version(name)
            for name in ("fa2", "igraph", "leidenalg", "networkit", "numpy", "scipy")
        },
    }
    return LayoutResult(
        coordinates_by_node_id=coordinates,
        cluster_by_node_id=clusters,
        bounds=bounds,
        parameters=parameters,
        previous_seed_count=previous_seed_count,
        previous_snapshot_id=None if previous is None else previous.snapshot_id,
    )


def node_radius(kind: str) -> float:
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
    }.get(kind, 0.5)


def node_flags(*, category: str, external: bool, synthetic: bool) -> int:
    flags = 0
    if external:
        flags |= 1 << 0
    if category == "semantic":
        flags |= 1 << 1
    if category == "change":
        flags |= 1 << 2
    if synthetic:
        flags |= 1 << 3
    return flags

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass(frozen=True, slots=True)
class Node:
    id: int
    stable_key: str
    kind: str
    category: str
    render_code: int
    name: str
    path: str | None
    external: bool
    attributes: dict[str, Any]


@dataclass(frozen=True, slots=True)
class Edge:
    id: int
    stable_key: str
    source_id: int
    target_id: int
    kind: str
    category: str
    render_code: int
    directed: bool
    weight: float
    confidence: float
    derived: bool


@dataclass(frozen=True, slots=True)
class SnapshotGraph:
    database: Path
    snapshot_id: int
    repository_id: int
    started_at: str
    observed_at: str
    content_hash: str
    nodes: tuple[Node, ...]
    edges: tuple[Edge, ...]
    capabilities: dict[str, str]

    @property
    def node_by_id(self) -> dict[int, Node]:
        return {node.id: node for node in self.nodes}

    @property
    def dense_index_by_id(self) -> dict[int, int]:
        return {node.id: index for index, node in enumerate(self.nodes)}


@dataclass(frozen=True, slots=True)
class NodeMetric:
    node_id: int
    key: str
    value: float
    unit: str
    provenance: str


@dataclass(frozen=True, slots=True)
class SnapshotMetric:
    key: str
    value: float
    unit: str
    provenance: str


@dataclass(frozen=True, slots=True)
class Cycle:
    node_ids: tuple[int, ...]
    edge_ids: tuple[int, ...]


@dataclass(frozen=True, slots=True)
class FindingCandidate:
    fingerprint: str
    rule_key: str
    category: str
    severity: str
    title: str
    recommendation: str
    detail: str
    attributes: dict[str, Any]
    nodes: tuple[tuple[int, str], ...]
    edges: tuple[tuple[int, str], ...]


@dataclass(slots=True)
class AnalyticsResult:
    node_metrics: list[NodeMetric] = field(default_factory=list)
    snapshot_metrics: list[SnapshotMetric] = field(default_factory=list)
    node_cycles: list[Cycle] = field(default_factory=list)
    package_cycles: list[Cycle] = field(default_factory=list)
    package_by_node_id: dict[int, int] = field(default_factory=dict)
    component_by_node_id: dict[int, int] = field(default_factory=dict)
    betweenness_samples: int = 0


class ContractError(RuntimeError):
    """Raised when an input database or blob disagrees with contract v1."""

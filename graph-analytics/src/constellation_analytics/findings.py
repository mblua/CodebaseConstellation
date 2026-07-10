from __future__ import annotations

import hashlib

from .analytics import PROVENANCE
from .model import AnalyticsResult, Cycle, FindingCandidate, SnapshotGraph


NODE_CYCLE_RULE = "architecture_dependency_cycle"
PACKAGE_CYCLE_RULE = "package_dependency_cycle"
OWNED_FINDING_RULES = frozenset({NODE_CYCLE_RULE, PACKAGE_CYCLE_RULE})


def _fingerprint(prefix: str, stable_keys: list[str]) -> str:
    canonical = "\n".join(sorted(stable_keys)).encode("utf-8")
    return f"{prefix}:v1:{hashlib.sha256(canonical).hexdigest()}"


def _display_names(graph: SnapshotGraph, cycle: Cycle) -> str:
    nodes = graph.node_by_id
    names = [nodes[node_id].name for node_id in cycle.node_ids]
    if len(names) <= 3:
        return ", ".join(names)
    return f"{', '.join(names[:3])}, and {len(names) - 3} more"


def _roles(ids: list[int]) -> tuple[tuple[int, str], ...]:
    return tuple(
        (candidate, "primary" if index == 0 else "participant")
        for index, candidate in enumerate(ids)
    )


def _candidate(
    graph: SnapshotGraph,
    cycle: Cycle,
    *,
    rule_key: str,
    fingerprint_prefix: str,
    package_level: bool,
) -> FindingCandidate:
    nodes = graph.node_by_id
    edges = {edge.id: edge for edge in graph.edges}
    ordered_node_ids = sorted(
        cycle.node_ids, key=lambda node_id: nodes[node_id].stable_key
    )
    ordered_edge_ids = sorted(
        cycle.edge_ids, key=lambda edge_id: edges[edge_id].stable_key
    )
    stable_keys = [nodes[node_id].stable_key for node_id in ordered_node_ids]
    edge_kinds = sorted({edges[edge_id].kind for edge_id in ordered_edge_ids})
    names = _display_names(
        graph,
        Cycle(tuple(ordered_node_ids), tuple(ordered_edge_ids)),
    )
    if package_level:
        title = f"Mutual package dependencies couple {names}"
        recommendation = (
            "Choose one package as the dependency owner, then invert the return dependency "
            "through a narrow interface or event contract so the package graph becomes one-way."
        )
        detail = (
            f"A package-collapsed dependency cycle spans {len(ordered_node_ids)} packages and "
            f"{len(ordered_edge_ids)} supporting relations ({', '.join(edge_kinds)})."
        )
    else:
        title = f"Dependency cycle connects {names}"
        recommendation = (
            "Break one edge in the cycle by moving the shared contract behind a one-way "
            "interface or by inverting that dependency at the narrowest boundary."
        )
        detail = (
            f"A dependency strongly connected component spans {len(ordered_node_ids)} nodes and "
            f"{len(ordered_edge_ids)} internal relations ({', '.join(edge_kinds)})."
        )
    return FindingCandidate(
        fingerprint=_fingerprint(fingerprint_prefix, stable_keys),
        rule_key=rule_key,
        category="architecture",
        severity="warning",
        title=title,
        recommendation=recommendation,
        detail=detail,
        attributes={
            "analytics_provenance": PROVENANCE,
            "stable_node_keys": stable_keys,
            "edge_kinds": edge_kinds,
            "package_level": package_level,
        },
        nodes=_roles(ordered_node_ids),
        edges=_roles(ordered_edge_ids),
    )


def build_findings(
    graph: SnapshotGraph,
    analytics: AnalyticsResult,
) -> list[FindingCandidate]:
    findings = [
        _candidate(
            graph,
            cycle,
            rule_key=NODE_CYCLE_RULE,
            fingerprint_prefix="dependency-cycle",
            package_level=False,
        )
        for cycle in analytics.node_cycles
    ]
    findings.extend(
        _candidate(
            graph,
            cycle,
            rule_key=PACKAGE_CYCLE_RULE,
            fingerprint_prefix="package-dependency-cycle",
            package_level=True,
        )
        for cycle in analytics.package_cycles
    )
    findings.sort(key=lambda finding: (finding.rule_key, finding.fingerprint))
    return findings

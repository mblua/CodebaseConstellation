from __future__ import annotations

import hashlib

from .analytics import PROVENANCE
from .model import AnalyticsResult, Cycle, FindingCandidate, SnapshotGraph


NODE_CYCLE_RULE = "architecture_dependency_cycle"
PACKAGE_CYCLE_RULE = "package_dependency_cycle"
DEPENDENCY_HUB_RULE = "architecture_dependency_hub"
BOUNDARY_SPRAWL_RULE = "architecture_boundary_sprawl"
OWNED_FINDING_RULES = frozenset(
    {
        NODE_CYCLE_RULE,
        PACKAGE_CYCLE_RULE,
        DEPENDENCY_HUB_RULE,
        BOUNDARY_SPRAWL_RULE,
    }
)


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


def _dependency_hub_findings(
    graph: SnapshotGraph,
    analytics: AnalyticsResult,
) -> list[FindingCandidate]:
    nodes = graph.node_by_id
    edges = {edge.id: edge for edge in graph.edges}
    findings: list[FindingCandidate] = []
    for node_id in sorted(
        analytics.file_dependency_stats,
        key=lambda candidate: nodes[candidate].stable_key,
    ):
        stats = analytics.file_dependency_stats[node_id]
        total_fan = stats.fan_in + stats.fan_out
        if (
            stats.fan_in == 0
            or stats.fan_out == 0
            or total_fan < analytics.dependency_hub_threshold
        ):
            continue
        edge_ids = sorted(set(stats.incoming_edge_ids + stats.outgoing_edge_ids))
        participant_ids = sorted(
            {
                endpoint
                for edge_id in edge_ids
                for endpoint in (edges[edge_id].source_id, edges[edge_id].target_id)
                if endpoint != node_id
            },
            key=lambda candidate: nodes[candidate].stable_key,
        )
        primary = nodes[node_id]
        attributes = {
            "analytics_provenance": PROVENANCE,
            "primary_stable_key": primary.stable_key,
            "fan_in": stats.fan_in,
            "fan_out": stats.fan_out,
            "fan_total": total_fan,
            "minimum_fan_total": 12,
            "percentile": 98,
            "p98_nearest_rank": analytics.dependency_hub_p98,
            "effective_fan_total_threshold": analytics.dependency_hub_threshold,
            "dependency_file_population": analytics.dependency_file_population,
            "edge_kind": "imports",
        }
        findings.append(
            FindingCandidate(
                fingerprint=_fingerprint("dependency-hub", [primary.stable_key]),
                rule_key=DEPENDENCY_HUB_RULE,
                category="architecture",
                severity="info",
                title=f"Dependency hub coordinates {primary.path or primary.name}",
                recommendation=(
                    "Inspect whether this file combines orchestration with a shared contract; "
                    "separate responsibilities only where a narrower interface preserves the "
                    "legitimate inbound and outbound dependencies."
                ),
                detail=(
                    f"The file has {stats.fan_in} inbound and {stats.fan_out} outbound "
                    f"internal imports (total {total_fan}), meeting the deterministic "
                    f"threshold {analytics.dependency_hub_threshold}."
                ),
                attributes=attributes,
                nodes=((node_id, "primary"),)
                + tuple((candidate, "participant") for candidate in participant_ids),
                edges=tuple((edge_id, "evidence") for edge_id in edge_ids),
            )
        )
    return findings


def _zone_attributes(zone) -> dict[str, str]:
    return {
        "identity": zone.identity,
        "package_key": zone.package_key,
        "package_root": zone.package_root,
        "zone": zone.name,
    }


def _boundary_sprawl_findings(
    graph: SnapshotGraph,
    analytics: AnalyticsResult,
) -> list[FindingCandidate]:
    nodes = graph.node_by_id
    edges = {edge.id: edge for edge in graph.edges}
    zone_by_identity = {
        zone.identity: zone for zone in analytics.dependency_zone_by_node_id.values()
    }
    findings: list[FindingCandidate] = []
    for node_id in sorted(
        analytics.file_dependency_stats,
        key=lambda candidate: nodes[candidate].stable_key,
    ):
        stats = analytics.file_dependency_stats[node_id]
        if stats.cross_boundary_out < 5 or stats.dependency_zone_count < 3:
            continue
        edge_ids = list(stats.outgoing_cross_boundary_edge_ids)
        participant_ids = sorted(
            {edges[edge_id].target_id for edge_id in edge_ids},
            key=lambda candidate: nodes[candidate].stable_key,
        )
        zone_edge_counts: dict[str, int] = {}
        for edge_id in edge_ids:
            target_zone = analytics.dependency_zone_by_node_id[edges[edge_id].target_id]
            zone_edge_counts[target_zone.identity] = (
                zone_edge_counts.get(target_zone.identity, 0) + 1
            )
        target_zones = []
        for identity in sorted(zone_edge_counts):
            zone = zone_by_identity[identity]
            target_zones.append(
                {**_zone_attributes(zone), "import_count": zone_edge_counts[identity]}
            )
        primary = nodes[node_id]
        attributes = {
            "analytics_provenance": PROVENANCE,
            "primary_stable_key": primary.stable_key,
            "outgoing_cross_boundary_imports": stats.cross_boundary_out,
            "distinct_target_zone_count": stats.dependency_zone_count,
            "minimum_outgoing_cross_boundary_imports": 5,
            "minimum_distinct_target_zones": 3,
            "source_zone": _zone_attributes(
                analytics.dependency_zone_by_node_id[node_id]
            ),
            "target_zones": target_zones,
            "edge_kind": "imports",
        }
        findings.append(
            FindingCandidate(
                fingerprint=_fingerprint("boundary-sprawl", [primary.stable_key]),
                rule_key=BOUNDARY_SPRAWL_RULE,
                category="architecture",
                severity="warning",
                title=f"Boundary sprawl originates in {primary.path or primary.name}",
                recommendation=(
                    "Introduce a focused facade or move coordination to the owning boundary "
                    "so this file depends on fewer architectural zones."
                ),
                detail=(
                    f"The file sends {stats.cross_boundary_out} internal imports across "
                    f"package/zone boundaries into {stats.dependency_zone_count} target zones."
                ),
                attributes=attributes,
                nodes=((node_id, "primary"),)
                + tuple((candidate, "participant") for candidate in participant_ids),
                edges=tuple((edge_id, "evidence") for edge_id in edge_ids),
            )
        )
    return findings


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
    findings.extend(_dependency_hub_findings(graph, analytics))
    findings.extend(_boundary_sprawl_findings(graph, analytics))
    findings.sort(key=lambda finding: (finding.rule_key, finding.fingerprint))
    return findings

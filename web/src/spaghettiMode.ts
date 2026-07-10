import type { FilterState } from "./filterState";
import type { FindingInfo, GraphDataset, MetricInfo } from "./model";

export type DiagnosticClass = "cycle" | "hub" | "boundary-sprawl";

export const DIAGNOSTIC_CODE: Readonly<Record<DiagnosticClass, number>> = {
  cycle: 1,
  hub: 2,
  "boundary-sprawl": 3,
};

const DIAGNOSTIC_PRIORITY: Readonly<Record<DiagnosticClass, number>> = {
  cycle: 3,
  "boundary-sprawl": 2,
  hub: 1,
};

const FRIENDLY_METRICS: Readonly<Record<string, { label: string; detail: string }>> = {
  "architecture.fan_in": {
    label: "Dependency fan-in",
    detail: "Internal files that import this file.",
  },
  "architecture.fan_out": {
    label: "Dependency fan-out",
    detail: "Internal files imported by this file.",
  },
  "architecture.cross_boundary_in": {
    label: "Detected boundary imports in",
    detail: "Incoming imports that cross a detected package or path zone.",
  },
  "architecture.cross_boundary_out": {
    label: "Detected boundary imports out",
    detail: "Outgoing imports that cross a detected package or path zone.",
  },
  "architecture.dependency_zone_count": {
    label: "Dependency zones reached",
    detail: "Distinct detected dependency zones reached by outgoing imports.",
  },
  "architecture.dependency_cycle_member": {
    label: "Cycle membership",
    detail: "Whether this file participates in a recorded dependency cycle.",
  },
  loc: {
    label: "Lines of code",
    detail: "Recorded source lines; the browser does not recalculate LOC.",
  },
};

export function diagnosticClassForFinding(finding: Pick<FindingInfo, "ruleKey">): DiagnosticClass | null {
  switch (finding.ruleKey) {
    case "architecture_dependency_cycle":
      return "cycle";
    case "architecture_dependency_hub":
      return "hub";
    case "architecture_boundary_sprawl":
      return "boundary-sprawl";
    default:
      return null;
  }
}

export function diagnosticClassLabel(diagnosticClass: DiagnosticClass): string {
  switch (diagnosticClass) {
    case "cycle":
      return "Dependency cycle";
    case "hub":
      return "Dependency hub";
    case "boundary-sprawl":
      return "Boundary sprawl";
  }
}

export function diagnosticClassSummary(diagnosticClass: DiagnosticClass): string {
  switch (diagnosticClass) {
    case "cycle":
      return "These files import one another in a closed loop.";
    case "hub":
      return "This file both coordinates and depends on an unusually large dependency neighborhood.";
    case "boundary-sprawl":
      return "Outgoing imports cross several detected package or path zones.";
  }
}

function numericAttribute(attributes: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = attributes[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

export function findingImpact(finding: FindingInfo): number {
  const diagnosticClass = diagnosticClassForFinding(finding);
  if (diagnosticClass === "cycle") {
    return numericAttribute(finding.attributes, ["cycle_size", "component_size", "member_count", "node_count"])
      ?? finding.nodes.length;
  }
  if (diagnosticClass === "hub") {
    const fanIn = numericAttribute(finding.attributes, ["fan_in", "architecture.fan_in"]);
    const fanOut = numericAttribute(finding.attributes, ["fan_out", "architecture.fan_out"]);
    return fanIn !== null || fanOut !== null
      ? (fanIn ?? 0) + (fanOut ?? 0)
      : numericAttribute(finding.attributes, ["dependency_count", "total_degree", "observed_degree"])
        ?? finding.edges.length;
  }
  if (diagnosticClass === "boundary-sprawl") {
    const crossings = numericAttribute(finding.attributes, [
      "cross_boundary_out",
      "architecture.cross_boundary_out",
      "outgoing_cross_boundary_imports",
    ]) ?? finding.edges.length;
    const zones = numericAttribute(finding.attributes, [
      "dependency_zone_count",
      "architecture.dependency_zone_count",
      "zone_count",
    ]) ?? 0;
    return crossings * 1000 + zones;
  }
  return 0;
}

export function findingMeasure(finding: FindingInfo): string {
  const diagnosticClass = diagnosticClassForFinding(finding);
  if (diagnosticClass === "cycle") {
    const members = numericAttribute(finding.attributes, ["cycle_size", "component_size", "member_count", "node_count"])
      ?? new Set(finding.nodes.map((attachment) => attachment.id.toString())).size;
    return `${members} file${members === 1 ? "" : "s"} in the loop`;
  }
  if (diagnosticClass === "hub") {
    const fanIn = numericAttribute(finding.attributes, ["fan_in", "architecture.fan_in"]);
    const fanOut = numericAttribute(finding.attributes, ["fan_out", "architecture.fan_out"]);
    if (fanIn !== null || fanOut !== null) return `${fanIn ?? 0} in · ${fanOut ?? 0} out`;
    return `${finding.edges.length} supporting dependencies`;
  }
  if (diagnosticClass === "boundary-sprawl") {
    const crossings = numericAttribute(finding.attributes, [
      "cross_boundary_out",
      "architecture.cross_boundary_out",
      "outgoing_cross_boundary_imports",
    ]) ?? finding.edges.length;
    const zones = numericAttribute(finding.attributes, [
      "dependency_zone_count",
      "architecture.dependency_zone_count",
      "zone_count",
    ]);
    return zones === null
      ? `${crossings} outgoing boundary imports`
      : `${crossings} boundary imports · ${zones} zones`;
  }
  return `${finding.nodes.length} participants`;
}

export function rankSpaghettiFindings(findings: readonly FindingInfo[]): FindingInfo[] {
  const severityRank = { error: 0, warning: 1, info: 2 } as const;
  return findings
    .filter((finding) =>
      diagnosticClassForFinding(finding) !== null
      && (finding.status === "open" || finding.status === "acknowledged"))
    .slice()
    .sort((left, right) =>
      severityRank[left.severity] - severityRank[right.severity]
      || findingImpact(right) - findingImpact(left)
      || Number(left.id - right.id));
}

export function buildDiagnosticNodeClasses(
  nodeCount: number,
  nodeIndexById: ReadonlyMap<string, number>,
  findings: readonly FindingInfo[],
): Float32Array {
  const classes = new Float32Array(nodeCount);
  const priorities = new Uint8Array(nodeCount);
  for (const finding of rankSpaghettiFindings(findings)) {
    const diagnosticClass = diagnosticClassForFinding(finding);
    if (!diagnosticClass) continue;
    const priority = DIAGNOSTIC_PRIORITY[diagnosticClass];
    for (const attachment of finding.nodes) {
      const index = nodeIndexById.get(attachment.id.toString());
      if (index === undefined || priority <= (priorities[index] ?? 0)) continue;
      priorities[index] = priority;
      classes[index] = DIAGNOSTIC_CODE[diagnosticClass];
    }
  }
  return classes;
}

export function applySpaghettiPreset(dataset: GraphDataset, filters: FilterState): void {
  const availableNodeKinds = new Set(dataset.nodeKinds.filter((kind) => kind.count > 0).map((kind) => kind.key));
  filters.enabledNodeKinds = new Set(
    ["file", "package", "directory"].filter((kind) => availableNodeKinds.has(kind)),
  );
  filters.enabledEdgeKinds = new Set(
    dataset.edgeKinds
      .filter((kind) => kind.count > 0 && kind.category === "dependency")
      .map((kind) => kind.key),
  );
  filters.enabledLayers = new Set(["dependency"]);
  filters.relationMode = "all";
  filters.selectedNodeIndex = null;
  filters.isolation = null;
}

export function friendlyMetric(metric: Pick<MetricInfo, "key">): { label: string; detail: string } {
  return FRIENDLY_METRICS[metric.key] ?? {
    label: metric.key.replaceAll("_", " ").replaceAll(".", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    detail: "Recorded metric from the database.",
  };
}

export function metricDisplayOrder(metric: Pick<MetricInfo, "key">): number {
  const keys = [
    "architecture.fan_in",
    "architecture.fan_out",
    "architecture.cross_boundary_in",
    "architecture.cross_boundary_out",
    "architecture.dependency_zone_count",
    "architecture.dependency_cycle_member",
    "loc",
  ];
  const index = keys.indexOf(metric.key);
  return index === -1 ? keys.length : index;
}

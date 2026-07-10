import { describe, expect, it } from "vitest";
import { createInitialFilterState } from "../src/filterState";
import type { FindingInfo, GraphDataset } from "../src/model";
import {
  applySpaghettiPreset,
  buildDiagnosticNodeClasses,
  diagnosticClassForFinding,
  DIAGNOSTIC_CODE,
  findingMeasure,
  friendlyMetric,
  rankSpaghettiFindings,
} from "../src/spaghettiMode";
import { hasChangeEdges, shouldHideHistoryCapability } from "../src/snapshotUx";

function finding(
  id: bigint,
  ruleKey: string,
  severity: FindingInfo["severity"],
  attributes: Record<string, unknown>,
  nodeIds: bigint[],
  edgeIds: bigint[] = [],
): FindingInfo {
  return {
    id,
    ruleKey,
    title: ruleKey,
    detail: "recorded detail",
    recommendation: "recorded recommendation",
    category: "architecture",
    severity,
    status: "open",
    role: null,
    attributes,
    nodes: nodeIds.map((nodeId, index) => ({ id: nodeId, role: index === 0 ? "primary" : "participant" })),
    edges: edgeIds.map((edgeId) => ({ id: edgeId, role: "evidence" })),
  };
}

function presetDataset(): GraphDataset {
  return {
    sourceLabel: "test.sqlite",
    snapshot: {
      id: 1n,
      repositoryId: 1n,
      repositoryName: "test",
      revision: "abc",
      historyMode: "absent",
      visibleCommitCount: 0,
      completedAt: "2026-01-01T00:00:00Z",
    },
    layout: {
      id: 1n,
      snapshotId: 1n,
      name: "test",
      algorithm: "test",
      dimensions: 3,
      bounds: { min: [0, 0, 0], max: [1, 1, 1] },
      nodeCount: 4,
      edgeCount: 3,
    },
    capabilities: [],
    nodeKinds: [
      { key: "directory", category: "structural", renderCode: 2, description: "directory", count: 1 },
      { key: "file", category: "structural", renderCode: 3, description: "file", count: 2 },
      { key: "package", category: "structural", renderCode: 4, description: "package", count: 1 },
      { key: "commit", category: "change", renderCode: 12, description: "commit", count: 1 },
    ],
    edgeKinds: [
      { key: "contains", category: "structural", renderCode: 1, directed: true, description: "contains", count: 1 },
      { key: "imports", category: "dependency", renderCode: 4, directed: true, description: "imports", count: 1 },
      { key: "calls", category: "execution", renderCode: 5, directed: true, description: "calls", count: 1 },
      { key: "touches", category: "change", renderCode: 19, directed: true, description: "touches", count: 1 },
    ],
    positions: {
      snapshotId: 1n,
      layoutId: 1n,
      nodeIds: new BigUint64Array([10n, 11n, 12n, 13n]),
      coordinates: new Float32Array(12),
      radii: new Float32Array([1, 1, 1, 1]),
      kindCodes: new Uint16Array([2, 3, 3, 4]),
      flags: new Uint16Array(4),
      clusterIds: new Uint32Array(4),
    },
    edges: {
      snapshotId: 1n,
      layoutId: 1n,
      edgeIds: new BigUint64Array([20n, 21n, 22n]),
      sourceIndices: new Uint32Array([0, 1, 2]),
      targetIndices: new Uint32Array([1, 2, 3]),
      kindCodes: new Uint16Array([1, 4, 5]),
      flags: new Uint16Array([1, 1, 1]),
      weights: new Float32Array([1, 1, 1]),
    },
    nodeIndexById: new Map([["10", 0], ["11", 1], ["12", 2], ["13", 3]]),
    edgeIndexById: new Map([["20", 0], ["21", 1], ["22", 2]]),
  };
}

describe("Spaghetti investigation helpers", () => {
  it("recognizes, ranks, and describes diagnostics by severity then measured impact", () => {
    const hub = finding(1n, "architecture_dependency_hub", "info", { fan_in: 18, fan_out: 7 }, [10n], [20n]);
    const smallCycle = finding(2n, "architecture_dependency_cycle", "warning", {}, [10n, 11n], [21n, 22n]);
    const sprawl = finding(
      3n,
      "architecture_boundary_sprawl",
      "warning",
      { cross_boundary_out: 7, dependency_zone_count: 4 },
      [12n],
      [23n, 24n, 25n, 26n, 27n, 28n, 29n],
    );
    const unrelated = finding(4n, "large_file", "error", {}, [13n]);

    expect(diagnosticClassForFinding(hub)).toBe("hub");
    expect(rankSpaghettiFindings([hub, smallCycle, unrelated, sprawl]).map((item) => item.id))
      .toEqual([3n, 2n, 1n]);
    expect(findingMeasure(hub)).toBe("18 in · 7 out");
    expect(findingMeasure(sprawl)).toBe("7 boundary imports · 4 zones");
  });

  it("uses the highest-priority recorded class for overlapping participants", () => {
    const hub = finding(1n, "architecture_dependency_hub", "info", { fan_in: 9, fan_out: 9 }, [10n]);
    const cycle = finding(2n, "architecture_dependency_cycle", "warning", {}, [10n, 11n]);
    const classes = buildDiagnosticNodeClasses(3, new Map([["10", 0], ["11", 1], ["12", 2]]), [hub, cycle]);
    expect([...classes]).toEqual([DIAGNOSTIC_CODE.cycle, DIAGNOSTIC_CODE.cycle, 0]);
  });

  it("enables only current dependency relations and file/package/directory kinds", () => {
    const dataset = presetDataset();
    const filters = createInitialFilterState(dataset);
    applySpaghettiPreset(dataset, filters);
    expect(filters.enabledLayers).toEqual(new Set(["dependency"]));
    expect(filters.enabledNodeKinds).toEqual(new Set(["file", "package", "directory"]));
    expect(filters.enabledEdgeKinds).toEqual(new Set(["imports"]));
    expect(filters.enabledEdgeKinds.has("touches")).toBe(false);
    expect(filters.relationMode).toBe("all");
  });

  it("provides friendly labels for the recorded diagnostic metrics", () => {
    expect(friendlyMetric({ key: "architecture.fan_in" }).label).toBe("Dependency fan-in");
    expect(friendlyMetric({ key: "architecture.cross_boundary_out" }).label)
      .toBe("Detected boundary imports out");
    expect(friendlyMetric({ key: "architecture.dependency_zone_count" }).label)
      .toBe("Dependency zones reached");
    expect(friendlyMetric({ key: "architecture.dependency_cycle_member" }).label)
      .toBe("Cycle membership");
    expect(friendlyMetric({ key: "loc" }).label).toBe("Lines of code");
  });

  it("treats absent history as intentional current-source scope", () => {
    expect(hasChangeEdges([
      { category: "change", count: 0 },
      { category: "dependency", count: 12 },
    ])).toBe(false);
    expect(hasChangeEdges([{ category: "change", count: 1 }])).toBe(true);
    expect(shouldHideHistoryCapability("absent", "git_history")).toBe(true);
    expect(shouldHideHistoryCapability("absent", "issue_file_touches")).toBe(true);
    expect(shouldHideHistoryCapability("shallow", "git_history")).toBe(false);
    expect(shouldHideHistoryCapability("absent", "syntax_graph")).toBe(false);
  });
});

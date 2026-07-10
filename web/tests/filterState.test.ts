import { describe, expect, it } from "vitest";
import {
  computeRenderState,
  createInitialFilterState,
  setMembership,
} from "../src/filterState";
import type { GraphDataset } from "../src/model";

function dataset(): GraphDataset {
  const positions = {
    snapshotId: 1n,
    layoutId: 1n,
    nodeIds: new BigUint64Array([10n, 11n, 12n]),
    coordinates: new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]),
    radii: new Float32Array([1, 1, 1]),
    kindCodes: new Uint16Array([3, 7, 8]),
    flags: new Uint16Array([0, 2, 2]),
    clusterIds: new Uint32Array([1, 2, 2]),
  };
  const edges = {
    snapshotId: 1n,
    layoutId: 1n,
    edgeIds: new BigUint64Array([20n, 21n, 22n]),
    sourceIndices: new Uint32Array([0, 0, 1]),
    targetIndices: new Uint32Array([1, 2, 2]),
    kindCodes: new Uint16Array([1, 4, 13]),
    flags: new Uint16Array([1, 1, 1]),
    weights: new Float32Array([1, 1, 1]),
  };
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
      bounds: { min: [0, 0, 0], max: [2, 0, 0] },
      nodeCount: 3,
      edgeCount: 3,
    },
    capabilities: [],
    nodeKinds: [
      { key: "file", category: "structural", renderCode: 3, description: "file", count: 1 },
      { key: "actor", category: "semantic", renderCode: 7, description: "actor", count: 1 },
      { key: "concept", category: "semantic", renderCode: 8, description: "concept", count: 1 },
    ],
    edgeKinds: [
      { key: "contains", category: "structural", renderCode: 1, directed: true, description: "contains", count: 1 },
      { key: "imports", category: "dependency", renderCode: 4, directed: true, description: "imports", count: 1 },
      { key: "performs", category: "semantic", renderCode: 13, directed: true, description: "performs", count: 1 },
    ],
    positions,
    edges,
    nodeIndexById: new Map([["10", 0], ["11", 1], ["12", 2]]),
  };
}

describe("filter and selection state", () => {
  it("starts with the node subgraph induced by structural edges", () => {
    const graph = dataset();
    const filters = createInitialFilterState(graph);
    const state = computeRenderState(graph, filters);
    expect(filters.enabledLayers).toEqual(new Set(["structural"]));
    expect([...state.nodeAlpha]).toEqual([1, 1, 0]);
    expect(state.visibleNodeCount).toBe(2);
    expect(state.visibleEdgeCount).toBe(1);
    expect(state.edgeAlpha[0]).toBeGreaterThan(0);
    expect(state.edgeAlpha[1]).toBe(0);
  });

  it("reveals dependency and semantic layers independently", () => {
    const graph = dataset();
    const filters = createInitialFilterState(graph);
    filters.enabledLayers.add("dependency");
    let state = computeRenderState(graph, filters);
    expect(state.visibleEdgeCount).toBe(2);
    expect([...state.nodeAlpha]).toEqual([1, 1, 1]);
    filters.enabledLayers.add("semantic");
    state = computeRenderState(graph, filters);
    expect(state.visibleEdgeCount).toBe(3);
  });

  it("pins a searched selection that is outside the active edge layers", () => {
    const graph = dataset();
    const filters = createInitialFilterState(graph);
    filters.selectedNodeIndex = 2;
    const state = computeRenderState(graph, filters);
    expect(state.selectionPinned).toBe(true);
    expect([...state.nodeAlpha]).toEqual([1, 1, 1]);
    expect(state.nodeState[0]).toBeCloseTo(0.42);
    expect(state.nodeState[1]).toBeCloseTo(0.42);
    expect(state.nodeState[2]).toBe(3);
    expect(state.neighbors).toEqual(new Set());
  });

  it("emphasizes a selection and can hide unrelated visible edges", () => {
    const graph = dataset();
    const filters = createInitialFilterState(graph);
    filters.enabledLayers.add("dependency");
    filters.enabledLayers.add("semantic");
    filters.selectedNodeIndex = 0;
    filters.relationMode = "hide";
    const state = computeRenderState(graph, filters);
    expect(state.neighbors).toEqual(new Set([1, 2]));
    expect([...state.nodeState]).toEqual([3, 2, 2]);
    expect(state.edgeAlpha[0]).toBeGreaterThan(0);
    expect(state.edgeAlpha[1]).toBeGreaterThan(0);
    expect(state.edgeAlpha[2]).toBe(0);
    expect(state.visibleEdgeCount).toBe(2);
  });

  it("removes edges attached to a filtered node and clears a hidden selection", () => {
    const graph = dataset();
    const filters = createInitialFilterState(graph);
    filters.enabledLayers.add("semantic");
    filters.selectedNodeIndex = 1;
    setMembership(filters.enabledNodeKinds, "actor", false);
    const state = computeRenderState(graph, filters);
    expect(filters.selectedNodeIndex).toBeNull();
    expect([...state.nodeAlpha]).toEqual([0, 0, 0]);
    expect(state.visibleEdgeCount).toBe(0);
  });
});

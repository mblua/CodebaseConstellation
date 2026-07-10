import {
  layerForEdgeCategory,
  type EdgeKindInfo,
  type GraphDataset,
  type LayerKey,
  type RelationMode,
} from "./model";

export interface FilterState {
  enabledNodeKinds: Set<string>;
  enabledEdgeKinds: Set<string>;
  enabledLayers: Set<LayerKey>;
  relationMode: RelationMode;
  selectedNodeIndex: number | null;
  isolation: FindingIsolation | null;
  diagnosticNodeClasses: Float32Array;
}

export interface FindingIsolation {
  findingId: bigint;
  nodeIndices: Set<number>;
  edgeIndices: Set<number>;
}

export interface ComputedRenderState {
  nodeAlpha: Float32Array;
  nodeState: Float32Array;
  nodeDiagnostic: Float32Array;
  edgeAlpha: Float32Array;
  neighbors: Set<number>;
  visibleNodeCount: number;
  visibleEdgeCount: number;
  selectionPinned: boolean;
}

export function createInitialFilterState(
  dataset: Pick<GraphDataset, "nodeKinds" | "edgeKinds" | "positions">,
): FilterState {
  return {
    enabledNodeKinds: new Set(dataset.nodeKinds.filter((kind) => kind.count > 0).map((kind) => kind.key)),
    enabledEdgeKinds: new Set(dataset.edgeKinds.filter((kind) => kind.count > 0).map((kind) => kind.key)),
    enabledLayers: new Set<LayerKey>(["structural"]),
    relationMode: "dim",
    selectedNodeIndex: null,
    isolation: null,
    diagnosticNodeClasses: new Float32Array(dataset.positions.nodeIds.length),
  };
}

export function cloneFilterState(state: FilterState): FilterState {
  return {
    enabledNodeKinds: new Set(state.enabledNodeKinds),
    enabledEdgeKinds: new Set(state.enabledEdgeKinds),
    enabledLayers: new Set(state.enabledLayers),
    relationMode: state.relationMode,
    selectedNodeIndex: state.selectedNodeIndex,
    isolation: state.isolation
      ? {
          findingId: state.isolation.findingId,
          nodeIndices: new Set(state.isolation.nodeIndices),
          edgeIndices: new Set(state.isolation.edgeIndices),
        }
      : null,
    diagnosticNodeClasses: state.diagnosticNodeClasses.slice(),
  };
}

export function setMembership<T>(set: Set<T>, value: T, enabled: boolean): void {
  if (enabled) set.add(value);
  else set.delete(value);
}

function edgeBaseAlpha(layer: LayerKey): number {
  switch (layer) {
    case "structural":
      return 0.22;
    case "dependency":
      return 0.4;
    case "dataFlow":
      return 0.48;
    case "semantic":
      return 0.42;
    case "change":
      return 0.5;
  }
}

export function computeRenderState(dataset: GraphDataset, state: FilterState): ComputedRenderState {
  const nodeCount = dataset.positions.nodeIds.length;
  const edgeCount = dataset.edges.edgeIds.length;
  const nodeAlpha = new Float32Array(nodeCount);
  const nodeState = new Float32Array(nodeCount);
  const nodeDiagnostic = state.diagnosticNodeClasses.length === nodeCount
    ? state.diagnosticNodeClasses.slice()
    : new Float32Array(nodeCount);
  const edgeAlpha = new Float32Array(edgeCount);
  const nodeKindEnabled = new Uint8Array(nodeCount);
  const edgeEnabled = new Uint8Array(edgeCount);
  const nodeKindByCode = new Map(dataset.nodeKinds.map((kind) => [kind.renderCode, kind.key]));
  const edgeKindByCode = new Map<number, EdgeKindInfo>(
    dataset.edgeKinds.map((kind) => [kind.renderCode, kind]),
  );

  for (let index = 0; index < nodeCount; index += 1) {
    const key = nodeKindByCode.get(dataset.positions.kindCodes[index] ?? 0);
    nodeKindEnabled[index] = key !== undefined && state.enabledNodeKinds.has(key) ? 1 : 0;
  }

  const selected = state.selectedNodeIndex;
  const neighbors = new Set<number>();
  if (
    selected !== null
    && (state.isolation
      ? !state.isolation.nodeIndices.has(selected)
      : nodeKindEnabled[selected] === 0)
  ) {
    state.selectedNodeIndex = null;
  }
  const effectiveSelected = state.selectedNodeIndex;

  if (state.isolation) {
    for (const index of state.isolation.nodeIndices) {
      if (index >= 0 && index < nodeCount) nodeAlpha[index] = 1;
    }
    for (const edgeIndex of state.isolation.edgeIndices) {
      if (edgeIndex < 0 || edgeIndex >= edgeCount) continue;
      edgeEnabled[edgeIndex] = 1;
      const source = dataset.edges.sourceIndices[edgeIndex] ?? 0;
      const target = dataset.edges.targetIndices[edgeIndex] ?? 0;
      if (effectiveSelected !== null) {
        if (source === effectiveSelected && state.isolation.nodeIndices.has(target)) neighbors.add(target);
        if (target === effectiveSelected && state.isolation.nodeIndices.has(source)) neighbors.add(source);
      }
    }
  } else {
    for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
      const source = dataset.edges.sourceIndices[edgeIndex] ?? 0;
      const target = dataset.edges.targetIndices[edgeIndex] ?? 0;
      if (nodeKindEnabled[source] === 0 || nodeKindEnabled[target] === 0) continue;

      const kind = edgeKindByCode.get(dataset.edges.kindCodes[edgeIndex] ?? 0);
      if (!kind || !state.enabledEdgeKinds.has(kind.key)) continue;
      const layer = layerForEdgeCategory(kind.category);
      if (!layer || !state.enabledLayers.has(layer)) continue;
      edgeEnabled[edgeIndex] = 1;
      nodeAlpha[source] = 1;
      nodeAlpha[target] = 1;
      if (effectiveSelected !== null) {
        if (source === effectiveSelected) neighbors.add(target);
        if (target === effectiveSelected) neighbors.add(source);
      }
    }
  }

  const selectionPinned = state.isolation === null
    && effectiveSelected !== null
    && nodeAlpha[effectiveSelected] === 0;
  if (effectiveSelected !== null) nodeAlpha[effectiveSelected] = 1;

  let visibleNodeCount = 0;
  for (let index = 0; index < nodeCount; index += 1) {
    if (nodeAlpha[index] === 0) continue;
    visibleNodeCount += 1;
    if (index === effectiveSelected) nodeState[index] = 3;
    else if (neighbors.has(index)) nodeState[index] = 2;
    else nodeState[index] = effectiveSelected === null ? 1 : 0.42;
  }

  let visibleEdgeCount = 0;
  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
    if (edgeEnabled[edgeIndex] === 0) continue;
    const source = dataset.edges.sourceIndices[edgeIndex] ?? 0;
    const target = dataset.edges.targetIndices[edgeIndex] ?? 0;
    const kind = edgeKindByCode.get(dataset.edges.kindCodes[edgeIndex] ?? 0);
    if (!kind) continue;
    const layer = layerForEdgeCategory(kind.category);
    if (!layer) continue;

    let alpha = state.isolation ? 0.78 : edgeBaseAlpha(layer);
    if (state.isolation && effectiveSelected !== null) {
      const related = source === effectiveSelected || target === effectiveSelected;
      if (related) alpha = 1;
    } else if (effectiveSelected !== null) {
      const related = source === effectiveSelected || target === effectiveSelected;
      if (related) alpha = Math.min(1, alpha * 2.2);
      else if (state.relationMode === "hide") alpha = 0;
      else if (state.relationMode === "dim") alpha *= 0.12;
    }
    edgeAlpha[edgeIndex] = alpha;
    if (alpha > 0) visibleEdgeCount += 1;
  }

  return {
    nodeAlpha,
    nodeState,
    nodeDiagnostic,
    edgeAlpha,
    neighbors,
    visibleNodeCount,
    visibleEdgeCount,
    selectionPinned,
  };
}

export type CapabilityStatus = "available" | "degraded" | "unavailable";

export type LayerKey =
  | "structural"
  | "dependency"
  | "dataFlow"
  | "semantic"
  | "change";

export type RelationMode = "all" | "dim" | "hide";

export interface NodeKindInfo {
  key: string;
  category: string;
  renderCode: number;
  description: string;
  count: number;
}

export interface EdgeKindInfo {
  key: string;
  category: string;
  renderCode: number;
  directed: boolean;
  description: string;
  count: number;
}

export interface CapabilityInfo {
  capability: string;
  status: CapabilityStatus;
  coverage: number | null;
  detail: string;
}

export interface SnapshotInfo {
  id: bigint;
  repositoryId: bigint;
  repositoryName: string;
  revision: string;
  historyMode: "full" | "shallow" | "absent";
  visibleCommitCount: number;
  completedAt: string;
}

export interface LayoutInfo {
  id: bigint;
  snapshotId: bigint;
  name: string;
  algorithm: string;
  dimensions: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  nodeCount: number;
  edgeCount: number;
}

export interface DecodedPositions {
  snapshotId: bigint;
  layoutId: bigint;
  nodeIds: BigUint64Array;
  coordinates: Float32Array;
  radii: Float32Array;
  kindCodes: Uint16Array;
  flags: Uint16Array;
  clusterIds: Uint32Array;
}

export interface DecodedEdges {
  snapshotId: bigint;
  layoutId: bigint;
  edgeIds: BigUint64Array;
  sourceIndices: Uint32Array;
  targetIndices: Uint32Array;
  kindCodes: Uint16Array;
  flags: Uint16Array;
  weights: Float32Array;
}

export interface GraphDataset {
  sourceLabel: string;
  snapshot: SnapshotInfo;
  layout: LayoutInfo;
  capabilities: CapabilityInfo[];
  nodeKinds: NodeKindInfo[];
  edgeKinds: EdgeKindInfo[];
  positions: DecodedPositions;
  edges: DecodedEdges;
  nodeIndexById: Map<string, number>;
}

export interface SearchResult {
  id: bigint;
  name: string;
  kind: string;
  path: string | null;
  qualifiedName: string | null;
  confidence: number;
}

export interface MetricInfo {
  key: string;
  value: number;
  unit: string;
  provenance: string;
}

export interface EvidenceInfo {
  id: bigint;
  kind: string;
  fileNodeId: bigint | null;
  startLine: number | null;
  endLine: number | null;
  commitHash: string | null;
  issueKey: string | null;
  excerpt: string | null;
}

export interface NeighborInfo {
  edgeId: bigint;
  edgeKind: string;
  edgeCategory: string;
  edgeConfidence: number;
  edgeWeight: number;
  derived: boolean;
  direction: "incoming" | "outgoing" | "undirected";
  nodeId: bigint;
  nodeName: string;
  nodeKind: string;
  nodePath: string | null;
  evidence: EvidenceInfo[];
}

export interface FindingInfo {
  id: bigint;
  title: string;
  detail: string;
  recommendation: string;
  category: string;
  severity: "info" | "warning" | "error";
  status: string;
  role: string | null;
}

export interface NodeDetail {
  id: bigint;
  stableKey: string;
  kind: string;
  name: string;
  qualifiedName: string | null;
  path: string | null;
  language: string | null;
  external: boolean;
  startLine: number | null;
  endLine: number | null;
  confidence: number;
  attributes: Record<string, unknown>;
  metrics: MetricInfo[];
  neighbors: NeighborInfo[];
  findings: FindingInfo[];
}

export interface LabelCandidate {
  nodeId: bigint;
  nodeIndex: number;
  name: string;
  kind: string;
  pageRank: number;
}

export const LAYER_DEFINITIONS: ReadonlyArray<{
  key: LayerKey;
  label: string;
  hint: string;
  categories: readonly string[];
}> = [
  {
    key: "structural",
    label: "Structure",
    hint: "contains · groups · declares",
    categories: ["structural"],
  },
  {
    key: "dependency",
    label: "Dependencies",
    hint: "imports · depends · calls · invokes",
    categories: ["dependency", "execution"],
  },
  {
    key: "dataFlow",
    label: "Data flow",
    hint: "reads · writes · emits · consumes",
    categories: ["data_flow"],
  },
  {
    key: "semantic",
    label: "Semantics",
    hint: "actors · actions · concepts",
    categories: ["semantic"],
  },
  {
    key: "change",
    label: "Change",
    hint: "commits · issues · touches",
    categories: ["change"],
  },
] as const;

export function layerForEdgeCategory(category: string): LayerKey | null {
  return (
    LAYER_DEFINITIONS.find((layer) => layer.categories.includes(category))?.key ??
    null
  );
}

export const NODE_STYLE: Readonly<
  Record<string, { color: string; shape: number; glyph: string; label: string }>
> = {
  repository: { color: "#ffd166", shape: 5, glyph: "hex", label: "Repository" },
  directory: { color: "#73d2de", shape: 2, glyph: "folder", label: "Folder" },
  file: { color: "#7aa8ff", shape: 7, glyph: "file", label: "File" },
  package: { color: "#ff8f70", shape: 5, glyph: "hex", label: "Package" },
  module: { color: "#a98cff", shape: 6, glyph: "ring", label: "Module" },
  symbol: { color: "#b8a1ff", shape: 1, glyph: "circle", label: "Symbol" },
  actor: { color: "#ff77aa", shape: 3, glyph: "triangle", label: "Actor" },
  concept: { color: "#72e6b1", shape: 6, glyph: "ring", label: "Concept" },
  action: { color: "#ffb45e", shape: 4, glyph: "diamond", label: "Action" },
  data_store: { color: "#42d3c7", shape: 8, glyph: "database", label: "Data store" },
  external_system: { color: "#ff6b6b", shape: 4, glyph: "diamond", label: "External" },
  commit: { color: "#f4d35e", shape: 1, glyph: "circle", label: "Commit" },
  issue: { color: "#e879f9", shape: 6, glyph: "ring", label: "Issue" },
};

export const EDGE_LAYER_COLOR: Readonly<Record<LayerKey, string>> = {
  structural: "#5f7897",
  dependency: "#7aa8ff",
  dataFlow: "#42d3c7",
  semantic: "#d98cff",
  change: "#f4c95d",
};

export function formatKind(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

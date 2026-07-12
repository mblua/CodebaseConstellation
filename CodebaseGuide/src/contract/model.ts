// The derived index (§3.3). Not a second copy of the truth — a lookup structure,
// canonicalised so that a shuffled input document produces an identical view.

import type {
  Coverage,
  EdgeId,
  GuideDoc,
  GuideEdge,
  GuideGenerator,
  GuideNode,
  GuideSource,
  NodeId,
  Unresolved,
} from './types.ts';

/** §6.6: a fixed table, so unknown future kinds sort last, stably, with no code change.
 *
 *  A Rust `crate` is its own kind, not a `package` with a different ecosystem tag. It
 *  is a first-class unit of code in this repository — two of the four anchors are
 *  crates — and calling it a package made the map say something the reader has to
 *  translate. Ids are unchanged (`pkg:cargo:…`), so a saved layout survives the
 *  distinction. */
const KIND_RANK: Record<string, number> = {
  repository: 0,
  application: 1,
  package: 2,
  crate: 3,
  directory: 4,
  file: 5,
};
const UNKNOWN_KIND_RANK = 6;

export function kindRank(kind: string): number {
  return KIND_RANK[kind] ?? UNKNOWN_KIND_RANK;
}

export interface GraphModel {
  /** Canonical order: (kindRank, label, id). */
  readonly nodes: readonly GuideNode[];
  /** Canonical order: by edge id. */
  readonly edges: readonly GuideEdge[];
  readonly nodeById: ReadonlyMap<NodeId, GuideNode>;
  readonly edgeById: ReadonlyMap<EdgeId, GuideEdge>;
  /** Canonical child order — used for the walk, for layout, and for display. */
  readonly childrenOf: ReadonlyMap<NodeId, readonly NodeId[]>;
  readonly roots: readonly NodeId[];
  readonly depthOf: ReadonlyMap<NodeId, number>;
  readonly coverage: readonly Coverage[];
  readonly unresolved: readonly Unresolved[];
  readonly source: GuideSource | undefined;
  readonly generator: GuideGenerator | undefined;
  readonly stats: Readonly<Record<string, unknown>> | undefined;
}

function compareNodes(a: GuideNode, b: GuideNode): number {
  const ra = kindRank(a.kind);
  const rb = kindRank(b.kind);
  if (ra !== rb) return ra - rb;
  if (a.label !== b.label) return a.label < b.label ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

export function buildModel(doc: GuideDoc): GraphModel {
  const nodes = [...doc.nodes].sort(compareNodes);
  const edges = [...doc.edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const nodeById = new Map<NodeId, GuideNode>();
  for (const n of nodes) nodeById.set(n.id, n);
  const edgeById = new Map<EdgeId, GuideEdge>();
  for (const e of edges) edgeById.set(e.id, e);

  // `nodes` is already in canonical order, so pushing in that order yields
  // canonical child order for free.
  const childrenOf = new Map<NodeId, NodeId[]>();
  const roots: NodeId[] = [];
  for (const n of nodes) {
    if (n.parentId === null) {
      roots.push(n.id);
      continue;
    }
    const siblings = childrenOf.get(n.parentId);
    if (siblings === undefined) childrenOf.set(n.parentId, [n.id]);
    else siblings.push(n.id);
  }

  // Integrity has already proven the parent relation is an acyclic forest, so a
  // BFS from the roots reaches every node and terminates.
  const depthOf = new Map<NodeId, number>();
  const queue: NodeId[] = [...roots];
  for (const r of roots) depthOf.set(r, 0);
  while (queue.length > 0) {
    const id = queue.shift() as NodeId;
    const depth = depthOf.get(id) ?? 0;
    for (const child of childrenOf.get(id) ?? []) {
      depthOf.set(child, depth + 1);
      queue.push(child);
    }
  }

  return {
    nodes,
    edges,
    nodeById,
    edgeById,
    childrenOf,
    roots,
    depthOf,
    coverage: doc.coverage ?? [],
    unresolved: doc.unresolved ?? [],
    source: doc.source,
    generator: doc.generator,
    stats: doc.stats,
  };
}

export function isContainer(model: GraphModel, id: NodeId): boolean {
  const children = model.childrenOf.get(id);
  return children !== undefined && children.length > 0;
}

/** Root-first chain of ancestors, ending at `id`. Used for the breadcrumb and ExpandTo. */
export function ancestryOf(model: GraphModel, id: NodeId): NodeId[] {
  const chain: NodeId[] = [];
  let current = model.nodeById.get(id);
  while (current !== undefined) {
    chain.push(current.id);
    current = current.parentId === null ? undefined : model.nodeById.get(current.parentId);
  }
  chain.reverse();
  return chain;
}

/** Every descendant of `id`, excluding `id`, in canonical pre-order. */
export function descendantsOf(model: GraphModel, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  const stack: NodeId[] = [...(model.childrenOf.get(id) ?? [])].reverse();
  while (stack.length > 0) {
    const current = stack.pop() as NodeId;
    out.push(current);
    const children = model.childrenOf.get(current) ?? [];
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i] as NodeId);
  }
  return out;
}

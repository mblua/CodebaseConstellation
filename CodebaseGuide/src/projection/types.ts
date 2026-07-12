// Visible identities are NOT logical identities (§6.4).
//
// An aggregated edge does not exist in `doc.edges`. Typing its id as `EdgeId` was
// a category error, so the two are branded apart and the compiler enforces it.

import type { EdgeId, EdgeKind } from '../contract/types.ts';
import type { OutlineNodeId } from '../domain/outline.ts';

export type VisibleEdgeId = string & { readonly __brand: 'VisibleEdgeId' };
export type InternalBucketId = string & { readonly __brand: 'InternalBucketId' };

export interface VisibleEdge {
  id: VisibleEdgeId; // opaque, projection-assigned
  kind: EdgeKind; // the structured tuple is CARRIED,
  sourceId: OutlineNodeId; // never re-parsed out of the id
  targetId: OutlineNodeId;
  count: number;
  sourceEdgeIds: readonly EdgeId[]; // the logical relations behind this one line
}

export interface InternalBucket {
  id: InternalBucketId;
  kind: EdgeKind;
  containerId: OutlineNodeId; // both endpoints collapsed into this node
  count: number;
  sourceEdgeIds: readonly EdgeId[]; // internal relations keep their ids
}

export interface VisibleGraph {
  readonly visibleNodes: readonly OutlineNodeId[];
  readonly visibleEdges: readonly VisibleEdge[];
  readonly internalBuckets: readonly InternalBucket[];
  readonly nva: ReadonlyMap<OutlineNodeId, OutlineNodeId>;
  readonly visibleEdgeById: ReadonlyMap<VisibleEdgeId, VisibleEdge>;
  readonly internalBucketById: ReadonlyMap<InternalBucketId, InternalBucket>;
  /** Internal buckets grouped by the container they collapsed into — what the
   *  detail panel shows when you select a node (§9.3). */
  readonly internalBucketsByNode: ReadonlyMap<OutlineNodeId, readonly InternalBucket[]>;
  /** Logical edges whose endpoints are not represented in this outline at all.
   *  Empty for the ownership outline; non-empty only for a partial outline. */
  readonly outOfScopeEdgeIds: readonly EdgeId[];
}

export function isVisibleEdgeId(graph: VisibleGraph, id: string): id is VisibleEdgeId {
  return graph.visibleEdgeById.has(id as VisibleEdgeId);
}

export function isInternalBucketId(graph: VisibleGraph, id: string): id is InternalBucketId {
  return graph.internalBucketById.has(id as InternalBucketId);
}

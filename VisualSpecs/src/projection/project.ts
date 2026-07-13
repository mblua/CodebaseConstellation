// project(model, outline, expanded) → VisibleGraph. Pure. Never mutates (I8).
//
// The two things this file is careful about, because both were real defects:
//
//  1. NO STRING KEYS ANYWHERE (§6.3). Edge ids and kinds are opaque strings from
//     an untrusted document. `kind + '|' + src + '|' + tgt` is ambiguous —
//     (kind="k|a", src="b") and (kind="k", src="a|b") collide on "k|a|b" — and an
//     imported document can trigger that on purpose. Buckets are nested Maps.
//     Nothing is ever encoded, and nothing is ever parsed back out.
//
//  2. INTERNAL RELATIONS KEEP THEIR IDS (§6.5). A counter preserves the QUANTITY
//     of information and destroys the INFORMATION. `sourceEdgeIds` on both sides
//     is what makes the partition law (I9) checkable at all.

import type { EdgeId, EdgeKind, NodeId } from '../contract/types.ts';
import type { GraphModel } from '../contract/model.ts';
import type { Outline, OutlineNodeId } from '../domain/outline.ts';
import { computeVisibility } from '../domain/visibility.ts';
import type {
  InternalBucket,
  InternalBucketId,
  VisibleEdge,
  VisibleEdgeId,
  VisibleGraph,
} from './types.ts';

export function project(
  model: GraphModel,
  outline: Outline,
  expanded: ReadonlySet<OutlineNodeId>,
): VisibleGraph {
  const { visible, nva } = computeVisibility(outline, expanded);

  const representativeOf = (entityId: NodeId): OutlineNodeId | null => {
    const placement = outline.placementOf(entityId);
    if (placement === null) return null; // entity not in this outline: out of scope
    return nva.get(placement) ?? null;
  };

  // kind → src → tgt → edge ids
  const visibleBuckets = new Map<EdgeKind, Map<OutlineNodeId, Map<OutlineNodeId, EdgeId[]>>>();
  // kind → container → edge ids
  const internalBuckets = new Map<EdgeKind, Map<OutlineNodeId, EdgeId[]>>();
  const outOfScopeEdgeIds: EdgeId[] = [];

  // `model.edges` is in canonical (edge-id) order, so every `sourceEdgeIds` array
  // comes out in canonical order for free.
  for (const edge of model.edges) {
    const s = representativeOf(edge.sourceId);
    const t = representativeOf(edge.targetId);
    if (s === null || t === null) {
      outOfScopeEdgeIds.push(edge.id);
      continue;
    }

    if (s === t) {
      // Both endpoints collapsed into ONE visible node.
      let byContainer = internalBuckets.get(edge.kind);
      if (byContainer === undefined) {
        byContainer = new Map<OutlineNodeId, EdgeId[]>();
        internalBuckets.set(edge.kind, byContainer);
      }
      const ids = byContainer.get(s);
      if (ids === undefined) byContainer.set(s, [edge.id]);
      else ids.push(edge.id);
      continue;
    }

    // A drawn relation. Kind is part of the bucket identity: `bundles` and
    // `entrypoint` between the same pair stay two edges. They are different
    // facts and must not merge into a meaningless "×2".
    let bySource = visibleBuckets.get(edge.kind);
    if (bySource === undefined) {
      bySource = new Map<OutlineNodeId, Map<OutlineNodeId, EdgeId[]>>();
      visibleBuckets.set(edge.kind, bySource);
    }
    let byTarget = bySource.get(s);
    if (byTarget === undefined) {
      byTarget = new Map<OutlineNodeId, EdgeId[]>();
      bySource.set(s, byTarget);
    }
    const ids = byTarget.get(t);
    if (ids === undefined) byTarget.set(t, [edge.id]);
    else ids.push(edge.id);
  }

  // Ids are assigned AFTER bucketing: sort the STRUCTURED TUPLES with a
  // field-by-field comparator (never a concatenated string), then index.
  // Deterministic, collision-free, delimiter-free.
  const visibleTuples: { kind: EdgeKind; s: OutlineNodeId; t: OutlineNodeId; ids: EdgeId[] }[] = [];
  for (const [kind, bySource] of visibleBuckets) {
    for (const [s, byTarget] of bySource) {
      for (const [t, ids] of byTarget) visibleTuples.push({ kind, s, t, ids });
    }
  }
  visibleTuples.sort((a, b) => cmp(a.kind, b.kind) || cmp(a.s, b.s) || cmp(a.t, b.t));

  const internalTuples: { kind: EdgeKind; container: OutlineNodeId; ids: EdgeId[] }[] = [];
  for (const [kind, byContainer] of internalBuckets) {
    for (const [container, ids] of byContainer) internalTuples.push({ kind, container, ids });
  }
  internalTuples.sort((a, b) => cmp(a.kind, b.kind) || cmp(a.container, b.container));

  const visibleEdges: VisibleEdge[] = visibleTuples.map((tuple, i) => ({
    id: `v${i}` as VisibleEdgeId,
    kind: tuple.kind,
    sourceId: tuple.s,
    targetId: tuple.t,
    count: tuple.ids.length,
    sourceEdgeIds: tuple.ids,
  }));

  const internal: InternalBucket[] = internalTuples.map((tuple, i) => ({
    id: `i${i}` as InternalBucketId,
    kind: tuple.kind,
    containerId: tuple.container,
    count: tuple.ids.length,
    sourceEdgeIds: tuple.ids,
  }));

  const visibleEdgeById = new Map<VisibleEdgeId, VisibleEdge>();
  for (const e of visibleEdges) visibleEdgeById.set(e.id, e);
  const internalBucketById = new Map<InternalBucketId, InternalBucket>();
  for (const b of internal) internalBucketById.set(b.id, b);

  const internalBucketsByNode = new Map<OutlineNodeId, InternalBucket[]>();
  for (const b of internal) {
    const list = internalBucketsByNode.get(b.containerId);
    if (list === undefined) internalBucketsByNode.set(b.containerId, [b]);
    else list.push(b);
  }

  return {
    visibleNodes: visible,
    visibleEdges,
    internalBuckets: internal,
    nva,
    visibleEdgeById,
    internalBucketById,
    internalBucketsByNode,
    outOfScopeEdgeIds,
  };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------------------
// I9 — the partition law, executable.
// ---------------------------------------------------------------------------

export interface PartitionViolation {
  kind: 'duplicate' | 'omitted' | 'wrong-bucket';
  edgeId: EdgeId;
  detail: string;
}

/**
 * > Let B be the multiset union of `sourceEdgeIds` over all visibleEdges and all
 * > internalBuckets. Then B is EXACTLY the set of logical edge ids represented in
 * > this outline — same cardinality, no duplicates, no omissions. Furthermore,
 * > for every logical edge e, the bucket containing e.id MATCHES
 * > (representativeOf(e.sourceId), representativeOf(e.targetId), e.kind).
 *
 * The second sentence is what makes it a real law. A sum of counters can be right
 * while omitting one id and double-counting another; this cannot.
 */
export function checkPartition(
  model: GraphModel,
  outline: Outline,
  graph: VisibleGraph,
): PartitionViolation[] {
  const violations: PartitionViolation[] = [];

  const representativeOf = (entityId: NodeId): OutlineNodeId | null => {
    const placement = outline.placementOf(entityId);
    if (placement === null) return null;
    return graph.nva.get(placement) ?? null;
  };

  // Where did each id land?
  const seen = new Map<EdgeId, { kind: EdgeKind; s: OutlineNodeId; t: OutlineNodeId }>();

  const record = (
    id: EdgeId,
    slot: { kind: EdgeKind; s: OutlineNodeId; t: OutlineNodeId },
    where: string,
  ): void => {
    const previous = seen.get(id);
    if (previous !== undefined) {
      violations.push({
        kind: 'duplicate',
        edgeId: id,
        detail: `appears in more than one bucket (again in ${where})`,
      });
      return;
    }
    seen.set(id, slot);
  };

  for (const e of graph.visibleEdges) {
    if (e.count !== e.sourceEdgeIds.length) {
      violations.push({
        kind: 'wrong-bucket',
        edgeId: e.id,
        detail: `visible edge ${e.id} reports count ${e.count} but carries ${e.sourceEdgeIds.length} ids`,
      });
    }
    for (const id of e.sourceEdgeIds) {
      record(id, { kind: e.kind, s: e.sourceId, t: e.targetId }, `visible edge ${e.id}`);
    }
  }
  for (const b of graph.internalBuckets) {
    if (b.count !== b.sourceEdgeIds.length) {
      violations.push({
        kind: 'wrong-bucket',
        edgeId: b.id,
        detail: `internal bucket ${b.id} reports count ${b.count} but carries ${b.sourceEdgeIds.length} ids`,
      });
    }
    for (const id of b.sourceEdgeIds) {
      record(id, { kind: b.kind, s: b.containerId, t: b.containerId }, `internal bucket ${b.id}`);
    }
  }

  const outOfScope = new Set<EdgeId>(graph.outOfScopeEdgeIds);

  for (const edge of model.edges) {
    const s = representativeOf(edge.sourceId);
    const t = representativeOf(edge.targetId);

    if (s === null || t === null) {
      if (!outOfScope.has(edge.id)) {
        violations.push({
          kind: 'omitted',
          edgeId: edge.id,
          detail: 'has an endpoint outside the outline but was not reported as out of scope',
        });
      }
      if (seen.has(edge.id)) {
        violations.push({
          kind: 'wrong-bucket',
          edgeId: edge.id,
          detail: 'is out of scope for this outline but was still bucketed',
        });
      }
      continue;
    }

    const slot = seen.get(edge.id);
    if (slot === undefined) {
      violations.push({ kind: 'omitted', edgeId: edge.id, detail: 'is in no bucket at all' });
      continue;
    }
    // The placement check: in A bucket is not enough — it must be in the RIGHT one.
    if (slot.kind !== edge.kind || slot.s !== s || slot.t !== t) {
      violations.push({
        kind: 'wrong-bucket',
        edgeId: edge.id,
        detail:
          `landed in (${slot.kind}, ${slot.s} → ${slot.t}) ` +
          `but its representatives are (${edge.kind}, ${s} → ${t})`,
      });
    }
  }

  // Anything bucketed that is not a logical edge id at all.
  for (const id of seen.keys()) {
    if (!model.edgeById.has(id)) {
      violations.push({ kind: 'wrong-bucket', edgeId: id, detail: 'is not a logical edge id' });
    }
  }

  return violations;
}

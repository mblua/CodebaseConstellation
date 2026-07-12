// The frontier between the OWNERSHIP TREE (factual, single-parent, `parentId`)
// and a PRESENTATION OUTLINE (a tree of lightweight references to the same
// entities). Projection consumes an Outline, never `parentId` directly (§5.4).
//
// ─── Dissent 1, resolved ──────────────────────────────────────────────────────
// Membership is genuinely N:M (one Tauri app spans an npm package AND a Rust crate; one
// crate ships two binaries), and an injective `placementOf` cannot put the same unit
// under two applications. v1 takes the honest option of the two on the table:
//
//   PRIMARY PLACEMENT. An outline places each entity exactly once, under a
//   deterministically chosen primary parent. The OTHER memberships are not
//   discarded and are not faked as containment — they remain `bundles` EDGES,
//   which project through NVA like every other relation and are therefore still
//   visible, still aggregated, and still carry their evidence.
//
// So the promise this ships is: *no membership is lost*. It is NOT: *an entity
// appears under every app that bundles it* — that needs multi-placement, which
// v1 does not implement (see `MULTI_PLACEMENT_NOTE` below and §15).
//
// I10 (injectivity) is therefore not an aspiration; it is an executable check —
// `assertInjective` — and both shipped and fixture outlines are run through it.

import type { NodeId } from '../contract/types.ts';
import type { GraphModel } from '../contract/model.ts';

export type OutlineNodeId = string;

export interface Outline {
  readonly id: string;
  roots(): readonly OutlineNodeId[];
  /** Deterministic order. */
  childrenOf(n: OutlineNodeId): readonly OutlineNodeId[];
  entityOf(n: OutlineNodeId): NodeId;
  /** Injective in v1 (I10): an entity has at most one placement. */
  placementOf(e: NodeId): OutlineNodeId | null;
}

/**
 * What would have to change to relax I10, written down so that arriving there is
 * a decision rather than an accident (§5.4):
 *
 *  1. `placementOf(e): OutlineNodeId | null` becomes `placementsOf(e): readonly OutlineNodeId[]`.
 *  2. The partition law (I9) generalises from `logicalEdgeId` to
 *     `(logicalEdgeId × placementPair)`, and the contract must declare an explicit
 *     fan-out policy — `all-pairs` or `primary-placement`.
 *  3. `ViewState.positions` becomes keyed by `OutlineNodeId`, not `NodeId`; today
 *     they coincide, which is what makes a position survive a hierarchy switch (§5.2).
 *  4. `GuideDoc.outlines` (reserved) carries the declared outlines.
 *
 * None of that is implemented. v1 validates injectivity instead.
 */
export const MULTI_PLACEMENT_NOTE =
  'v1 outlines are injective (I10). Multi-placement is not implemented; secondary memberships remain edges.';

/** I10, executable. Called on every outline the app or the tests construct. */
export function assertInjective(outline: Outline, model: GraphModel): void {
  const seen = new Map<NodeId, OutlineNodeId>();
  const visited = new Set<OutlineNodeId>();
  const stack: OutlineNodeId[] = [...outline.roots()];

  while (stack.length > 0) {
    const n = stack.pop() as OutlineNodeId;
    if (visited.has(n)) {
      throw new Error(`outline "${outline.id}" is not a tree: ${n} is reachable twice`);
    }
    visited.add(n);

    const entity = outline.entityOf(n);
    const previous = seen.get(entity);
    if (previous !== undefined) {
      throw new Error(
        `outline "${outline.id}" violates I10: entity ${entity} is placed at both ${previous} and ${n}. ` +
          `Nearest-visible-ancestor is undefined when an entity sits in two places at once.`,
      );
    }
    seen.set(entity, n);

    if (outline.placementOf(entity) !== n) {
      throw new Error(
        `outline "${outline.id}" is inconsistent: placementOf(${entity}) does not return its placement ${n}`,
      );
    }

    for (const child of outline.childrenOf(n)) stack.push(child);
  }

  // Every entity the model knows must either be placed, or knowingly out of scope.
  for (const node of model.nodes) {
    const placement = outline.placementOf(node.id);
    if (placement !== null && !visited.has(placement)) {
      throw new Error(
        `outline "${outline.id}" is inconsistent: placementOf(${node.id}) = ${placement}, which is not reachable from the roots`,
      );
    }
  }
}

/**
 * v1 ships exactly one implementation. OutlineNodeId === NodeId here, which is
 * why nothing else in the product changes: the outline IS the ownership tree.
 */
export class OwnershipOutline implements Outline {
  readonly id = 'ownership';
  private readonly model: GraphModel;

  constructor(model: GraphModel) {
    this.model = model;
  }

  roots(): readonly OutlineNodeId[] {
    return this.model.roots;
  }

  childrenOf(n: OutlineNodeId): readonly OutlineNodeId[] {
    return this.model.childrenOf.get(n) ?? [];
  }

  entityOf(n: OutlineNodeId): NodeId {
    return n;
  }

  placementOf(e: NodeId): OutlineNodeId | null {
    return this.model.nodeById.has(e) ? e : null;
  }
}

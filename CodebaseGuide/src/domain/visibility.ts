// The visibility walk of §6.1, in ONE place.
//
// Projection needs it to compute NVA; geometry needs it to know which boxes to
// draw. Two implementations of "what is visible" would be two chances to
// disagree, so there is one, and it lives in the domain — which `projection/` is
// allowed to import, and does.

import type { Outline, OutlineNodeId } from './outline.ts';

export interface Visibility {
  /** Visible outline nodes, in canonical pre-order. */
  readonly visible: readonly OutlineNodeId[];
  /** NVA for EVERY outline node, visible or not. Hidden nodes map to their
   *  deepest visible ancestor; a visible node maps to itself. */
  readonly nva: ReadonlyMap<OutlineNodeId, OutlineNodeId>;
  /** A visible container whose children are also visible. */
  readonly childrenShown: ReadonlySet<OutlineNodeId>;
}

/**
 * > An outline node is visible iff every strict ancestor of it is in `expanded`.
 * > Roots have no ancestors and are always visible.
 * > NVA(n) is `n` if `n` is visible, else the deepest visible ancestor of `n`.
 *
 * One pre-order walk, O(V). Iterative: an outline can be as deep as the
 * repository is, and a hostile document can make it deeper.
 */
export function computeVisibility(
  outline: Outline,
  expanded: ReadonlySet<OutlineNodeId>,
): Visibility {
  const visible: OutlineNodeId[] = [];
  const nva = new Map<OutlineNodeId, OutlineNodeId>();
  const childrenShown = new Set<OutlineNodeId>();

  interface Frame {
    n: OutlineNodeId;
    isVisible: boolean;
    representative: OutlineNodeId;
  }

  const roots = outline.roots();
  const stack: Frame[] = [];
  for (let i = roots.length - 1; i >= 0; i -= 1) {
    const root = roots[i] as OutlineNodeId;
    stack.push({ n: root, isVisible: true, representative: root });
  }

  while (stack.length > 0) {
    const frame = stack.pop() as Frame;
    const { n, isVisible, representative } = frame;

    let rep: OutlineNodeId;
    let showChildren: boolean;
    if (isVisible) {
      visible.push(n);
      nva.set(n, n);
      rep = n;
      // Children show only if THIS node is expanded.
      showChildren = expanded.has(n);
      if (showChildren) childrenShown.add(n);
    } else {
      nva.set(n, representative);
      rep = representative;
      // A hidden node's children are hidden too — expansion state inside a hidden
      // subtree is remembered, but inert.
      showChildren = false;
    }

    const children = outline.childrenOf(n);
    for (let i = children.length - 1; i >= 0; i -= 1) {
      stack.push({ n: children[i] as OutlineNodeId, isVisible: showChildren, representative: rep });
    }
  }

  // A container with no children is not "expanded" in any observable sense.
  for (const n of childrenShown) {
    if (outline.childrenOf(n).length === 0) childrenShown.delete(n);
  }

  return { visible, nva, childrenShown };
}

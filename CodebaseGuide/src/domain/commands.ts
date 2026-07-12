// Pure view commands: (context, view, command) => view. They never touch the
// model — I8 in its mechanical form. The model is deep-frozen in tests and a long
// random command sequence must leave it untouched.

import type { NodeId, Position, Viewport } from '../contract/types.ts';
import type { GraphModel } from '../contract/model.ts';
import type { ViewState } from '../contract/view.ts';
import { withExpanded, withPositions, withViewport } from '../contract/view.ts';
import type { Outline, OutlineNodeId } from './outline.ts';
import type { Geometry } from './layoutEngine.ts';
import type { Point } from './geometry.ts';

export type ViewCommand =
  | { type: 'Expand'; id: OutlineNodeId }
  | { type: 'Collapse'; id: OutlineNodeId }
  | { type: 'ToggleExpand'; id: OutlineNodeId }
  | { type: 'ExpandAll' }
  | { type: 'CollapseAll' }
  | { type: 'ExpandTo'; id: OutlineNodeId }
  | { type: 'MoveNode'; id: OutlineNodeId; position: Point }
  | { type: 'ResetLayout' }
  | { type: 'SetViewport'; viewport: Viewport };

export interface CommandContext {
  readonly model: GraphModel;
  readonly outline: Outline;
  /** The geometry the user is looking at. `MoveNode` needs it to compute the delta. */
  readonly geometry: Geometry;
}

export function applyViewCommand(
  ctx: CommandContext,
  view: ViewState,
  cmd: ViewCommand,
): ViewState {
  switch (cmd.type) {
    case 'Expand':
      return setExpanded(view, cmd.id, true);
    case 'Collapse':
      return setExpanded(view, cmd.id, false);
    case 'ToggleExpand':
      return setExpanded(view, cmd.id, !view.expanded.has(cmd.id));
    case 'ExpandAll': {
      const next = new Set<OutlineNodeId>(view.expanded);
      for (const n of allOutlineNodes(ctx.outline)) {
        if (ctx.outline.childrenOf(n).length > 0) next.add(n);
      }
      return withExpanded(view, next);
    }
    case 'CollapseAll':
      return withExpanded(view, new Set<OutlineNodeId>());
    case 'ExpandTo': {
      const next = new Set<OutlineNodeId>(view.expanded);
      for (const ancestor of outlineAncestorsOf(ctx.outline, cmd.id)) next.add(ancestor);
      return withExpanded(view, next);
    }
    case 'MoveNode':
      return moveNode(ctx, view, cmd.id, cmd.position);
    case 'ResetLayout': {
      // Clears the layout the user made. INERT positions — those naming ids that
      // are not in this graph — are kept, because they are not this graph's layout
      // and dropping them would make an export lose data that `import` promised
      // to preserve (§3.5).
      const next = new Map<NodeId, Position>();
      for (const [id, p] of view.positions) {
        if (!ctx.model.nodeById.has(id)) next.set(id, p);
      }
      return withPositions(view, next);
    }
    case 'SetViewport':
      return withViewport(view, cmd.viewport);
    default: {
      const exhaustive: never = cmd;
      void exhaustive;
      return view;
    }
  }
}

function setExpanded(view: ViewState, id: OutlineNodeId, on: boolean): ViewState {
  if (view.expanded.has(id) === on) return view;
  const next = new Set<OutlineNodeId>(view.expanded);
  if (on) next.add(id);
  else next.delete(id);
  return withExpanded(view, next);
}

/**
 * Dragging a container is a DOMAIN command, not a renderer behaviour (§7):
 * it translates the container and its entire subtree by the delta, and marks the
 * container pinned. Descendant absolute positions are rewritten, so an export is
 * trivially correct and a re-import reproduces the arrangement exactly.
 */
function moveNode(
  ctx: CommandContext,
  view: ViewState,
  id: OutlineNodeId,
  target: Point,
): ViewState {
  const current = ctx.geometry.position.get(id);
  const dx = current === undefined ? 0 : target.x - current.x;
  const dy = current === undefined ? 0 : target.y - current.y;

  const positions = new Map<NodeId, Position>(view.positions);

  for (const d of outlineDescendantsOf(ctx.outline, id)) {
    const entity = ctx.outline.entityOf(d);
    const stored = view.positions.get(entity);
    if (stored !== undefined) {
      const moved: Position = { x: stored.x + dx, y: stored.y + dy };
      if (stored.pinned === true) moved.pinned = true;
      positions.set(entity, moved);
      continue;
    }
    const drawn = ctx.geometry.position.get(d);
    if (drawn !== undefined) {
      // Unpinned: auto-layout would re-derive exactly this, but persisting it
      // keeps the exported document self-describing.
      positions.set(entity, { x: drawn.x + dx, y: drawn.y + dy });
    }
  }

  positions.set(ctx.outline.entityOf(id), { x: target.x, y: target.y, pinned: true });
  return withPositions(view, positions);
}

export function allOutlineNodes(outline: Outline): OutlineNodeId[] {
  const out: OutlineNodeId[] = [];
  const stack: OutlineNodeId[] = [...outline.roots()].reverse();
  while (stack.length > 0) {
    const n = stack.pop() as OutlineNodeId;
    out.push(n);
    const children = outline.childrenOf(n);
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i] as OutlineNodeId);
  }
  return out;
}

/** Strict ancestors of `n`, root-first. Built by a walk, because the Outline port
 *  deliberately exposes only downward links. */
export function outlineAncestorsOf(outline: Outline, n: OutlineNodeId): OutlineNodeId[] {
  const parentOf = buildOutlineParents(outline);
  const chain: OutlineNodeId[] = [];
  let current = parentOf.get(n) ?? null;
  while (current !== null && current !== undefined) {
    chain.push(current);
    current = parentOf.get(current) ?? null;
  }
  chain.reverse();
  return chain;
}

/** `n` and every descendant, canonical pre-order. */
export function outlineDescendantsOf(outline: Outline, n: OutlineNodeId): OutlineNodeId[] {
  const out: OutlineNodeId[] = [];
  const stack: OutlineNodeId[] = [n];
  while (stack.length > 0) {
    const current = stack.pop() as OutlineNodeId;
    out.push(current);
    const children = outline.childrenOf(current);
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i] as OutlineNodeId);
  }
  return out;
}

export function buildOutlineParents(outline: Outline): Map<OutlineNodeId, OutlineNodeId | null> {
  const parentOf = new Map<OutlineNodeId, OutlineNodeId | null>();
  const stack: OutlineNodeId[] = [];
  for (const r of outline.roots()) {
    parentOf.set(r, null);
    stack.push(r);
  }
  while (stack.length > 0) {
    const n = stack.pop() as OutlineNodeId;
    for (const c of outline.childrenOf(n)) {
      parentOf.set(c, n);
      stack.push(c);
    }
  }
  return parentOf;
}

/**
 * The initial view (§9.3): the repository, its applications, its packages and its
 * crates — not 637 overlapping files. A document that carries its own `view` keeps it,
 * including one whose expansion is deliberately EMPTY (§16.9).
 */
export function initialExpanded(outline: Outline): Set<OutlineNodeId> {
  return new Set<OutlineNodeId>(outline.roots());
}

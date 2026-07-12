// THE ONE mutable authority for expanded / positions / viewport (§3.3).
//
// `AppState` does not carry `doc.view` as well; there is exactly one writable
// holder, so the two cannot silently diverge. Treated immutably: commands
// copy-on-write and return a new ViewState.

import type { NodeId, Position, Viewport } from './types.ts';

export interface ViewState {
  readonly expanded: ReadonlySet<NodeId>;
  /**
   * Includes INERT entries: positions for ids that are not in the model. `import`
   * keeps them (so load → export is lossless); `refresh` drops them and says so
   * in its loss report (§3.5).
   */
  readonly positions: ReadonlyMap<NodeId, Position>;
  readonly viewport: Viewport;
}

export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

export function emptyView(): ViewState {
  return {
    expanded: new Set<NodeId>(),
    positions: new Map<NodeId, Position>(),
    viewport: DEFAULT_VIEWPORT,
  };
}

export function withExpanded(view: ViewState, expanded: ReadonlySet<NodeId>): ViewState {
  return { expanded, positions: view.positions, viewport: view.viewport };
}

export function withPositions(view: ViewState, positions: ReadonlyMap<NodeId, Position>): ViewState {
  return { expanded: view.expanded, positions, viewport: view.viewport };
}

export function withViewport(view: ViewState, viewport: Viewport): ViewState {
  return { expanded: view.expanded, positions: view.positions, viewport };
}

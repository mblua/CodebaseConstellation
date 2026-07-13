// src/ports/renderer.ts — NO graphics-library type appears in this file (§8.1).
// Colours are hex strings, sizes are numbers, shapes are string literals.
//
// `render(scene)` is DECLARATIVE and IDEMPOTENT: the controller hands over a
// complete scene and the adapter diffs it. The controller never issues
// addNode/removeEdge imperatives — an imperative port would smear rendering state
// across the controller and defeat the entire exercise.

/**
 * The viewport, and the ONE coordinate convention every adapter owes the port:
 *
 *   screen = (world - {viewport.x, viewport.y}) * viewport.zoom
 *
 * relative to the top-left of the host element. Stating it here is what lets a
 * shared test drive real pointer events at a known world position without knowing
 * anything about the adapter's internals — and it is still only numbers, so no
 * graphics library leaks into this file.
 */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/** `cut-rect` — a rectangle with a clipped top-right corner. It exists so that a
 *  Rust `crate` is distinguishable from an npm `package` by SHAPE and not only by
 *  colour, which is what an accessible legend actually needs. An adapter that does
 *  not know a shape must fall back to `rect` rather than fail. */
export type NodeShape = 'rect' | 'round-rect' | 'hex' | 'cut-rect';
export type ArrowShape = 'triangle' | 'none';

export interface RenderNode {
  id: string;
  kind: string;
  label: string;
  /** absolute world centre — domain-authoritative */
  position: { x: number; y: number };
  /** domain-authoritative (§7) */
  size: { w: number; h: number };
  isContainer: boolean;
  isExpanded: boolean;
  /** containers render behind their children */
  z: number;
  selected: boolean;
  dimmed: boolean;
  hidden: boolean;
  style: { fill: string; stroke: string; text: string; shape: NodeShape };
  badge?: string;
}

export interface RenderEdge {
  id: string;
  kind: string;
  sourceId: string;
  targetId: string;
  count: number;
  /** e.g. "×34" */
  label?: string;
  selected: boolean;
  dimmed: boolean;
  hidden: boolean;
  style: { color: string; width: number; dash: readonly number[] | null; arrow: ArrowShape };
}

export interface RenderScene {
  nodes: readonly RenderNode[];
  edges: readonly RenderEdge[];
}

export type RendererEvent =
  | { type: 'node:click'; id: string; additive: boolean }
  | { type: 'node:dblclick'; id: string }
  | { type: 'node:dragend'; id: string; position: { x: number; y: number } }
  | { type: 'edge:click'; id: string }
  | { type: 'background:click' }
  | { type: 'viewport:change'; viewport: Viewport };

export interface GraphRenderer {
  mount(host: HTMLElement): void;
  /** declarative, idempotent */
  render(scene: RenderScene): void;
  on(handler: (e: RendererEvent) => void): () => void;
  /**
   * Fit the content to the host.
   *
   * `fit()` and `zoomBy()` MOVE THE CAMERA, so they emit `viewport:change` — they are
   * the renderer's own decision, and the controller learns about them the same way it
   * learns about a wheel or a pan. `setViewport()` does NOT emit, because the controller
   * is the one calling it, and an echo would be a feedback loop.
   */
  fit(ids?: readonly string[]): void;
  /**
   * Multiply the zoom by `factor`, keeping the CENTRE of the host fixed.
   *
   * The controller cannot do this itself: `screen = (world - viewport) * zoom` needs
   * the host's pixel size to know what "the centre" is, and the host belongs to the
   * adapter. It is still only numbers, so no graphics type leaks — and it is what
   * lets the toolbar's Zoom buttons and the `+`/`-` keys work through the ordinary
   * command loop instead of reaching into Canvas2D from the UI.
   */
  zoomBy(factor: number): void;
  getViewport(): Viewport;
  setViewport(v: Viewport): void;
  resize(): void;
  /** idempotent */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Edge routing is part of the CONTRACT, not of an adapter's taste.
//
// §6.3 says that `bundles` and `imports` between the same visible pair "stay two
// edges: they are different facts and must not merge into a meaningless ×2". On the
// real dataset the root npm package and the Tauri crate are joined by FOUR of them
// — bundles, imports, tauri-command, web-command. Keeping them distinct in the
// model and then drawing them on top of one another is the same lie told in
// pixels: you cannot see them, and you cannot click the one you want.
//
// So the fan-out is defined here, in numbers, and every adapter draws it the same
// way. It is also what lets a test know where a line actually IS.
// ---------------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

/** Perpendicular separation between parallel relations, in world units. Wide enough
 *  that the count labels (an 18px pill) sitting at each curve's midpoint do not
 *  collide — four relations between one pair is the normal case here, not the edge
 *  case, and overlapping labels are unreadable. */
export const EDGE_FAN_SPACING = 26;

export interface EdgeRoute {
  /** On the source box's border. */
  a: Point;
  /** On the target box's border. */
  b: Point;
  /** Quadratic control point. */
  control: Point;
  /** The point the curve actually passes through at its middle — where the count
   *  label sits, and the most natural place to click. */
  mid: Point;
}

/** Deterministic: the scene's edge order fixes each edge's place in the fan. */
export function edgeFanOffsets(edges: readonly RenderEdge[]): Map<string, number> {
  // Nested maps, keyed by the endpoint ids themselves. Nothing is concatenated, so
  // an id containing any delimiter cannot collide with another (§6.3).
  const byPair = new Map<string, Map<string, RenderEdge[]>>();
  for (const e of edges) {
    const lo = e.sourceId <= e.targetId ? e.sourceId : e.targetId;
    const hi = e.sourceId <= e.targetId ? e.targetId : e.sourceId;
    let inner = byPair.get(lo);
    if (inner === undefined) {
      inner = new Map<string, RenderEdge[]>();
      byPair.set(lo, inner);
    }
    const list = inner.get(hi);
    if (list === undefined) inner.set(hi, [e]);
    else list.push(e);
  }

  const offsets = new Map<string, number>();
  for (const [, inner] of byPair) {
    for (const [, list] of inner) {
      const n = list.length;
      list.forEach((e, i) => {
        offsets.set(e.id, (i - (n - 1) / 2) * EDGE_FAN_SPACING);
      });
    }
  }
  return offsets;
}

export function routeEdges(scene: RenderScene): Map<string, EdgeRoute> {
  const byId = new Map<string, RenderNode>();
  for (const n of scene.nodes) byId.set(n.id, n);
  const offsets = edgeFanOffsets(scene.edges);

  const routes = new Map<string, EdgeRoute>();
  for (const e of scene.edges) {
    const s = byId.get(e.sourceId);
    const t = byId.get(e.targetId);
    if (s === undefined || t === undefined) continue;

    const a = borderPoint(s.position, s.size, t.position);
    const b = borderPoint(t.position, t.size, s.position);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const offset = offsets.get(e.id) ?? 0;
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;

    routes.set(e.id, {
      a,
      b,
      // A quadratic whose control point is twice the offset passes exactly through
      // `mid` at t = 0.5, so the label and the click target agree with the curve.
      control: { x: cx + nx * offset * 2, y: cy + ny * offset * 2 },
      mid: { x: cx + nx * offset, y: cy + ny * offset },
    });
  }
  return routes;
}

export function pointOnEdge(route: EdgeRoute, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * route.a.x + 2 * u * t * route.control.x + t * t * route.b.x,
    y: u * u * route.a.y + 2 * u * t * route.control.y + t * t * route.b.y,
  };
}

/** Distance from a world point to the drawn curve, by sampling it. */
export function distanceToEdge(route: EdgeRoute, p: Point, samples = 24): number {
  let best = Infinity;
  let previous = pointOnEdge(route, 0);
  for (let i = 1; i <= samples; i += 1) {
    const current = pointOnEdge(route, i / samples);
    best = Math.min(best, distanceToSegment(p, previous, current));
    previous = current;
  }
  return best;
}

/** Where the line between two boxes should start and stop: on their borders. */
export function borderPoint(centre: Point, size: { w: number; h: number }, towards: Point): Point {
  const dx = towards.x - centre.x;
  const dy = towards.y - centre.y;
  if (dx === 0 && dy === 0) return { ...centre };
  const scale = Math.min(
    dx === 0 ? Infinity : size.w / 2 / Math.abs(dx),
    dy === 0 ? Infinity : size.h / 2 / Math.abs(dy),
  );
  return { x: centre.x + dx * scale, y: centre.y + dy * scale };
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

export class MalformedSceneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MalformedSceneError';
  }
}

/** Every adapter runs this on the scene it is handed. A malformed scene is a bug
 *  in the controller, and it must surface as an error, not as a blank canvas. */
export function assertSceneWellFormed(scene: RenderScene): void {
  if (!Array.isArray(scene.nodes) || !Array.isArray(scene.edges)) {
    throw new MalformedSceneError('scene must carry a nodes array and an edges array');
  }
  const ids = new Set<string>();
  for (const n of scene.nodes) {
    if (typeof n.id !== 'string' || n.id === '') {
      throw new MalformedSceneError('every scene node needs a non-empty id');
    }
    if (ids.has(n.id)) throw new MalformedSceneError(`duplicate scene node id: ${n.id}`);
    ids.add(n.id);
    if (!Number.isFinite(n.position.x) || !Number.isFinite(n.position.y)) {
      throw new MalformedSceneError(`node ${n.id} has a non-finite position`);
    }
    if (!Number.isFinite(n.size.w) || !Number.isFinite(n.size.h) || n.size.w < 0 || n.size.h < 0) {
      throw new MalformedSceneError(`node ${n.id} has an invalid size`);
    }
  }
  const edgeIds = new Set<string>();
  for (const e of scene.edges) {
    if (typeof e.id !== 'string' || e.id === '') {
      throw new MalformedSceneError('every scene edge needs a non-empty id');
    }
    if (edgeIds.has(e.id)) throw new MalformedSceneError(`duplicate scene edge id: ${e.id}`);
    edgeIds.add(e.id);
    if (!ids.has(e.sourceId)) {
      throw new MalformedSceneError(`edge ${e.id} names a source node that is not in the scene`);
    }
    if (!ids.has(e.targetId)) {
      throw new MalformedSceneError(`edge ${e.id} names a target node that is not in the scene`);
    }
  }
}

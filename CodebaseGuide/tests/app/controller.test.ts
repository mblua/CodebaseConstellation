// The controller, against FakeRenderer, headless (§8.4, §12).
//
// FakeRenderer is the continuous proof the seam is real: if a controller test ever
// needed the Canvas adapter, the seam would be broken and this file would say so.

import { describe, expect, it } from 'vitest';
import { FakeRenderer } from '../../src/adapters/fake/FakeRenderer.ts';
import { Controller } from '../../src/app/controller.ts';
import { stateFromLoaded } from '../../src/app/state.ts';
import { importDoc } from '../../src/contract/load.ts';
import { sampleDoc } from '../support/doc.ts';

function boot(text = sampleDoc()) {
  const renderer = new FakeRenderer();
  const controller = new Controller(renderer, stateFromLoaded(importDoc(text)));
  controller.start();
  return { renderer, controller };
}

describe('the loop', () => {
  it('renders the initial view: the repository and its children, not every file', () => {
    const { renderer } = boot();
    expect(renderer.nodeIds().sort()).toEqual(['pkg-a', 'pkg-b', 'repo']);
  });

  it('double-clicking a container expands it', () => {
    const { renderer } = boot();
    renderer.emit({ type: 'node:dblclick', id: 'pkg-a' });
    expect(renderer.nodeIds()).toContain('dir-a');
    renderer.emit({ type: 'node:dblclick', id: 'pkg-a' });
    expect(renderer.nodeIds()).not.toContain('dir-a');
  });

  it('clicking a node selects it; clicking the background clears the selection', () => {
    const { renderer, controller } = boot();
    renderer.emit({ type: 'node:click', id: 'pkg-a', additive: false });
    expect(controller.state.selection.nodeIds).toEqual(['pkg-a']);
    expect(renderer.node('pkg-a')?.selected).toBe(true);

    renderer.emit({ type: 'background:click' });
    expect(controller.state.selection.nodeIds).toEqual([]);
  });

  it('selecting an AGGREGATED edge surfaces its sourceEdgeIds — the product’s promise', () => {
    const { renderer, controller } = boot();
    const aggregate = controller.derived.graph.visibleEdges.find(
      (e) => e.kind === 'imports' && e.count === 2,
    );
    expect(aggregate).toBeDefined();

    renderer.emit({ type: 'edge:click', id: aggregate?.id ?? '' });
    expect(controller.state.selection.edgeId).toBe(aggregate?.id);

    const resolved = controller.derived.graph.visibleEdgeById.get(
      controller.state.selection.edgeId as never,
    );
    // Resolved against the VisibleGraph, never against doc.edges (§6.4).
    expect([...(resolved?.sourceEdgeIds ?? [])]).toEqual(['e1', 'e2']);
    for (const id of resolved?.sourceEdgeIds ?? []) {
      expect(controller.state.model.edgeById.has(id)).toBe(true);
    }
  });

  it('selecting a container surfaces WHICH relations are hidden inside it, not a bare number', () => {
    const { controller } = boot();
    const buckets = controller.derived.graph.internalBucketsByNode.get('pkg-a') ?? [];
    expect(buckets).toHaveLength(1);
    expect([...(buckets[0]?.sourceEdgeIds ?? [])]).toEqual(['e3']);
  });

  it('search dims the misses and ExpandTo reveals a hit hidden inside collapsed ancestors', () => {
    const { renderer, controller } = boot();
    controller.dispatch({ type: 'SetSearch', query: 'two.ts' });
    expect(controller.state.search.matches.has('file-a2')).toBe(true);

    // The hit is not drawn yet — it is inside a collapsed package.
    expect(renderer.nodeIds()).not.toContain('file-a2');
    controller.dispatch({ type: 'ExpandTo', id: 'file-a2' });

    // ExpandTo opened every ancestor: repo → pkg-a → dir-a.
    expect(renderer.nodeIds()).toContain('file-a2');
    expect(renderer.node('file-a2')?.dimmed).toBe(false);
    // A visible node that does not match is dimmed, not hidden.
    expect(renderer.node('pkg-b')?.dimmed).toBe(true);
    expect(renderer.node('pkg-b')?.hidden).toBe(false);
    // A sibling that does not match is dimmed too.
    expect(renderer.node('file-a1')?.dimmed).toBe(true);
  });

  it('a filter masks the scene without re-projecting it', () => {
    const { renderer, controller } = boot();
    const before = controller.derived.graph.visibleEdges.length;
    controller.dispatch({ type: 'SetFilter', edgeKinds: new Set(['imports']) });

    // The PROJECTION is unchanged…
    expect(controller.derived.graph.visibleEdges.length).toBe(before);
    // …the SCENE is masked.
    const bundles = renderer.lastScene?.edges.filter((e) => e.kind === 'bundles') ?? [];
    expect(bundles.length).toBeGreaterThan(0);
    for (const e of bundles) expect(e.hidden).toBe(true);
  });

  it('render is declarative: the controller never issues addNode/removeEdge', () => {
    const { renderer } = boot();
    const first = renderer.renderCount;
    renderer.emit({ type: 'node:dblclick', id: 'pkg-a' });
    expect(renderer.renderCount).toBe(first + 1);
    // A whole scene, every time.
    expect(renderer.lastScene?.nodes.length).toBeGreaterThan(0);
  });
});

describe('drag → export → reload', () => {
  it('restores the position, the expansion and the viewport', () => {
    const { renderer, controller } = boot();

    // Open the package AND the directory, so file-a1 is a box the user can grab.
    renderer.emit({ type: 'node:dblclick', id: 'pkg-a' });
    renderer.emit({ type: 'node:dblclick', id: 'dir-a' });
    expect(renderer.nodeIds()).toContain('file-a1');

    renderer.emit({ type: 'node:dragend', id: 'file-a1', position: { x: 777, y: 555 } });
    controller.dispatch({ type: 'SetViewport', viewport: { x: 12, y: 34, zoom: 1.5 } });

    const exported = controller.exportText();

    // A brand-new controller, from the exported bytes alone.
    const renderer2 = new FakeRenderer();
    const controller2 = new Controller(renderer2, stateFromLoaded(importDoc(exported)));
    controller2.start();

    expect(controller2.state.view.positions.get('file-a1')).toEqual({
      x: 777,
      y: 555,
      pinned: true,
    });
    expect(controller2.state.view.expanded.has('pkg-a')).toBe(true);
    expect(controller2.state.view.expanded.has('dir-a')).toBe(true);
    expect(controller2.state.view.viewport).toEqual({ x: 12, y: 34, zoom: 1.5 });

    // …and the node is actually drawn there.
    expect(renderer2.node('file-a1')?.position).toEqual({ x: 777, y: 555 });
  });

  it('the exported document re-imports cleanly', () => {
    const { renderer, controller } = boot();
    renderer.emit({ type: 'node:dragend', id: 'pkg-a', position: { x: 10, y: 20 } });
    const exported = controller.exportText();
    expect(() => importDoc(exported)).not.toThrow();
  });
});

describe('import is not refresh (§3.5)', () => {
  it('import keeps a stale position; refresh drops it and SAYS SO', () => {
    const withGhost = JSON.stringify({
      ...(JSON.parse(sampleDoc()) as object),
      view: { positions: { ghost: { x: 1, y: 2 } }, expanded: ['repo'] },
    });

    const { controller } = boot(withGhost);
    // import discards NOTHING.
    expect(controller.state.view.positions.has('ghost')).toBe(true);
    expect(controller.state.warnings.some((w) => w.code === 'stale-position')).toBe(true);

    // refresh drops what no longer exists, and hands back a loss report.
    controller.refreshText(sampleDoc());
    expect(controller.state.view.positions.has('ghost')).toBe(false);
    expect(controller.state.loss?.droppedPositions).toEqual(['ghost']);
  });

  it('refresh keeps the layout the user made', () => {
    const { renderer, controller } = boot();
    renderer.emit({ type: 'node:dragend', id: 'pkg-b', position: { x: 400, y: 300 } });
    controller.refreshText(sampleDoc());
    expect(controller.state.view.positions.get('pkg-b')).toEqual({ x: 400, y: 300, pinned: true });
  });
});

describe('refresh and an OPEN vocabulary (§3.7)', () => {
  it('a kind that did not exist before is SHOWN, not hidden by an inherited filter', () => {
    const { controller } = boot();

    // The user hides one kind they know about.
    const withoutBundles = new Set(
      [...controller.state.filters.edgeKinds].filter((k) => k !== 'bundles'),
    );
    controller.dispatch({ type: 'SetFilter', edgeKinds: withoutBundles });
    expect(controller.state.filters.edgeKinds.has('bundles')).toBe(false);

    // A newer extraction introduces a kind nobody has ever seen.
    const next = JSON.parse(sampleDoc()) as { nodes: unknown[]; edges: unknown[] };
    next.edges.push({
      id: 'e5',
      kind: 'tauri-command',
      sourceId: 'file-a1',
      targetId: 'file-b1',
      confidence: 'resolved',
    });
    next.nodes.push({ id: 'crate-c', kind: 'crate', label: 'crate-c', parentId: 'repo' });
    controller.refreshText(JSON.stringify(next));

    // The new kinds are visible — a filter cannot hide what the user never switched off…
    expect(controller.state.filters.edgeKinds.has('tauri-command')).toBe(true);
    expect(controller.state.filters.nodeKinds.has('crate')).toBe(true);
    // …and the one they DID switch off stays off.
    expect(controller.state.filters.edgeKinds.has('bundles')).toBe(false);
    expect(controller.state.filters.edgeKinds.has('imports')).toBe(true);
  });
});

describe('zoom goes through the controller and the port, never around them', () => {
  it('zoomBy asks the renderer and records the viewport it comes back with', () => {
    const { renderer, controller } = boot();
    const before = controller.state.view.viewport.zoom;

    controller.zoomBy(2);
    expect(renderer.zoomCalls).toEqual([2]);
    expect(controller.state.view.viewport.zoom).toBeCloseTo(before * 2, 6);

    controller.zoomBy(0.5);
    expect(controller.state.view.viewport.zoom).toBeCloseTo(before, 6);
  });

  it('ONE notification per action — the renderer already told us the camera moved', () => {
    // `fit()` and `zoomBy()` emit `viewport:change`, which the controller turns into state
    // and a notification. Reading the viewport back and applying the IDENTICAL value a
    // second time notified again, so every zoom re-rendered the whole UI twice.
    const { controller } = boot();

    let notifications = 0;
    const off = controller.subscribe(() => {
      notifications += 1;
    });
    expect(notifications).toBe(1); // subscribe delivers the current state immediately
    notifications = 0;

    controller.zoomBy(2);
    expect(notifications, 'zoomBy notified more than once').toBe(1);

    notifications = 0;
    controller.fit();
    expect(notifications, 'fit notified more than once').toBe(1);

    off();
  });
});

describe('destroy', () => {
  it('unwires the renderer and is safe to call twice', () => {
    const { renderer, controller } = boot();
    controller.destroy();
    controller.destroy();
    expect(renderer.destroyCount).toBeGreaterThanOrEqual(1);
  });
});

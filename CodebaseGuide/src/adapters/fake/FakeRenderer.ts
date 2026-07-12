// FakeRenderer is the continuous proof the seam is real (§8.4).
//
// It implements GraphRenderer, records the last scene, and injects events. Every
// controller test runs against it, headless. If a controller test ever needs the
// real adapter, the seam has been broken and CI says so.
//
// It does NOT substitute for the browser: it cannot prove canvas output,
// hit-testing or real event behaviour. That is what the Playwright smoke is for,
// and that is mandatory.

import {
  assertSceneWellFormed,
  type GraphRenderer,
  type RenderScene,
  type RendererEvent,
  type Viewport,
} from '../../ports/renderer.ts';

export class FakeRenderer implements GraphRenderer {
  lastScene: RenderScene | null = null;
  renderCount = 0;
  fitCalls: (readonly string[] | undefined)[] = [];
  zoomCalls: number[] = [];
  resizeCount = 0;
  destroyCount = 0;
  mountedTo: HTMLElement | null = null;

  private viewport: Viewport = { x: 0, y: 0, zoom: 1 };
  private handlers = new Set<(e: RendererEvent) => void>();
  private destroyed = false;

  mount(host: HTMLElement): void {
    this.mountedTo = host;
  }

  render(scene: RenderScene): void {
    if (this.destroyed) throw new Error('render() after destroy()');
    assertSceneWellFormed(scene);
    this.lastScene = scene;
    this.renderCount += 1;
  }

  on(handler: (e: RendererEvent) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  fit(ids?: readonly string[]): void {
    this.fitCalls.push(ids);
    // A real adapter moves the camera and says so; the fake must keep the same promise,
    // or the controller's "exactly one notification per action" is only true of the fake.
    this.emit({ type: 'viewport:change', viewport: { ...this.viewport } });
  }

  zoomBy(factor: number): void {
    // No host, so there is no centre to hold fixed. The zoom still changes, which is
    // what the controller observes.
    this.zoomCalls.push(factor);
    this.viewport = { ...this.viewport, zoom: this.viewport.zoom * factor };
    this.emit({ type: 'viewport:change', viewport: { ...this.viewport } });
  }

  getViewport(): Viewport {
    return { ...this.viewport };
  }

  setViewport(v: Viewport): void {
    this.viewport = { ...v };
  }

  resize(): void {
    this.resizeCount += 1;
  }

  destroy(): void {
    // Idempotent.
    this.destroyCount += 1;
    this.destroyed = true;
    this.handlers.clear();
  }

  // --- test affordances ----------------------------------------------------

  /** Inject an event as if the user had done it. */
  emit(event: RendererEvent): void {
    for (const handler of [...this.handlers]) handler(event);
  }

  nodeIds(): string[] {
    return (this.lastScene?.nodes ?? []).map((n) => n.id);
  }

  edgeIds(): string[] {
    return (this.lastScene?.edges ?? []).map((e) => e.id);
  }

  node(id: string) {
    return (this.lastScene?.nodes ?? []).find((n) => n.id === id);
  }

  edge(id: string) {
    return (this.lastScene?.edges ?? []).find((e) => e.id === id);
  }
}

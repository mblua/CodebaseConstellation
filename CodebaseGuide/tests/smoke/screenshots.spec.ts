// The CANONICAL screenshots, for the README and the docs.
//
// This is NOT part of `npm run verify`. A gate that rewrites the documentation it is
// meant to be checking cannot fail cleanly — and it did: every `verify` silently
// re-stamped four PNGs in `docs/`, so a "no changes" check could never mean anything.
//
// Updating the pictures is now something a person decides to do:
//
//     npm run update:screenshots
//
// The acceptance smoke writes its own captures to `test-results/`, where artifacts
// belong.
//
// Every capture here is produced by the SAME mechanism the acceptance smoke uses. A
// picture called "edge-detail" that was made by selecting a node from the list is not a
// picture of an edge detail — it is a caption disagreeing with its image, which is the
// one thing a map of a codebase must never do.

import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { routeEdges, type RenderScene } from '../../src/ports/renderer.ts';

const SHOTS = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));

interface SceneNode {
  id: string;
  kind: string;
  position: { x: number; y: number };
  size: { w: number; h: number };
  hidden: boolean;
}
interface SceneEdge {
  id: string;
  kind: string;
  sourceId: string;
  targetId: string;
  count: number;
  hidden: boolean;
}
interface Hooks {
  scene(): { nodes: SceneNode[]; edges: SceneEdge[] };
  viewport(): { x: number; y: number; zoom: number };
}

test.beforeAll(() => {
  mkdirSync(SHOTS, { recursive: true });
});

async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('.canvas-host canvas');
  await page.waitForFunction(() => '__codebaseguide' in globalThis);
  await page.waitForTimeout(500);
}

async function readScene(page: Page): Promise<{
  scene: { nodes: SceneNode[]; edges: SceneEdge[] };
  viewport: { x: number; y: number; zoom: number };
}> {
  return page.evaluate(() => {
    const hooks = (globalThis as unknown as Record<string, unknown>)['__codebaseguide'] as Hooks;
    return { scene: hooks.scene(), viewport: hooks.viewport() };
  });
}

async function clickWorld(
  page: Page,
  world: { x: number; y: number },
  viewport: { x: number; y: number; zoom: number },
  action: 'click' | 'dblclick' = 'click',
): Promise<void> {
  const box = await page.locator('.canvas-host canvas').boundingBox();
  if (box === null) throw new Error('no canvas');
  const p = {
    x: box.x + (world.x - viewport.x) * viewport.zoom,
    y: box.y + (world.y - viewport.y) * viewport.zoom,
  };
  if (action === 'dblclick') await page.mouse.dblclick(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(300);
}

test('canonical: the initial map', async ({ page }) => {
  await boot(page);
  await page.screenshot({ path: `${SHOTS}agentscommander-map.png` });
});

test('canonical: a crate expanded', async ({ page }) => {
  await boot(page);
  const { scene, viewport } = await readScene(page);
  const crate = scene.nodes.find((n) => n.id === 'pkg:cargo:src-tauri/Cargo.toml');
  expect(crate).toBeDefined();
  if (crate === undefined) throw new Error('unreachable');

  await clickWorld(page, crate.position, viewport, 'dblclick');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}agentscommander-expanded.png` });
});

test('canonical: the AGGREGATED COMMAND EDGE, with its evidence', async ({ page }) => {
  await boot(page);

  // Click the real line, the way the acceptance smoke does and the way a user does:
  // `routeEdges` is the port's own rule for where each of the four parallel relations
  // between that pair is drawn.
  const { scene, viewport } = await readScene(page);
  const edge = scene.edges.find((e) => e.kind === 'tauri-command' && !e.hidden);
  expect(edge, 'no aggregated tauri-command edge is drawn').toBeDefined();
  if (edge === undefined) throw new Error('unreachable');

  const route = routeEdges(scene as unknown as RenderScene).get(edge.id);
  expect(route).toBeDefined();
  if (route === undefined) throw new Error('unreachable');

  await clickWorld(page, route.mid, viewport);

  // The picture must show what its filename says it shows.
  await expect(page.locator('.detail .chip')).toContainText('tauri-command');
  await expect(page.locator('.detail')).toContainText('logical relations behind this line');
  await expect(page.locator('.logical').first().locator('.evidence li').first()).toBeVisible();

  await page.screenshot({ path: `${SHOTS}agentscommander-edge-detail.png` });
});

test('canonical: the map in an 800x800 window', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 800 });
  await boot(page);
  await page.screenshot({ path: `${SHOTS}agentscommander-narrow.png` });
});

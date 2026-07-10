import { existsSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const realDatabase = path.resolve(process.cwd(), "../.local/agentscommander.sqlite");

interface CameraDiagnostics {
  mode: string;
  near: number;
  far: number;
  distance: number;
  framedNodes: number;
  inViewNodes: number;
  frameWidth: number;
  frameHeight: number;
  focusNeighbors: number;
  selectedX: number;
  selectedY: number;
  selectedZ: number;
  selectedDistance: number;
}

async function cameraDiagnostics(page: import("@playwright/test").Page): Promise<CameraDiagnostics> {
  return page.locator("canvas.graph-canvas").evaluate((canvas) => {
    const data = (canvas as HTMLCanvasElement).dataset;
    const number = (key: keyof DOMStringMap): number => Number(data[key] ?? "NaN");
    return {
      mode: data.cameraMode ?? "",
      near: number("cameraNear"),
      far: number("cameraFar"),
      distance: number("cameraDistance"),
      framedNodes: number("framedNodeCount"),
      inViewNodes: number("framedInViewCount"),
      frameWidth: number("frameWidth"),
      frameHeight: number("frameHeight"),
      focusNeighbors: number("focusNeighborCount"),
      selectedX: number("selectedNdcX"),
      selectedY: number("selectedNdcY"),
      selectedZ: number("selectedNdcZ"),
      selectedDistance: number("selectedDistance"),
    };
  });
}

test("frames the optional AgentsCommander database and focuses a selected file", async ({ page }) => {
  test.skip(
    !existsSync(realDatabase),
    "Place the ignored real database at .local/agentscommander.sqlite to run this scale smoke.",
  );

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      console.log(`[browser ${message.type()}] ${message.text()}`);
    }
  });

  await page.goto("/");
  await page.waitForFunction(
    () => (window as Window & { __CONSTELLATION_READY__?: boolean }).__CONSTELLATION_READY__ === true,
  );
  await page.locator("#database-file").setInputFiles(realDatabase);
  await expect(page.locator("#source-label")).toContainText("agentscommander.sqlite", { timeout: 30_000 });
  await expect(page.locator("#graph-stats")).toContainText("722 / 784");

  await page.locator("#fit-view").click();
  const overview = await cameraDiagnostics(page);
  expect(overview.mode).toBe("fit");
  expect(overview.framedNodes).toBe(722);
  expect(overview.inViewNodes).toBe(overview.framedNodes);
  expect(overview.near).toBeGreaterThan(0);
  expect(overview.far).toBeGreaterThan(overview.distance);
  expect(overview.frameWidth).toBeGreaterThan(0.5);
  expect(overview.frameHeight).toBeGreaterThan(0.5);
  expect(overview.frameWidth).toBeLessThanOrEqual(2);
  expect(overview.frameHeight).toBeLessThanOrEqual(2);
  await page.screenshot({ path: "test-results/agentscommander-real-overview.png", animations: "disabled" });

  await page.locator("#node-search").fill("sessions_persistence");
  const result = page.locator(".search-result", { hasText: "sessions_persistence.rs" }).first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page.locator("#detail-panel h2")).toContainText("sessions_persistence.rs");
  await expect(page.locator("#detail-panel .detail-section-heading", { hasText: "Relationships & evidence" }))
    .toContainText("20 edges");
  await page.waitForTimeout(500);

  const focused = await cameraDiagnostics(page);
  expect(focused.mode).toBe("focus");
  expect(focused.focusNeighbors).toBeGreaterThan(0);
  expect(focused.framedNodes).toBe(focused.focusNeighbors + 1);
  expect(focused.inViewNodes).toBe(focused.framedNodes);
  expect(Math.abs(focused.selectedX)).toBeLessThan(0.001);
  expect(Math.abs(focused.selectedY)).toBeLessThan(0.001);
  expect(focused.selectedZ).toBeGreaterThanOrEqual(-1);
  expect(focused.selectedZ).toBeLessThanOrEqual(1);
  expect(focused.near).toBeLessThan(focused.selectedDistance);
  expect(focused.far).toBeGreaterThan(focused.selectedDistance);
  await page.screenshot({ path: "test-results/agentscommander-real-selected.png", animations: "disabled" });

  expect(pageErrors).toEqual([]);
});

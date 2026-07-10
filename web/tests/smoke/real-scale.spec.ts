import { existsSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const realDatabase = path.resolve(process.cwd(), "../.local/agentscommander-current.sqlite");

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

test("frames and investigates the history-off AgentsCommander database", async ({ page }) => {
  test.skip(
    !existsSync(realDatabase),
    "Place the ignored history-off database at .local/agentscommander-current.sqlite to run this scale smoke.",
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
  await expect(page.locator("#source-label")).toContainText("agentscommander-current.sqlite", { timeout: 30_000 });
  await expect(page.locator("#snapshot-meta")).toContainText("current source");
  await expect(page.locator("#detail-panel h2")).toHaveText("Current-source architecture");
  await expect(page.locator("#detail-panel")).not.toContainText("visible commits");
  await expect(page.locator(".layer-button", { hasText: "Change" })).toHaveCount(0);
  await expect(page.locator("#capability-list")).not.toContainText("Git History");
  await expect(page.locator("#capability-list")).not.toContainText("Issue File Touches");
  await expect(page.locator("#graph-stats")).toContainText("722 / 782");
  await expect(page.locator("#graph-stats")).toContainText("1,579 / 3,635");

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
    .toContainText("18 edges");
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

  await page.locator("#spaghetti-mode").click();
  await expect(page.locator("#spaghetti-mode")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#detail-panel h2")).toHaveText("Spaghetti investigation");
  const diagnosticCards = page.locator("#detail-panel .diagnostic-card");
  await expect(diagnosticCards).toHaveCount(27);
  await expect(diagnosticCards.first()).toHaveAttribute("data-finding-class", /cycle|hub|boundary-sprawl/);
  await expect(page.locator('[data-finding-class="cycle"]').first()).toBeVisible();
  await expect(page.locator('[data-finding-class="hub"]').first()).toBeVisible();
  await expect(page.locator('[data-finding-class="boundary-sprawl"]').first()).toBeVisible();
  await expect(page.locator("#graph-stats")).toContainText("478 / 782");
  await expect(page.locator("#graph-stats")).toContainText("2,056 / 3,635");
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/agentscommander-spaghetti-overview.png", animations: "disabled" });

  const isolate = diagnosticCards.first().locator(".finding-isolate");
  const counts = await isolate.evaluate((button) => ({
    nodes: Number((button as HTMLButtonElement).dataset.nodeCount),
    edges: Number((button as HTMLButtonElement).dataset.edgeCount),
  }));
  expect(counts.nodes).toBeGreaterThan(0);
  expect(counts.edges).toBeGreaterThan(0);
  await isolate.click();
  await expect(page.locator("#finding-isolation")).toBeVisible();
  await expect(page.locator("#finding-isolation-copy"))
    .toContainText(`${counts.nodes} node${counts.nodes === 1 ? "" : "s"}`);
  await expect(page.locator("#finding-isolation-copy"))
    .toContainText(`${counts.edges} edge${counts.edges === 1 ? "" : "s"}`);
  await expect(page.locator("#graph-stats")).toContainText(`${counts.nodes.toLocaleString("en-US")} /`);
  await expect(page.locator("#graph-stats")).toContainText(`${counts.edges.toLocaleString("en-US")} /`);
  await expect(page.locator("#detail-panel .metric-grid")).toContainText("Dependency fan-in");
  await expect(page.locator("#detail-panel .metric-grid")).toContainText("Dependency fan-out");
  await expect(page.locator("#detail-panel .metric-grid")).toContainText("Detected boundary imports in");
  await expect(page.locator("#detail-panel .metric-grid")).toContainText("Detected boundary imports out");
  await expect(page.locator("#detail-panel .metric-grid")).toContainText("Dependency zones reached");
  await expect(page.locator("#detail-panel .metric-grid")).toContainText("Cycle membership");
  await expect(page.locator("#detail-panel .metric-grid")).toContainText("Lines of code");
  await expect(page.locator(".brand")).toBeVisible();
  await expect(page.locator("#spaghetti-mode")).toBeVisible();
  await page.waitForTimeout(500);
  await page.locator("#clear-selection").click();
  await expect(page.locator("#finding-isolation")).toBeVisible();
  await expect(page.locator("#detail-panel h2")).toHaveText("Spaghetti investigation");
  await page.screenshot({ path: "test-results/agentscommander-spaghetti-isolated.png" });

  await page.locator("#exit-finding-isolation").click();
  await expect(page.locator("#finding-isolation")).toBeHidden();
  await expect(page.locator("#spaghetti-mode")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#detail-panel h2")).toHaveText("Spaghetti investigation");
  await expect(page.locator("#graph-stats")).toContainText("478 / 782");

  expect(pageErrors).toEqual([]);
});

import { expect, test } from "@playwright/test";

test("loads the v1 seed and supports an investigation flow", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      console.log(`[browser ${message.type()}] ${message.text()}`);
    }
  });

  await page.goto("/");
  const loadState = await page.waitForFunction(() => {
    if ((window as Window & { __CONSTELLATION_READY__?: boolean }).__CONSTELLATION_READY__) return "ready";
    const toast = document.querySelector<HTMLElement>("#toast:not([hidden]) #toast-message");
    return toast ? `error:${toast.textContent ?? "unknown load error"}` : false;
  });
  const loadResult = await loadState.jsonValue();
  expect(loadResult, `application load state: ${loadResult}`).toBe("ready");

  await expect(page.locator("#source-label")).toContainText("fixtures/seed.sqlite");
  await expect(page.locator("#repository-name")).toHaveText("AgentsCommander");
  await expect(page.locator("#graph-stats")).toContainText("39 / 53");
  await expect(page.locator("#graph-stats")).toContainText("49 / 92");
  await expect(page.locator("canvas.graph-canvas")).toBeVisible();
  await expect(page.locator("#capability-list")).toContainText("degraded");

  const spaghetti = page.locator("#spaghetti-mode");
  await expect(spaghetti).toBeVisible();
  await spaghetti.click();
  await expect(spaghetti).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#detail-panel h2")).toHaveText("Spaghetti investigation");
  await expect(page.locator("#detail-panel")).toContainText("No cycle, dependency-hub, or boundary-sprawl findings");
  await expect(page.locator(".layer-button", { hasText: "Change" })).toBeDisabled();
  await spaghetti.click();
  await expect(spaghetti).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#detail-panel h2")).toHaveText("Architecture overview");

  await page.locator("#node-search").fill("sessions_persistence");
  const result = page.locator(".search-result", { hasText: "sessions_persistence.rs" }).first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page.locator("#detail-panel h2")).toContainText("sessions_persistence.rs");
  await expect(page.locator("#detail-panel")).toContainText("3,282 lines");
  await expect(page.locator("#detail-panel .detail-section-heading", { hasText: "Relationships & evidence" }))
    .toContainText("6 edges");
  await expect(page.locator("#detail-panel .neighbor-card")).toHaveCount(6);
  await expect(page.locator("#detail-panel")).not.toContainText("package.json");

  const dependencyLayer = page.locator(".layer-button", { hasText: "Dependencies" });
  await dependencyLayer.click();
  await expect(dependencyLayer).toHaveAttribute("aria-pressed", "true");

  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/constellation-mvp.png", animations: "disabled" });
  expect(pageErrors).toEqual([]);
});

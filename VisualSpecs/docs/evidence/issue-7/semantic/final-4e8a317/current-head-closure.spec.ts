import {
  expect,
  test,
  type Locator,
  type Page,
} from '../../../../../node_modules/@playwright/test/index.mjs';

test('Recovery keeps its exact surviving opener at rest and across both live breakpoints', async ({ page }) => {
  const rootName = `semantic-current-head-${Date.now()}`;
  await installPickerHarness(page, rootName);
  await seedRecoveryPreview(page, rootName);

  const compactRecovery = page.getByRole('button', {
    name: 'Recovery available',
    exact: true,
  });
  const genericShow = page.locator('#show-project-rail');
  const collapse = page.getByRole('button', { name: 'Collapse project rail', exact: true });

  await compactRecovery.evaluate((element) => {
    (globalThis as unknown as Record<string, unknown>)['__semanticGateRecoveryOpener'] = element;
  });

  await compactRecovery.click();
  await expect(collapse).toBeFocused();
  await page.keyboard.press('Escape');
  await assertExactRecoveryFocus(page, compactRecovery, genericShow);

  await compactRecovery.click();
  await expect(collapse).toBeFocused();
  await page.setViewportSize({ width: 1199, height: 900 });
  await waitForPaint(page);
  await expect(collapse).toBeFocused();
  await page.keyboard.press('Escape');
  await assertExactRecoveryFocus(page, compactRecovery, genericShow);

  await compactRecovery.click();
  await expect(collapse).toBeFocused();
  await page.setViewportSize({ width: 1200, height: 900 });
  await waitForPaint(page);
  await expect(collapse).toBeFocused();
  await page.keyboard.press('Escape');
  await assertExactRecoveryFocus(page, compactRecovery, genericShow);

  await expect(page.locator('.project-states')).toContainText('Preview');
  await expect(page.locator('.project-states')).toContainText('Recovery available');
});

test('invalid temporary JSON preserves every pre-existing trust banner', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 1000 });
  await page.goto('/');
  await page.waitForSelector('.canvas-host canvas');

  const coverage = page.locator('.banner.coverage');
  const unresolved = page.locator('.banner.unresolved');
  const before = {
    coverageCount: await coverage.count(),
    coverageText: await coverage.allTextContents(),
    unresolvedCount: await unresolved.count(),
    unresolvedText: await unresolved.allTextContents(),
  };
  expect(before.coverageCount).toBeGreaterThan(0);
  expect(before.unresolvedCount).toBeGreaterThan(0);

  await page.locator('#import-input').setInputFiles({
    name: 'semantic-invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{not valid json'),
  });
  await expect(page.locator('.action-error')).toContainText('Open temporary JSON failed');

  expect(await coverage.count()).toBe(before.coverageCount);
  expect(await coverage.allTextContents()).toEqual(before.coverageText);
  expect(await unresolved.count()).toBe(before.unresolvedCount);
  expect(await unresolved.allTextContents()).toEqual(before.unresolvedText);
  await expect(coverage.first()).toBeVisible();
  await expect(unresolved.first()).toBeVisible();
});

async function installPickerHarness(page: Page, rootName: string): Promise<void> {
  await page.addInitScript((name) => {
    const globals = globalThis as unknown as Record<string, unknown>;
    globals['showDirectoryPicker'] = async () => {
      const opfs = await navigator.storage.getDirectory();
      return opfs.getDirectoryHandle(name, { create: true });
    };
    globals['showSaveFilePicker'] = async ({ suggestedName }: { suggestedName?: string }) => {
      const opfs = await navigator.storage.getDirectory();
      const root = await opfs.getDirectoryHandle(name, { create: true });
      return root.getFileHandle(suggestedName ?? 'save.json', { create: true });
    };
  }, rootName);
}

async function seedRecoveryPreview(page: Page, rootName: string): Promise<void> {
  await page.setViewportSize({ width: 1663, height: 900 });
  await page.goto('/');
  await page.waitForSelector('.canvas-host canvas');
  await page.getByLabel('Project name').fill('Current head recovery owner');
  await page.getByRole('button', { name: 'Create Project', exact: true }).click();
  await expect(page.locator('.project-message')).toContainText('Created project.');
  await page.locator('#export-btn').click();
  await expect(page.locator('.project-message')).toContainText('Exported');
  await page.evaluate(async (name) => {
    const opfs = await navigator.storage.getDirectory();
    const root = await opfs.getDirectoryHandle(name);
    const project = await root.getDirectoryHandle('.visual-specs');
    const data = await project.getDirectoryHandle('data');
    const manifest = JSON.parse(
      await (await (await project.getFileHandle('project.json')).getFile()).text(),
    ) as Record<string, unknown>;
    const projectMeta = manifest['project'] as Record<string, unknown>;
    const currentMeta = manifest['current'] as Record<string, unknown>;
    const handle = await data.getFileHandle('autosave-view.json', { create: true });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify({
      schema: 'visual-specs.autosave-view',
      formatVersion: '1.0',
      projectId: projectMeta['id'],
      docId: currentMeta['docId'],
      baseRevision: currentMeta['revision'],
      savedAtUtc: '2026-07-14T22:40:00.000Z',
      view: { viewport: { x: 77, y: 88, zoom: 1.7 } },
    }));
    await writable.close();
  }, rootName);

  await page.reload();
  await page.waitForSelector('.canvas-host canvas');
  await page.getByRole('button', { name: 'Open Project', exact: true }).click();
  await expect(page.locator('.project-message')).toContainText('Autosave view is available');
  await page.getByRole('button', { name: 'Open export copy', exact: true }).click();
  await expect(page.locator('.project-message')).toContainText('Previewing export copy');
  await expect(page.locator('#project-rail .project-states')).toContainText('Recovery available');
  await page.getByRole('button', { name: 'Collapse project rail', exact: true }).click();
}

async function assertExactRecoveryFocus(
  page: Page,
  compactRecovery: Locator,
  genericShow: Locator,
): Promise<void> {
  await expect(page.locator('#project-rail')).toBeHidden();
  await expect(compactRecovery).toBeVisible();
  await expect(compactRecovery).toBeFocused();
  await expect(genericShow).not.toBeFocused();
  expect(await compactRecovery.evaluate((element) => (
    (globalThis as unknown as Record<string, unknown>)['__semanticGateRecoveryOpener'] === element
  ))).toBe(true);
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
}

async function waitForPaint(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

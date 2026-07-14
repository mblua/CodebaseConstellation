import {
  expect,
  test,
} from '../repo-CodebaseConstellation/VisualSpecs/node_modules/@playwright/test/index.mjs';

test('compact Recovery opener is replaced across Hybrid/Narrow while its element survives', async ({ page }) => {
  const rootName = `semantic-round3-${Date.now()}`;
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

  await page.setViewportSize({ width: 1663, height: 900 });
  await page.goto('/');
  await page.waitForSelector('.canvas-host canvas');
  await page.getByLabel('Project name').fill('Recovery breakpoint owner');
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
      savedAtUtc: '2026-07-14T07:15:00.000Z',
      view: { viewport: { x: 77, y: 88, zoom: 1.7 } },
    }));
    await writable.close();
  }, rootName);

  await page.reload();
  await page.waitForSelector('.canvas-host canvas');
  await page.getByRole('button', { name: 'Open Project', exact: true }).click();
  await page.getByRole('button', { name: 'Open export copy', exact: true }).click();
  await expect(page.locator('#project-rail .project-states')).toContainText('Recovery available');
  await page.getByRole('button', { name: 'Collapse project rail', exact: true }).click();

  const compactRecovery = page.getByRole('button', { name: 'Recovery available', exact: true });
  const genericShow = page.locator('#show-project-rail');
  const collapse = page.getByRole('button', { name: 'Collapse project rail', exact: true });

  await compactRecovery.click();
  await expect(collapse).toBeFocused();
  await page.setViewportSize({ width: 1199, height: 900 });
  await waitForPaint(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#project-rail')).toBeHidden();
  await expect(compactRecovery).toBeVisible();
  await expect(genericShow).toBeFocused();
  await expect(compactRecovery).not.toBeFocused();

  await compactRecovery.click();
  await expect(collapse).toBeFocused();
  await page.setViewportSize({ width: 1200, height: 900 });
  await waitForPaint(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#project-rail')).toBeHidden();
  await expect(compactRecovery).toBeVisible();
  await expect(genericShow).toBeFocused();
  await expect(compactRecovery).not.toBeFocused();
});

async function waitForPaint(page: import('../repo-CodebaseConstellation/VisualSpecs/node_modules/@playwright/test/index.mjs').Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}


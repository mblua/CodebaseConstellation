import {
  expect,
  test,
  type Browser,
  type Page,
} from '../repo-CodebaseConstellation/VisualSpecs/node_modules/@playwright/test/index.mjs';

interface GateHarness {
  rootName: string;
  directoryCalls: number;
  directoryActivations: boolean[];
  saveCalls: number;
  saveActivations: boolean[];
  savedNames: string[];
  permissionCalls: number;
  permissionActivations: boolean[];
}

test('preview recovery export must use the underlying project document', async ({ page }) => {
  const rootName = await installHarness(page);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await boot(page);
    await page.getByLabel('Project name').fill('Preview recovery owner');
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Created project.');

    // Freeze an export of document A, then make current document B and give B a
    // matching recovery view. Opening the old export makes A the active Preview.
    await page.locator('#export-btn').click();
    await expect(page.locator('.project-message')).toContainText('Exported');
    await rewriteUnderlyingCurrentWithRecovery(page, rootName);

    await page.reload();
    await waitForBoot(page);
    await page.getByRole('button', { name: 'Open Project', exact: true }).click();
    await expect(page.locator('.project-states')).toContainText('Recovery available');
    await expect(page.getByLabel('Project export copies').locator('option')).toHaveCount(1);
    await page.getByRole('button', { name: 'Open export copy', exact: true }).click();
    await expect(page.locator('.project-states')).toContainText('Preview');
    await expect(page.locator('.project-states')).toContainText('Recovery available');

    const before = await readProjectState(page);
    expect(before).toMatchObject({
      sessionKind: 'project-preview',
      previewing: true,
      pendingAutosave: true,
    });
    await page.getByRole('button', { name: 'Export autosave copy', exact: true }).click();
    await expect.poll(() => harnessValue<number>(page, 'saveCalls')).toBe(1);
    await expect(page.locator('.project-message')).toContainText('Exported autosave copy');

    const saved = await readOnlySavedCopy(page, rootName);
    const underlying = await readUnderlyingCurrent(page, rootName);
    const evidence = {
      sessionKind: before.sessionKind,
      pendingAutosave: before.pendingAutosave,
      activePreviewMarker: saved['resilienceUnderlyingMarker'] ?? null,
      underlyingMarker: underlying['resilienceUnderlyingMarker'] ?? null,
      savedNodeCount: Array.isArray(saved['nodes']) ? saved['nodes'].length : -1,
      underlyingNodeCount: Array.isArray(underlying['nodes']) ? underlying['nodes'].length : -1,
      saveCalls: await harnessValue<number>(page, 'saveCalls'),
      saveActivations: await harnessValue<boolean[]>(page, 'saveActivations'),
      pageErrors,
    };
    console.log('PREVIEW_RECOVERY_EVIDENCE=' + JSON.stringify(evidence));
    expect(evidence.saveActivations).toEqual([true]);
    expect(pageErrors).toEqual([]);

    // Approved invariant: Preview/recovery actions cannot operate on the wrong
    // document. This intentionally fails if the copy combines Preview A with B's view.
    expect(saved['resilienceUnderlyingMarker']).toBe('UNDERLYING-CURRENT-B');
  } finally {
    await cleanup(page, rootName);
  }
});

test('editable Preview must not write a wrong-document recovery copy into project exports', async ({ page }) => {
  const rootName = await installHarness(page);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await boot(page);
    await page.getByLabel('Project name').fill('Editable preview recovery');
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Created project.');
    await page.locator('#export-btn').click();
    await expect(page.locator('.project-message')).toContainText('Exported');
    await rewriteUnderlyingCurrentWithRecovery(page, rootName);
    await page.reload();
    await waitForBoot(page);
    await page.getByRole('button', { name: 'Open Project', exact: true }).click();
    await page.getByRole('button', { name: 'Enable editing', exact: true }).click();
    await expect(page.locator('.project-states')).toContainText('Project access: editable');
    await page.getByRole('button', { name: 'Open export copy', exact: true }).click();
    await expect(page.locator('.project-states')).toContainText('Preview');
    await expect(page.locator('.project-states')).toContainText('Recovery available');
    const beforeFiles = await readProjectExports(page, rootName);

    await page.getByRole('button', { name: 'Export autosave copy', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('using project-export');
    const afterFiles = await readProjectExports(page, rootName);
    const newNames = Object.keys(afterFiles).filter((name) => !(name in beforeFiles));
    expect(newNames).toHaveLength(1);
    const written = afterFiles[newNames[0] ?? ''] ?? {};
    const underlying = await readUnderlyingCurrent(page, rootName);
    const evidence = {
      beforeExports: Object.keys(beforeFiles),
      afterExports: Object.keys(afterFiles),
      writtenMarker: written['resilienceUnderlyingMarker'] ?? null,
      underlyingMarker: underlying['resilienceUnderlyingMarker'] ?? null,
      savePickerCalls: await harnessValue<number>(page, 'saveCalls'),
      permissionActivations: await harnessValue<boolean[]>(page, 'permissionActivations'),
      pageErrors,
    };
    console.log('EDITABLE_PREVIEW_RECOVERY_EVIDENCE=' + JSON.stringify(evidence));
    expect(evidence.savePickerCalls).toBe(0);
    expect(evidence.permissionActivations).toEqual([true]);
    expect(pageErrors).toEqual([]);
    expect(written['resilienceUnderlyingMarker']).toBe('UNDERLYING-CURRENT-B');
  } finally {
    await cleanup(page, rootName);
  }
});

test('boundary and toggle bursts preserve one overlay, focus, preferences, and DPR backing', async ({ browser }) => {
  const observations: Array<Record<string, unknown>> = [];
  for (const dpr of [1, 2]) {
    const context = await browser.newContext({
      baseURL: 'http://localhost:5175',
      viewport: { width: 1680, height: 1000 },
      deviceScaleFactor: dpr,
    });
    const page = await context.newPage();
    const rootName = await installHarness(page);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    try {
      await boot(page);
      await page.getByLabel('Project name').fill('Boundary stress');
      await page.getByRole('button', { name: 'Create Project', exact: true }).click();
      await expect(page.locator('.project-message')).toContainText('Created project.');

      // Establish non-default independent preferences, then cross every boundary
      // repeatedly without waiting for the application's rAF work between crossings.
      await page.locator('#toggle-sidebar').click();
      await page.locator('#toggle-detail').click();
      await page.locator('#collapse-project-rail').click();
      const widths = [1663, 1664, 1200, 1199, 800, 1200, 1680, 1663];
      for (let round = 0; round < 10; round += 1) {
        for (const width of widths) await page.setViewportSize({ width, height: 800 });
      }
      await waitForFrames(page);
      let layout = await readLayout(page);
      expect(layout).toMatchObject({
        band: 'hybrid',
        projectPreference: 'collapsed',
        sidebarPreference: 'closed',
        detailPreference: 'closed',
        activeOverlay: null,
        projectOpen: false,
        sidebarOpen: false,
        detailOpen: false,
      });

      await page.locator('#show-project-rail').click();
      await expect(page.locator('#collapse-project-rail')).toBeFocused();
      await page.locator('#toggle-detail').click();
      await page.getByLabel('Project name').focus();
      await page.keyboard.press('Escape');
      await expect(page.locator('#show-project-rail')).toBeFocused();
      layout = await readLayout(page);
      expect(layout).toMatchObject({
        band: 'hybrid',
        activeOverlay: null,
        projectOpen: false,
        sidebarOpen: false,
        detailPreference: 'open',
        detailOpen: true,
      });

      // Stress coalescing separately from boundary changes.
      await page.setViewportSize({ width: 1680, height: 1000 });
      await page.locator('#show-project-rail').click();
      await page.evaluate(() => {
        const collapse = document.querySelector<HTMLButtonElement>('#collapse-project-rail');
        const show = document.querySelector<HTMLButtonElement>('#show-project-rail');
        if (collapse === null || show === null) throw new Error('missing rail toggles');
        for (let index = 0; index < 100; index += 1) {
          (index % 2 === 0 ? collapse : show).click();
        }
      });
      await waitForFrames(page);
      const metrics = await page.locator('.canvas-host canvas').evaluate((node) => {
        const canvas = node as HTMLCanvasElement;
        const rect = canvas.getBoundingClientRect();
        return {
          cssWidth: rect.width,
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight,
          backingWidth: canvas.width,
          backingHeight: canvas.height,
        };
      });
      layout = await readLayout(page);
      expect(layout.pendingFrames).toEqual({ resize: false, paint: false, focus: false });
      expect(metrics.backingWidth).toBe(Math.round(metrics.clientWidth * dpr));
      expect(metrics.backingHeight).toBe(Math.round(metrics.clientHeight * dpr));
      expect(pageErrors).toEqual([]);
      expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
      observations.push({ dpr, layout, metrics, pageErrors });
    } finally {
      await cleanup(page, rootName);
      await context.close();
    }
  }
  console.log('BOUNDARY_STRESS_EVIDENCE=' + JSON.stringify(observations));
});

test('collapsed compact Enable editing retains trusted permission activation', async ({ page }) => {
  const rootName = await installHarness(page);
  try {
    await boot(page);
    await page.getByLabel('Project name').fill('Activation owner');
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Created project.');
    await page.reload();
    await waitForBoot(page);
    await page.getByRole('button', { name: 'Open Project', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Enable editing', exact: true })).toBeVisible();
    await page.locator('#collapse-project-rail').click();
    await page.getByRole('button', { name: 'Enable editing', exact: true }).click();
    await expect(page.locator('.project-states')).toContainText('Project access: editable');
    const evidence = {
      calls: await harnessValue<number>(page, 'permissionCalls'),
      activations: await harnessValue<boolean[]>(page, 'permissionActivations'),
      directoryActivations: await harnessValue<boolean[]>(page, 'directoryActivations'),
    };
    console.log('PERMISSION_ACTIVATION_EVIDENCE=' + JSON.stringify(evidence));
    expect(evidence.calls).toBe(1);
    expect(evidence.activations).toEqual([true]);
  } finally {
    await cleanup(page, rootName);
  }
});

test('Preview Restore view exposes the cross-owner recovery mutation', async ({ page }) => {
  const rootName = await installHarness(page);
  try {
    await boot(page);
    await page.getByLabel('Project name').fill('Preview restore owner');
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();
    await page.locator('#export-btn').click();
    await rewriteUnderlyingCurrentWithRecovery(page, rootName);
    await page.reload();
    await waitForBoot(page);
    await page.getByRole('button', { name: 'Open Project', exact: true }).click();
    await page.getByRole('button', { name: 'Open export copy', exact: true }).click();
    await expect(page.locator('.project-states')).toContainText('Preview');
    await expect(page.locator('.project-states')).toContainText('Recovery available');

    const before = await readProjectState(page);
    await page.getByRole('button', { name: 'Restore view', exact: true }).click();
    const after = await readProjectState(page);
    const viewport = await page.evaluate(() => {
      const hook = (globalThis as unknown as Record<string, unknown>)['__visualSpecs'] as {
        viewport(): { x: number; y: number; zoom: number };
      };
      return hook.viewport();
    });
    const evidence = { before, after, viewport };
    console.log('PREVIEW_RESTORE_EVIDENCE=' + JSON.stringify(evidence));
    expect(after).toMatchObject({
      sessionKind: 'project-preview',
      previewing: true,
      pendingAutosave: false,
      dirty: true,
    });
    expect(viewport).toEqual({ x: 77, y: 88, zoom: 1.7 });
  } finally {
    await cleanup(page, rootName);
  }
});

test('physical Keep-current double click cannot activate a shifted control', async ({ page }) => {
  const rootName = await installHarness(page);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await boot(page);
    await page.getByLabel('Project name').fill('Double activation owner');
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Created project.');
    await rewriteUnderlyingCurrentWithRecovery(page, rootName);
    await page.reload();
    await waitForBoot(page);
    await page.getByRole('button', { name: 'Open Project', exact: true }).click();
    const keep = page.getByRole('button', { name: 'Keep current', exact: true });
    await expect(keep).toBeVisible();
    const box = await keep.boundingBox();
    if (box === null) throw new Error('Keep current has no box');
    const before = {
      directory: await harnessValue<number>(page, 'directoryCalls'),
      save: await harnessValue<number>(page, 'saveCalls'),
    };
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2, { delay: 0 });
    await page.waitForTimeout(500);
    const after = {
      directory: await harnessValue<number>(page, 'directoryCalls'),
      save: await harnessValue<number>(page, 'saveCalls'),
      project: await readProjectState(page),
      pageErrors,
    };
    console.log('KEEP_DOUBLE_CLICK_EVIDENCE=' + JSON.stringify({ before, after }));
    expect(after.directory).toBe(before.directory);
    expect(after.save).toBe(before.save);
    expect(after.project).toMatchObject({ pendingAutosave: false, sessionKind: 'project' });
    expect(pageErrors).toEqual([]);
  } finally {
    await cleanup(page, rootName);
  }
});

test('physical Restore double click commits once and activates no shifted action', async ({ page }) => {
  const rootName = await installHarness(page);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('dialog', (dialog) => void dialog.accept());
  try {
    await boot(page);
    await page.getByLabel('Project name').fill('Restore double owner');
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Created project.');
    await page.locator('#export-btn').click();
    await expect(page.locator('.project-message')).toContainText('Exported');
    await page.getByRole('button', { name: 'Refresh exports', exact: true }).click();
    const restore = page.getByRole('button', { name: 'Restore from export', exact: true });
    await expect(restore).toBeVisible();
    await page.locator('#zoom-in').click();
    await restore.scrollIntoViewIfNeeded();
    const box = await restore.boundingBox();
    if (box === null) throw new Error('Restore has no box');
    const before = {
      backups: await listBackups(page, rootName),
      directory: await harnessValue<number>(page, 'directoryCalls'),
      save: await harnessValue<number>(page, 'saveCalls'),
    };
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2, { delay: 0 });
    await expect(page.locator('.project-message')).toContainText('Restored');
    const after = {
      backups: await listBackups(page, rootName),
      directory: await harnessValue<number>(page, 'directoryCalls'),
      save: await harnessValue<number>(page, 'saveCalls'),
      pageErrors,
    };
    console.log('RESTORE_DOUBLE_CLICK_EVIDENCE=' + JSON.stringify({ before, after }));
    expect(after.backups.length).toBe(before.backups.length + 1);
    expect(after.directory).toBe(before.directory);
    expect(after.save).toBe(before.save);
    expect(pageErrors).toEqual([]);
  } finally {
    await cleanup(page, rootName);
  }
});

async function installHarness(page: Page): Promise<string> {
  const rootName = `resilience-final-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await page.addInitScript((injectedRoot) => {
    const globals = globalThis as unknown as Record<string, unknown>;
    const harness: GateHarness = {
      rootName: injectedRoot,
      directoryCalls: 0,
      directoryActivations: [],
      saveCalls: 0,
      saveActivations: [],
      savedNames: [],
      permissionCalls: 0,
      permissionActivations: [],
    };
    globals['__resilienceFinalHarness'] = harness;
    globals['showDirectoryPicker'] = async () => {
      harness.directoryCalls += 1;
      harness.directoryActivations.push(navigator.userActivation.isActive);
      const opfs = await navigator.storage.getDirectory();
      return opfs.getDirectoryHandle(injectedRoot, { create: true });
    };
    globals['showSaveFilePicker'] = async () => {
      harness.saveCalls += 1;
      harness.saveActivations.push(navigator.userActivation.isActive);
      const opfs = await navigator.storage.getDirectory();
      const root = await opfs.getDirectoryHandle(injectedRoot, { create: true });
      const name = `resilience-save-${harness.saveCalls}.json`;
      harness.savedNames.push(name);
      return root.getFileHandle(name, { create: true });
    };

    const prototype = FileSystemDirectoryHandle.prototype as FileSystemDirectoryHandle & {
      requestPermission?: (options?: { mode?: string }) => Promise<PermissionState>;
    };
    const original = prototype.requestPermission;
    if (typeof original === 'function') {
      prototype.requestPermission = function (options?: { mode?: string }): Promise<PermissionState> {
        harness.permissionCalls += 1;
        harness.permissionActivations.push(navigator.userActivation.isActive);
        return original.call(this, options);
      };
    }
  }, rootName);
  return rootName;
}

async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await waitForBoot(page);
}

async function waitForBoot(page: Page): Promise<void> {
  await page.waitForSelector('.canvas-host canvas');
  await page.waitForFunction(() => '__visualSpecs' in globalThis);
}

async function rewriteUnderlyingCurrentWithRecovery(page: Page, rootName: string): Promise<void> {
  await page.evaluate(async (name) => {
    const { computeDocRevision } = (await import('/src/contract/revision.ts')) as {
      computeDocRevision(text: string): string;
    };
    const opfs = await navigator.storage.getDirectory();
    const root = await opfs.getDirectoryHandle(name);
    const project = await root.getDirectoryHandle('.visual-specs');
    const data = await project.getDirectoryHandle('data');
    const currentHandle = await data.getFileHandle('current.json');
    const manifestHandle = await project.getFileHandle('project.json');
    const current = JSON.parse(await (await currentHandle.getFile()).text()) as Record<string, unknown>;
    current['resilienceUnderlyingMarker'] = 'UNDERLYING-CURRENT-B';
    const currentText = JSON.stringify(current);
    const revision = computeDocRevision(currentText);
    const manifest = JSON.parse(await (await manifestHandle.getFile()).text()) as Record<string, unknown>;
    const projectMeta = manifest['project'] as Record<string, unknown>;
    const currentMeta = manifest['current'] as Record<string, unknown>;
    currentMeta['revision'] = revision;
    currentMeta['committedAtUtc'] = '2026-07-14T06:30:00.000Z';
    projectMeta['updatedAtUtc'] = '2026-07-14T06:30:00.000Z';

    let writable = await currentHandle.createWritable();
    await writable.write(currentText);
    await writable.close();
    writable = await manifestHandle.createWritable();
    await writable.write(JSON.stringify(manifest));
    await writable.close();
    const autosave = await data.getFileHandle('autosave-view.json', { create: true });
    writable = await autosave.createWritable();
    await writable.write(JSON.stringify({
      schema: 'visual-specs.autosave-view',
      formatVersion: '1.0',
      projectId: projectMeta['id'],
      docId: currentMeta['docId'],
      baseRevision: revision,
      savedAtUtc: '2026-07-14T06:31:00.000Z',
      view: { viewport: { x: 77, y: 88, zoom: 1.7 } },
    }));
    await writable.close();
  }, rootName);
}

async function readOnlySavedCopy(page: Page, rootName: string): Promise<Record<string, unknown>> {
  return page.evaluate(async (name) => {
    const harness = (globalThis as unknown as Record<string, unknown>)['__resilienceFinalHarness'] as GateHarness;
    const fileName = harness.savedNames.at(-1);
    if (fileName === undefined) throw new Error('Save Picker did not create a file');
    const opfs = await navigator.storage.getDirectory();
    const root = await opfs.getDirectoryHandle(name);
    return JSON.parse(await (await (await root.getFileHandle(fileName)).getFile()).text()) as Record<string, unknown>;
  }, rootName);
}

async function readUnderlyingCurrent(page: Page, rootName: string): Promise<Record<string, unknown>> {
  return page.evaluate(async (name) => {
    const opfs = await navigator.storage.getDirectory();
    const root = await opfs.getDirectoryHandle(name);
    const project = await root.getDirectoryHandle('.visual-specs');
    const data = await project.getDirectoryHandle('data');
    return JSON.parse(await (await (await data.getFileHandle('current.json')).getFile()).text()) as Record<string, unknown>;
  }, rootName);
}

async function listBackups(page: Page, rootName: string): Promise<string[]> {
  return page.evaluate(async (name) => {
    const opfs = await navigator.storage.getDirectory();
    const root = await opfs.getDirectoryHandle(name);
    const project = await root.getDirectoryHandle('.visual-specs');
    let backups: FileSystemDirectoryHandle;
    try {
      backups = await project.getDirectoryHandle('backups');
    } catch {
      return [];
    }
    const names: string[] = [];
    for await (const handle of backups.values()) {
      if (handle.kind === 'file' && handle.name.endsWith('.json')) names.push(handle.name);
    }
    return names.sort();
  }, rootName);
}

async function readProjectExports(
  page: Page,
  rootName: string,
): Promise<Record<string, Record<string, unknown>>> {
  return page.evaluate(async (name) => {
    const opfs = await navigator.storage.getDirectory();
    const root = await opfs.getDirectoryHandle(name);
    const project = await root.getDirectoryHandle('.visual-specs');
    const exportsDirectory = await project.getDirectoryHandle('exports');
    const out: Record<string, Record<string, unknown>> = {};
    for await (const handle of exportsDirectory.values()) {
      if (handle.kind !== 'file' || !handle.name.endsWith('.json')) continue;
      out[handle.name] = JSON.parse(await (await handle.getFile()).text()) as Record<string, unknown>;
    }
    return out;
  }, rootName);
}

async function harnessValue<T>(page: Page, key: keyof GateHarness): Promise<T> {
  return page.evaluate((name) => {
    const harness = (globalThis as unknown as Record<string, unknown>)['__resilienceFinalHarness'] as Record<string, unknown>;
    return harness[name] as T;
  }, key);
}

async function readProjectState(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const hook = (globalThis as unknown as Record<string, unknown>)['__visualSpecs'] as {
      project(): Record<string, unknown>;
    };
    return hook.project();
  });
}

async function readLayout(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const hook = (globalThis as unknown as Record<string, unknown>)['__visualSpecs'] as {
      layout(): Record<string, unknown>;
    };
    return hook.layout();
  });
}

async function waitForFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }));
}

async function cleanup(page: Page, rootName: string): Promise<void> {
  if (page.isClosed()) return;
  await page.evaluate(async (name) => {
    const opfs = await navigator.storage.getDirectory();
    try {
      await opfs.removeEntry(name, { recursive: true });
    } catch {
      // The test can fail before the first picker creates its root.
    }
  }, rootName);
}

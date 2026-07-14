import {
  expect,
  test,
  type Page,
} from '../../../../../node_modules/@playwright/test/index.mjs';

interface ReGateHarness {
  rootName: string;
  directoryCalls: number;
  directoryActivations: boolean[];
  saveCalls: number;
  saveActivations: boolean[];
  savedNames: string[];
  permissionCalls: number;
  permissionActivations: boolean[];
  writableOpens: string[];
}

type JsonObject = Record<string, unknown>;

for (const access of ['editable', 'readonly'] as const) {
  test(`${access} Preview guard survives stale DOM invocation and returns recovery to owner B`, async ({ page }) => {
    const rootName = await installHarness(page);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    try {
      const targetViewport = access === 'editable'
        ? { width: 1663, height: 900 }
        : { width: 800, height: 800 };
      const targetBand = access === 'editable' ? 'hybrid' : 'narrow';
      await page.setViewportSize(targetViewport);
      await createPreviewOwnerA(page, `Independent ${access} owner`);
      await rewriteUnderlyingOwnerB(page, rootName);
      await page.reload();
      await waitForBoot(page);
      await page.getByRole('button', { name: 'Open Project', exact: true }).click();
      if (access === 'editable') {
        await page.getByRole('button', { name: 'Enable editing', exact: true }).click();
        await expect(page.locator('.project-states')).toContainText('Project access: editable');
      }

      // Exercise the ordinary trusted user path. The initiating control owns focus
      // before lifecycleBusy disables it and Preview hides adjacent recovery actions.
      const restore = page.getByRole('button', { name: 'Restore view', exact: true });
      await expect(restore).toBeVisible();
      const openExport = page.getByRole('button', { name: 'Open export copy', exact: true });
      await openExport.evaluate((button) => {
        button.addEventListener('click', (event) => {
          (globalThis as unknown as JsonObject)['__physicalOpenExportTrusted'] = event.isTrusted;
        }, { once: true });
      });
      await openExport.click();
      await expect(page.locator('.project-states')).toContainText('Preview');
      await expect(page.locator('.project-states')).toContainText('Recovery available');
      await expect.poll(() => rawDocument(page)).toMatchObject({
        resiliencePreviewMarker: 'PREVIEW-A',
      });
      expect(await readUnderlyingCurrent(page, rootName)).toMatchObject({
        resilienceUnderlyingMarker: 'UNDERLYING-B',
      });
      const focusAfterPreview = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        return {
          tag: active?.tagName ?? null,
          id: active?.id ?? null,
          text: active?.textContent?.trim() ?? null,
          body: active === document.body,
          inHiddenRecovery: active !== null && document.querySelector('.autosave-actions')?.contains(active) === true,
          trustedOpenExport: (globalThis as unknown as JsonObject)['__physicalOpenExportTrusted'] ?? false,
        };
      });
      console.log('HIDDEN_TRANSITION_FOCUS=' + JSON.stringify({ access, focusAfterPreview }));
      expect(focusAfterPreview.trustedOpenExport).toBe(true);
      expect(focusAfterPreview.body).toBe(false);
      expect(focusAfterPreview.inHiddenRecovery).toBe(false);

      const recoveryButtons = page.locator('.autosave-actions button');
      await expect(recoveryButtons).toHaveCount(3);
      for (const name of ['Restore view', 'Keep current', 'Export autosave copy']) {
        await expect(page.getByRole('button', { name, exact: true })).toBeHidden();
      }
      expect(
        await recoveryButtons.evaluateAll((buttons) =>
          buttons.map((button) => {
            (button as HTMLButtonElement).focus();
            return document.activeElement === button;
          }),
        ),
      ).toEqual([false, false, false]);

      // Cross every layout boundary while the subtree is hidden. Facts and focus
      // must remain reachable and no stale frame may expose the commands.
      for (const width of [1199, 1200, 1663, 1664, 800, 1680, 1199, 1663, targetViewport.width]) {
        await page.setViewportSize({ width, height: 800 });
      }
      await waitForFrames(page);
      await expect(page.locator('.project-states')).toContainText('Preview');
      await expect(page.locator('.project-states')).toContainText('Recovery available');
      expect(await recoveryButtons.evaluateAll((buttons) => buttons.every((button) => !button.checkVisibility()))).toBe(true);

      await page.getByRole('button', { name: 'Collapse project rail', exact: true }).click();
      const compactRecovery = page.getByRole('button', { name: 'Recovery available', exact: true });
      await expect(compactRecovery).toBeVisible();
      await expect(page.locator('.project-compact-states')).toContainText('Preview');
      const focusRoundTrip = {
        project: await readProjectState(page),
        raw: await rawDocument(page),
        viewport: await viewport(page),
      };
      await compactRecovery.click();
      await expect(page.locator('#project-rail')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Collapse project rail', exact: true })).toBeFocused();
      await expect.poll(() => readLayout(page)).toMatchObject({
        band: targetBand,
        activeOverlay: 'project',
        projectOpen: true,
      });
      await page.keyboard.press('Escape');
      await expect(page.locator('#project-rail')).toBeHidden();
      await expect(compactRecovery).toBeVisible();
      await expect(compactRecovery).toBeFocused();
      await expect(page.locator('#show-project-rail')).not.toBeFocused();
      await expect.poll(() => readLayout(page)).toMatchObject({
        band: targetBand,
        activeOverlay: null,
        projectOpen: false,
      });
      expect(await readProjectState(page)).toEqual(focusRoundTrip.project);
      expect(await rawDocument(page)).toEqual(focusRoundTrip.raw);
      expect(await viewport(page)).toEqual(focusRoundTrip.viewport);
      await compactRecovery.click();
      await expect(page.locator('#project-rail')).toBeVisible();

      const guarded = {
        project: await readProjectState(page),
        raw: await rawDocument(page),
        viewport: await viewport(page),
        disk: await readDisk(page, rootName),
        saveCalls: await harnessValue<number>(page, 'saveCalls'),
        writableOpens: await harnessValue<string[]>(page, 'writableOpens'),
      };

      // Invoke captured hidden controls repeatedly. This bypasses presentation but
      // not the controller boundary and also exercises runProjectAction epoch races.
      await recoveryButtons.evaluateAll((buttons) => {
        for (let round = 0; round < 4; round += 1) {
          for (const button of buttons) (button as HTMLButtonElement).click();
        }
      });
      await expect(page.locator('.action-error')).toContainText('Return to the project');
      await expect(page.locator('.project-states')).toContainText('Preview');
      await expect(page.locator('.project-states')).toContainText('Recovery available');
      expect(await readProjectState(page)).toEqual(guarded.project);
      expect(await rawDocument(page)).toEqual(guarded.raw);
      expect(await viewport(page)).toEqual(guarded.viewport);
      expect(await readDisk(page, rootName)).toEqual(guarded.disk);
      expect(await harnessValue<number>(page, 'saveCalls')).toBe(guarded.saveCalls);
      expect(await harnessValue<string[]>(page, 'writableOpens')).toEqual(guarded.writableOpens);

      // A rejected stale export immediately followed by Return must not surface its
      // late error or execute after the owner transition.
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')];
        const recovery = buttons.find((button) => button.textContent?.trim() === 'Export autosave copy');
        const returnButton = buttons.find((button) => button.textContent?.trim() === 'Return to project');
        if (recovery === undefined || returnButton === undefined) throw new Error('missing stale-action controls');
        recovery.click();
        returnButton.click();
      });
      await expect.poll(async () => (await readProjectState(page)).sessionKind).toBe('project');
      await expect(page.locator('.action-error')).toBeHidden();
      const returned = await readProjectState(page);
      expect(returned).toMatchObject({ previewing: false, pendingAutosave: true });
      expect(await rawDocument(page)).toMatchObject({
        resilienceUnderlyingMarker: 'UNDERLYING-B',
      });

      const returnViewport = await viewport(page);
      const diskBeforeExport = await readDisk(page, rootName);
      const savesBefore = await harnessValue<number>(page, 'saveCalls');
      const writableBeforeResolution = await harnessValue<string[]>(page, 'writableOpens');
      const exportRecovery = page.getByRole('button', { name: 'Export autosave copy', exact: true });
      await exportRecovery.evaluate((button) => {
        button.addEventListener('click', (event) => {
          (globalThis as unknown as JsonObject)['__independentRecoveryTrusted'] = event.isTrusted;
        }, { once: true });
      });
      await exportRecovery.click();
      await expect(page.locator('.project-message')).toContainText('Exported autosave copy');
      expect(await page.evaluate(() => (globalThis as unknown as JsonObject)['__independentRecoveryTrusted'])).toBe(true);

      const diskAfterExport = await readDisk(page, rootName);
      let recovery: JsonObject;
      if (access === 'editable') {
        const added = Object.keys(diskAfterExport.exports).filter((name) => !(name in diskBeforeExport.exports));
        expect(added).toHaveLength(1);
        expect(await harnessValue<number>(page, 'saveCalls')).toBe(savesBefore);
        recovery = JSON.parse(diskAfterExport.exports[added[0] ?? ''] ?? '{}') as JsonObject;
      } else {
        expect(diskAfterExport.exports).toEqual(diskBeforeExport.exports);
        expect(await harnessValue<number>(page, 'saveCalls')).toBe(savesBefore + 1);
        expect((await harnessValue<boolean[]>(page, 'saveActivations')).slice(-1)).toEqual([true]);
        recovery = await readLatestPickedSave(page, rootName);
      }
      expect(recovery).toMatchObject({
        resilienceUnderlyingMarker: 'UNDERLYING-B',
        view: { viewport: { x: 77, y: 88, zoom: 1.7 } },
      });
      expect(recovery['resiliencePreviewMarker']).toBeUndefined();
      expect(await readProjectState(page)).toMatchObject({ pendingAutosave: true });

      const autosavesBeforeResolution = writableBeforeResolution.filter((name) => name === 'autosave-view.json').length;
      if (access === 'editable') {
        await page.getByRole('button', { name: 'Restore view', exact: true }).click();
        expect(await viewport(page)).toEqual({ x: 77, y: 88, zoom: 1.7 });
        expect(await readProjectState(page)).toMatchObject({
          previewing: false,
          pendingAutosave: false,
          dirty: true,
        });
        await expect.poll(async () =>
          (await harnessValue<string[]>(page, 'writableOpens')).filter((name) => name === 'autosave-view.json').length,
        ).toBe(autosavesBeforeResolution + 1);
      } else {
        await page.getByRole('button', { name: 'Keep current', exact: true }).click();
        expect(await viewport(page)).toEqual(returnViewport);
        expect(await readProjectState(page)).toMatchObject({
          previewing: false,
          pendingAutosave: false,
          dirty: false,
        });
        await page.waitForTimeout(450);
        expect(
          (await harnessValue<string[]>(page, 'writableOpens')).filter((name) => name === 'autosave-view.json').length,
        ).toBe(autosavesBeforeResolution);
      }
      expect(await rawDocument(page)).toMatchObject({ resilienceUnderlyingMarker: 'UNDERLYING-B' });
      expect(pageErrors).toEqual([]);

      console.log('OWNER_REGATE_EVIDENCE=' + JSON.stringify({
        access,
        guardError: 'Return to the project',
        recoveryMarker: recovery['resilienceUnderlyingMarker'],
        previewMarker: recovery['resiliencePreviewMarker'] ?? null,
        destination: access === 'editable' ? 'project-export' : 'save-picker',
        trusted: true,
        pageErrors,
      }));
    } finally {
      await cleanup(page, rootName);
    }
  });
}

test('dirty underlying autosave is cancelled in Preview and rearmed exactly once after Return', async ({ page }) => {
  const rootName = await installHarness(page);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await createPreviewOwnerA(page, 'Autosave lifetime owner');
    await rewriteUnderlyingOwnerB(page, rootName);
    await page.reload();
    await waitForBoot(page);
    await page.getByRole('button', { name: 'Open Project', exact: true }).click();
    await page.getByRole('button', { name: 'Enable editing', exact: true }).click();

    await page.locator('#zoom-in').click();
    const dirtyViewport = await viewport(page);
    expect(await readProjectState(page)).toMatchObject({ dirty: true, pendingAutosave: true });
    const autosavesBefore = (await harnessValue<string[]>(page, 'writableOpens')).filter(
      (name) => name === 'autosave-view.json',
    ).length;
    await page.getByRole('button', { name: 'Open export copy', exact: true }).click();
    await expect(page.locator('.project-states')).toContainText('Preview');
    await page.waitForTimeout(550);
    expect(
      (await harnessValue<string[]>(page, 'writableOpens')).filter((name) => name === 'autosave-view.json').length,
    ).toBe(autosavesBefore);

    await page.locator('.autosave-actions button').evaluateAll((buttons) => {
      for (const button of buttons) (button as HTMLButtonElement).click();
    });
    await page.waitForTimeout(450);
    expect(
      (await harnessValue<string[]>(page, 'writableOpens')).filter((name) => name === 'autosave-view.json').length,
    ).toBe(autosavesBefore);

    await page.getByRole('button', { name: 'Return to project', exact: true }).click();
    expect(await readProjectState(page)).toMatchObject({ dirty: true, pendingAutosave: true });
    expect(await viewport(page)).toEqual(dirtyViewport);
    await expect.poll(async () =>
      (await harnessValue<string[]>(page, 'writableOpens')).filter((name) => name === 'autosave-view.json').length,
    ).toBe(autosavesBefore + 1);
    const autosave = await readAutosave(page, rootName);
    expect(autosave).toMatchObject({ view: { viewport: dirtyViewport } });
    expect(await rawDocument(page)).toMatchObject({ resilienceUnderlyingMarker: 'UNDERLYING-B' });
    expect(pageErrors).toEqual([]);
    console.log('AUTOSAVE_REGATE_EVIDENCE=' + JSON.stringify({
      writesDuringPreview: 0,
      writesAfterReturn: 1,
      dirtyViewport,
      savedViewport: (autosave['view'] as JsonObject)['viewport'],
      pageErrors,
    }));
  } finally {
    await cleanup(page, rootName);
  }
});

async function installHarness(page: Page): Promise<string> {
  const rootName = `resilience-regate-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await page.addInitScript((injectedRoot) => {
    const globals = globalThis as unknown as JsonObject;
    const harness: ReGateHarness = {
      rootName: injectedRoot,
      directoryCalls: 0,
      directoryActivations: [],
      saveCalls: 0,
      saveActivations: [],
      savedNames: [],
      permissionCalls: 0,
      permissionActivations: [],
      writableOpens: [],
    };
    globals['__resilienceRegateHarness'] = harness;
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
      const name = `regate-save-${harness.saveCalls}.json`;
      harness.savedNames.push(name);
      return root.getFileHandle(name, { create: true });
    };

    const directoryPrototype = FileSystemDirectoryHandle.prototype as FileSystemDirectoryHandle & {
      requestPermission?: (options?: { mode?: string }) => Promise<PermissionState>;
    };
    const requestPermission = directoryPrototype.requestPermission;
    if (typeof requestPermission === 'function') {
      directoryPrototype.requestPermission = function (options?: { mode?: string }): Promise<PermissionState> {
        harness.permissionCalls += 1;
        harness.permissionActivations.push(navigator.userActivation.isActive);
        return requestPermission.call(this, options);
      };
    }

    const filePrototype = FileSystemFileHandle.prototype;
    const createWritable = filePrototype.createWritable;
    filePrototype.createWritable = function (options?: FileSystemCreateWritableOptions) {
      harness.writableOpens.push(this.name);
      return createWritable.call(this, options);
    };
  }, rootName);
  return rootName;
}

async function createPreviewOwnerA(page: Page, projectName: string): Promise<void> {
  await page.goto('/');
  await waitForBoot(page);
  const preview = await rawDocument(page);
  preview['resiliencePreviewMarker'] = 'PREVIEW-A';
  delete preview['resilienceUnderlyingMarker'];
  await page.locator('#import-input').setInputFiles({
    name: 'preview-a.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(preview), 'utf8'),
  });
  await expect(page.locator('.project-message')).toContainText('Opened preview-a.json temporarily');
  await page.getByLabel('Project name').fill(projectName);
  await page.getByRole('button', { name: 'Create Project', exact: true }).click();
  await expect(page.locator('.project-message')).toContainText('Created project.');
  await page.locator('#export-btn').click();
  await expect(page.locator('.project-message')).toContainText('Exported');
}

async function rewriteUnderlyingOwnerB(page: Page, rootName: string): Promise<void> {
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
    const current = JSON.parse(await (await currentHandle.getFile()).text()) as JsonObject;
    delete current['resiliencePreviewMarker'];
    current['resilienceUnderlyingMarker'] = 'UNDERLYING-B';
    const currentText = JSON.stringify(current);
    const revision = computeDocRevision(currentText);
    const manifest = JSON.parse(await (await manifestHandle.getFile()).text()) as JsonObject;
    const projectMeta = manifest['project'] as JsonObject;
    const currentMeta = manifest['current'] as JsonObject;
    currentMeta['revision'] = revision;
    currentMeta['committedAtUtc'] = '2026-07-14T07:10:00.000Z';
    projectMeta['updatedAtUtc'] = '2026-07-14T07:10:00.000Z';
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
      savedAtUtc: '2026-07-14T07:11:00.000Z',
      view: { viewport: { x: 77, y: 88, zoom: 1.7 } },
    }));
    await writable.close();
  }, rootName);
}

async function waitForBoot(page: Page): Promise<void> {
  await page.waitForSelector('.canvas-host canvas');
  await page.waitForFunction(() => '__visualSpecs' in globalThis);
}

async function rawDocument(page: Page): Promise<JsonObject> {
  return page.evaluate(() => {
    const hook = (globalThis as unknown as JsonObject)['__visualSpecs'] as { raw(): JsonObject };
    return hook.raw();
  });
}

async function viewport(page: Page): Promise<{ x: number; y: number; zoom: number }> {
  return page.evaluate(() => {
    const hook = (globalThis as unknown as JsonObject)['__visualSpecs'] as {
      viewport(): { x: number; y: number; zoom: number };
    };
    return hook.viewport();
  });
}

async function readProjectState(page: Page): Promise<JsonObject> {
  return page.evaluate(() => {
    const hook = (globalThis as unknown as JsonObject)['__visualSpecs'] as { project(): JsonObject };
    return hook.project();
  });
}

async function readLayout(page: Page): Promise<JsonObject> {
  return page.evaluate(() => {
    const hook = (globalThis as unknown as JsonObject)['__visualSpecs'] as { layout(): JsonObject };
    return hook.layout();
  });
}

async function readUnderlyingCurrent(page: Page, rootName: string): Promise<JsonObject> {
  return page.evaluate(async (name) => {
    const opfs = await navigator.storage.getDirectory();
    const root = await opfs.getDirectoryHandle(name);
    const project = await root.getDirectoryHandle('.visual-specs');
    const data = await project.getDirectoryHandle('data');
    return JSON.parse(await (await (await data.getFileHandle('current.json')).getFile()).text()) as JsonObject;
  }, rootName);
}

async function readAutosave(page: Page, rootName: string): Promise<JsonObject> {
  return page.evaluate(async (name) => {
    const opfs = await navigator.storage.getDirectory();
    const root = await opfs.getDirectoryHandle(name);
    const project = await root.getDirectoryHandle('.visual-specs');
    const data = await project.getDirectoryHandle('data');
    return JSON.parse(await (await (await data.getFileHandle('autosave-view.json')).getFile()).text()) as JsonObject;
  }, rootName);
}

async function readDisk(page: Page, rootName: string): Promise<{
  manifestText: string;
  currentText: string;
  autosaveText: string;
  exports: Record<string, string>;
  backups: string[];
}> {
  return page.evaluate(async (name) => {
    const opfs = await navigator.storage.getDirectory();
    const root = await opfs.getDirectoryHandle(name);
    const project = await root.getDirectoryHandle('.visual-specs');
    const data = await project.getDirectoryHandle('data');
    const manifestText = await (await (await project.getFileHandle('project.json')).getFile()).text();
    const currentText = await (await (await data.getFileHandle('current.json')).getFile()).text();
    let autosaveText = '';
    try {
      autosaveText = await (await (await data.getFileHandle('autosave-view.json')).getFile()).text();
    } catch {
      // Absence is represented by an empty fingerprint.
    }
    const exportDirectory = await project.getDirectoryHandle('exports');
    const exports: Record<string, string> = {};
    const exportNames: string[] = [];
    for await (const handle of exportDirectory.values()) {
      if (handle.kind === 'file' && handle.name.endsWith('.json')) exportNames.push(handle.name);
    }
    for (const fileName of exportNames.sort()) {
      exports[fileName] = await (await (await exportDirectory.getFileHandle(fileName)).getFile()).text();
    }
    const backups: string[] = [];
    try {
      const backupDirectory = await project.getDirectoryHandle('backups');
      for await (const handle of backupDirectory.values()) {
        if (handle.kind === 'file') backups.push(handle.name);
      }
    } catch {
      // A project with no committed replacement has no backup directory.
    }
    return { manifestText, currentText, autosaveText, exports, backups: backups.sort() };
  }, rootName);
}

async function readLatestPickedSave(page: Page, rootName: string): Promise<JsonObject> {
  const name = (await harnessValue<string[]>(page, 'savedNames')).at(-1);
  if (name === undefined) throw new Error('Save Picker did not create a recovery file');
  return page.evaluate(async ({ rootName: root, fileName }) => {
    const opfs = await navigator.storage.getDirectory();
    const directory = await opfs.getDirectoryHandle(root);
    return JSON.parse(await (await (await directory.getFileHandle(fileName)).getFile()).text()) as JsonObject;
  }, { rootName, fileName: name });
}

async function harnessValue<T>(page: Page, key: keyof ReGateHarness): Promise<T> {
  return page.evaluate((name) => {
    const harness = (globalThis as unknown as JsonObject)['__resilienceRegateHarness'] as unknown as Record<string, unknown>;
    return harness[name] as T;
  }, key);
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

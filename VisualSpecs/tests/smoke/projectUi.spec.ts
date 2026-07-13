import { expect, test, type Page } from '@playwright/test';
import { sampleDoc } from '../support/doc.ts';

interface HarnessOptions {
  directory?: boolean;
  save?: boolean;
  open?: boolean;
}

interface ProjectDiskState {
  manifest: Record<string, unknown>;
  currentText: string;
  imports: string[];
  exports: string[];
  backups: string[];
}

test('project UI covers Create/Open/Enable editing/name/Rename/Add/Import/Export/Restore/cancel/conflict', async ({ page }) => {
  const rootName = await installHarness(page);
  try {
    await boot(page);
    const name = page.getByLabel('Project name');
    await expect(name).toHaveValue('');
    await expect(name).toHaveAttribute('placeholder', 'Visual Specs');

    await name.fill('My Real Project');
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await page.getByRole('button', { name: 'Expand all', exact: true }).click();
    await expect(name).toHaveValue('My Real Project');
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Created project.');
    expect(await harnessValue<number>(page, 'directoryCalls')).toBe(1);
    expect(await harnessValue<boolean[]>(page, 'directoryActivations')).toEqual([true]);

    let disk = await readDisk(page, rootName);
    expect((disk.manifest['project'] as Record<string, unknown>)['name']).toBe('My Real Project');

    await page.locator('#export-btn').click();
    await expect.poll(async () => (await readDisk(page, rootName)).exports.length).toBe(1);
    disk = await readDisk(page, rootName);
    expect(disk.exports).toHaveLength(1);
    expect(disk.exports[0]).toMatch(/^\d{8}-\d{6}_My-Real-Project\.json$/);

    await name.fill('Renamed Project');
    await page.locator('#zoom-in').click();
    await expect(name).toHaveValue('Renamed Project');
    await page.getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Project renamed to Renamed Project.');
    disk = await readDisk(page, rootName);
    expect((disk.manifest['project'] as Record<string, unknown>)['name']).toBe('Renamed Project');
    await page.locator('#export-btn').click();
    await expect
      .poll(async () =>
        (await readDisk(page, rootName)).exports.some((fileName) =>
          /^\d{8}-\d{6}_Renamed-Project\.json$/.test(fileName),
        ),
      )
      .toBe(true);
    disk = await readDisk(page, rootName);
    expect(disk.exports.some((fileName) => /^\d{8}-\d{6}_Renamed-Project\.json$/.test(fileName))).toBe(true);

    await setHarness(page, { externalName: 'incoming.json', externalText: changedDoc() });
    await page.getByRole('button', { name: 'Add JSON', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Added');
    await page.getByRole('button', { name: 'Refresh imports', exact: true }).click();
    await expect(page.getByLabel('Project imports').locator('option')).toHaveCount(1);
    await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Imported');
    disk = await readDisk(page, rootName);
    expect(disk.backups).toHaveLength(1);
    expect(JSON.parse(disk.currentText)).toMatchObject({ uiImported: true });

    await page.getByRole('button', { name: 'Refresh exports', exact: true }).click();
    await expect(page.getByLabel('Project export copies').locator('option')).toHaveCount(2);
    await page.getByRole('button', { name: 'Open export copy', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Previewing export copy');
    await expect(page.getByRole('button', { name: 'Return to project', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Return to project', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Returned to the open project');

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Restore from export', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Restored');
    disk = await readDisk(page, rootName);
    expect(disk.backups).toHaveLength(2);

    await page.reload();
    await waitForBoot(page);
    await expect(name).toHaveValue('');
    await page.getByRole('button', { name: 'Open Project', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Opened project read-only.');
    await expect(name).toHaveValue('Renamed Project');
    await page.locator('#zoom-in').click();
    const beforeEnable = await viewport(page);
    await page.getByRole('button', { name: 'Enable editing', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('in-memory view was preserved');
    expect(await viewport(page)).toEqual(beforeEnable);

    const backupsBeforeConflict = (await readDisk(page, rootName)).backups.length;
    const externalText = await rewriteCurrent(page, rootName, { externalChange: true });
    await page.locator('#zoom-in').click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.banner.error')).toContainText('conflict');
    disk = await readDisk(page, rootName);
    expect(disk.currentText).toBe(externalText);
    expect(disk.backups).toHaveLength(backupsBeforeConflict);

    const callsBeforeDecline = await harnessValue<number>(page, 'directoryCalls');
    page.once('dialog', (dialog) => void dialog.dismiss());
    await page.getByRole('button', { name: 'Open Project', exact: true }).click();
    await expect.poll(() => harnessValue<number>(page, 'directoryCalls')).toBe(callsBeforeDecline);
    await expect(name).toHaveValue('Renamed Project');

    let temporaryConfirm = '';
    page.once('dialog', (dialog) => {
      temporaryConfirm = dialog.message();
      void dialog.dismiss();
    });
    await page.getByRole('button', { name: 'Open JSON temporarily', exact: true }).click();
    expect(temporaryConfirm).toMatch(/unsaved layout or view changes/i);
    await expect(name).toHaveValue('Renamed Project');

    await setHarness(page, { cancelNextDirectory: true });
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Open Project', exact: true }).click();
    await expect(page.locator('.status')).toContainText('Cancelled. No project or document state changed.');
    await expect(name).toHaveValue('Renamed Project');
    expect(await harnessValue<number>(page, 'directoryCalls')).toBe(callsBeforeDecline + 1);
  } finally {
    await cleanup(page, rootName);
  }
});

test('autosave recovery uses Save Picker for editable readonly projects and hides every export for requires[] readonly docs', async ({ page }) => {
  const rootName = await installHarness(page);
  try {
    await boot(page);
    await page.getByLabel('Project name').fill('Autosave Project');
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Created project.');
    await writeMatchingAutosave(page, rootName);

    await page.reload();
    await waitForBoot(page);
    await page.getByRole('button', { name: 'Open Project', exact: true }).click();
    const autosaveExport = page.getByRole('button', { name: 'Export autosave copy', exact: true });
    await expect(autosaveExport).toBeVisible();
    await expect(autosaveExport).toBeEnabled();
    await autosaveExport.click();
    await expect(page.locator('.project-message')).toContainText('save-picker');
    const savesAfterEditable = await harnessValue<number>(page, 'saveCalls');
    expect(savesAfterEditable).toBe(1);

    await rewriteCurrent(page, rootName, { requires: ['future-layout'] }, true);
    await page.reload();
    await waitForBoot(page);
    await page.getByRole('button', { name: 'Open Project', exact: true }).click();
    await expect(page.locator('.banner.warn').filter({ hasText: 'Read-only' })).toBeVisible();
    await expect(autosaveExport).toBeHidden();
    await expect(page.locator('#export-btn')).toBeDisabled();
    const savesBeforeReadonlyShortcut = await harnessValue<number>(page, 'saveCalls');
    await page.keyboard.press('S');
    await page.waitForTimeout(150);
    expect(await harnessValue<number>(page, 'saveCalls')).toBe(savesBeforeReadonlyShortcut);
    await expect(page.locator('.banner.error')).toHaveCount(0);

    const addJson = page.getByRole('button', { name: 'Add JSON', exact: true });
    await expect(addJson).toBeDisabled();
    await page.getByRole('button', { name: 'Enable editing', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Editing enabled');
    await expect(page.locator('.banner.warn').filter({ hasText: 'Read-only' })).toBeVisible();
    await expect(addJson).toBeEnabled();
    expect((await readDisk(page, rootName)).imports).toEqual([]);

    await setHarness(page, { externalName: 'recovery.json', externalText: changedDoc() });
    await addJson.click();
    await expect(page.locator('.project-message')).toContainText('Added');
    await expect(page.getByLabel('Project imports').locator('option')).toHaveCount(1);
    await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Imported');
    await expect(page.locator('.banner.warn').filter({ hasText: 'Read-only' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await expect(page.locator('#export-btn')).toBeEnabled();
    const recovered = await readDisk(page, rootName);
    expect(recovered.backups).toHaveLength(1);
    expect(JSON.parse(recovered.currentText)).toMatchObject({ uiImported: true });

    await removeProjectArea(page, rootName, 'imports');
    await page.getByRole('button', { name: 'Refresh imports', exact: true }).click();
    await expect(page.getByLabel('Project imports').locator('option')).toHaveText('No imports');
    await expect(page.locator('.banner.error')).toHaveCount(0);
  } finally {
    await cleanup(page, rootName);
  }
});

test('unsupported project persistence advertises and uses the true download fallback', async ({ page }) => {
  const rootName = await installHarness(page, { directory: false, save: false, open: false });
  try {
    await boot(page);
    await expect(page.getByRole('button', { name: 'Create Project', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Open Project', exact: true })).toBeDisabled();
    await expect(page.locator('.project-message')).toContainText('download only');
    const downloading = page.waitForEvent('download');
    await page.locator('#export-btn').click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^\d{8}-\d{6}_visual-specs\.json$/);
  } finally {
    await cleanup(page, rootName);
  }
});

async function installHarness(page: Page, options: HarnessOptions = {}): Promise<string> {
  const rootName = `visual-specs-ui-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await page.addInitScript(
    ({ rootName: injectedRoot, directory, save, open }) => {
      const globals = globalThis as unknown as Record<string, unknown>;
      const harness = {
        rootName: injectedRoot,
        directoryCalls: 0,
        directoryActivations: [] as boolean[],
        saveCalls: 0,
        openCalls: 0,
        cancelNextDirectory: false,
        externalName: 'incoming.json',
        externalText: '{"formatVersion":"1.0","nodes":[],"edges":[]}',
      };
      globals['__projectUiHarness'] = harness;

      if (directory) {
        globals['showDirectoryPicker'] = async () => {
          harness.directoryCalls += 1;
          harness.directoryActivations.push(navigator.userActivation.isActive);
          if (harness.cancelNextDirectory) {
            harness.cancelNextDirectory = false;
            throw new DOMException('cancelled', 'AbortError');
          }
          const opfs = await navigator.storage.getDirectory();
          return opfs.getDirectoryHandle(injectedRoot, { create: true });
        };
      } else {
        delete globals['showDirectoryPicker'];
      }

      if (open) {
        globals['showOpenFilePicker'] = async () => {
          harness.openCalls += 1;
          const opfs = await navigator.storage.getDirectory();
          const root = await opfs.getDirectoryHandle(injectedRoot, { create: true });
          const handle = await root.getFileHandle(harness.externalName, { create: true });
          const writable = await handle.createWritable();
          await writable.write(harness.externalText);
          await writable.close();
          return [handle];
        };
      } else {
        delete globals['showOpenFilePicker'];
      }

      if (save) {
        globals['showSaveFilePicker'] = async (picker: { suggestedName?: string }) => {
          harness.saveCalls += 1;
          const opfs = await navigator.storage.getDirectory();
          const root = await opfs.getDirectoryHandle(injectedRoot, { create: true });
          return root.getFileHandle(`save-${harness.saveCalls}-${picker.suggestedName ?? 'export.json'}`, {
            create: true,
          });
        };
      } else {
        delete globals['showSaveFilePicker'];
      }
    },
    {
      rootName,
      directory: options.directory !== false,
      save: options.save !== false,
      open: options.open !== false,
    },
  );
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

async function setHarness(page: Page, values: Record<string, unknown>): Promise<void> {
  await page.evaluate((next) => {
    const harness = (globalThis as unknown as Record<string, unknown>)['__projectUiHarness'] as Record<
      string,
      unknown
    >;
    Object.assign(harness, next);
  }, values);
}

async function harnessValue<T>(page: Page, key: string): Promise<T> {
  return page.evaluate((name) => {
    const harness = (globalThis as unknown as Record<string, unknown>)['__projectUiHarness'] as Record<
      string,
      unknown
    >;
    return harness[name] as T;
  }, key);
}

async function viewport(page: Page): Promise<{ x: number; y: number; zoom: number }> {
  return page.evaluate(() => {
    const hooks = (globalThis as unknown as Record<string, unknown>)['__visualSpecs'] as {
      viewport(): { x: number; y: number; zoom: number };
    };
    return hooks.viewport();
  });
}

async function readDisk(page: Page, rootName: string): Promise<ProjectDiskState> {
  return page.evaluate(async (name) => {
    const opfs = await navigator.storage.getDirectory();
    const root = await opfs.getDirectoryHandle(name);
    const project = await root.getDirectoryHandle('.visual-specs');
    const data = await project.getDirectoryHandle('data');
    const manifest = JSON.parse(await (await (await project.getFileHandle('project.json')).getFile()).text()) as Record<
      string,
      unknown
    >;
    const currentText = await (await (await data.getFileHandle('current.json')).getFile()).text();
    const names = async (area: string): Promise<string[]> => {
      let dir: FileSystemDirectoryHandle;
      try {
        dir = await project.getDirectoryHandle(area);
      } catch {
        return [];
      }
      const out: string[] = [];
      for await (const handle of dir.values()) if (handle.kind === 'file' && handle.name.endsWith('.json')) out.push(handle.name);
      return out.sort();
    };
    return {
      manifest,
      currentText,
      imports: await names('imports'),
      exports: await names('exports'),
      backups: await names('backups'),
    };
  }, rootName);
}

async function rewriteCurrent(
  page: Page,
  rootName: string,
  additions: Record<string, unknown>,
  autosave = false,
): Promise<string> {
  return page.evaluate(
    async ({ name, additions: fields, autosave: writeAutosave }) => {
      const revisionUrl = '/src/contract/revision.ts';
      const { computeDocRevision } = (await import(revisionUrl)) as typeof import('../../src/contract/revision.ts');
      const opfs = await navigator.storage.getDirectory();
      const root = await opfs.getDirectoryHandle(name);
      const project = await root.getDirectoryHandle('.visual-specs');
      const data = await project.getDirectoryHandle('data');
      const currentHandle = await data.getFileHandle('current.json');
      const manifestHandle = await project.getFileHandle('project.json');
      const current = JSON.parse(await (await currentHandle.getFile()).text()) as Record<string, unknown>;
      Object.assign(current, fields);
      const currentText = JSON.stringify(current);
      const revision = computeDocRevision(currentText);
      const manifest = JSON.parse(await (await manifestHandle.getFile()).text()) as Record<string, unknown>;
      const projectMeta = manifest['project'] as Record<string, unknown>;
      const currentMeta = manifest['current'] as Record<string, unknown>;
      currentMeta['revision'] = revision;
      currentMeta['committedAtUtc'] = '2026-07-12T17:30:00.000Z';
      projectMeta['updatedAtUtc'] = '2026-07-12T17:30:00.000Z';
      const currentWritable = await currentHandle.createWritable();
      await currentWritable.write(currentText);
      await currentWritable.close();
      const manifestWritable = await manifestHandle.createWritable();
      await manifestWritable.write(JSON.stringify(manifest));
      await manifestWritable.close();
      if (writeAutosave) {
        const autosaveHandle = await data.getFileHandle('autosave-view.json', { create: true });
        const writable = await autosaveHandle.createWritable();
        await writable.write(
          JSON.stringify({
            schema: 'visual-specs.autosave-view',
            formatVersion: '1.0',
            projectId: projectMeta['id'],
            docId: currentMeta['docId'],
            baseRevision: revision,
            savedAtUtc: '2026-07-12T17:30:00.000Z',
            view: { viewport: { x: 10, y: 20, zoom: 1.5 } },
          }),
        );
        await writable.close();
      }
      return currentText;
    },
    { name: rootName, additions, autosave },
  );
}

async function writeMatchingAutosave(page: Page, rootName: string): Promise<void> {
  await page.evaluate(async (name) => {
    const opfs = await navigator.storage.getDirectory();
    const root = await opfs.getDirectoryHandle(name);
    const project = await root.getDirectoryHandle('.visual-specs');
    const data = await project.getDirectoryHandle('data');
    const manifest = JSON.parse(await (await (await project.getFileHandle('project.json')).getFile()).text()) as Record<
      string,
      unknown
    >;
    const projectMeta = manifest['project'] as Record<string, unknown>;
    const currentMeta = manifest['current'] as Record<string, unknown>;
    const handle = await data.getFileHandle('autosave-view.json', { create: true });
    const writable = await handle.createWritable();
    await writable.write(
      JSON.stringify({
        schema: 'visual-specs.autosave-view',
        formatVersion: '1.0',
        projectId: projectMeta['id'],
        docId: currentMeta['docId'],
        baseRevision: currentMeta['revision'],
        savedAtUtc: '2026-07-12T17:20:00.000Z',
        view: { viewport: { x: 10, y: 20, zoom: 1.5 } },
      }),
    );
    await writable.close();
  }, rootName);
}

async function removeProjectArea(page: Page, rootName: string, area: string): Promise<void> {
  await page.evaluate(
    async ({ name, area: projectArea }) => {
      const opfs = await navigator.storage.getDirectory();
      const root = await opfs.getDirectoryHandle(name);
      const project = await root.getDirectoryHandle('.visual-specs');
      await project.removeEntry(projectArea, { recursive: true });
    },
    { name: rootName, area },
  );
}

async function cleanup(page: Page, rootName: string): Promise<void> {
  if (page.isClosed()) return;
  await page.evaluate(async (name) => {
    const opfs = await navigator.storage.getDirectory();
    try {
      await opfs.removeEntry(name, { recursive: true });
    } catch {
      // Test may have failed before the harness created its root.
    }
  }, rootName);
}

function changedDoc(): string {
  const changed = JSON.parse(sampleDoc()) as Record<string, unknown>;
  changed['uiImported'] = true;
  return JSON.stringify(changed);
}

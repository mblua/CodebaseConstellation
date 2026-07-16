import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import type { ProjectControllerState } from '../../src/app/projectController.ts';
import { routeEdges, type RenderScene } from '../../src/ports/renderer.ts';
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

interface ProjectLayoutState {
  band: 'wide' | 'hybrid' | 'narrow';
  projectPreference: 'expanded' | 'collapsed';
  sidebarPreference: 'open' | 'closed';
  detailPreference: 'open' | 'closed';
  activeOverlay: 'project' | 'sidebar' | 'detail' | null;
  projectOpen: boolean;
  sidebarOpen: boolean;
  detailOpen: boolean;
  timings: Array<{ band: 'wide' | 'hybrid' | 'narrow'; durationMs: number }>;
  pendingFrames: { resize: boolean; paint: boolean; focus: boolean };
  canvas: { x: number; y: number; width: number; height: number };
}

interface ProjectInteractionState {
  selection: { nodeIds: string[]; edgeId: string | null };
  expanded: string[];
  positions: Array<[string, { x: number; y: number; pinned?: boolean }]>;
  filters: { nodeKinds: string[]; edgeKinds: string[] };
}

interface ProjectSceneNode {
  id: string;
  kind: string;
  position: { x: number; y: number };
  size: { w: number; h: number };
  hidden: boolean;
}

interface ProjectSceneEdge {
  id: string;
  kind: string;
  sourceId: string;
  targetId: string;
  count: number;
  hidden: boolean;
}

interface ProjectSceneState {
  scene: { nodes: ProjectSceneNode[]; edges: ProjectSceneEdge[] };
  viewport: { x: number; y: number; zoom: number };
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
    expect(await harnessValue<number>(page, 'openCalls')).toBe(1);
    expect(await harnessValue<boolean[]>(page, 'openActivations')).toEqual([true]);
    await page.getByRole('button', { name: 'Refresh imports', exact: true }).click();
    await expect(page.getByLabel('Project imports').locator('option')).toHaveCount(1);
    let importConfirm = '';
    page.once('dialog', (dialog) => {
      importConfirm = dialog.message();
      void dialog.accept();
    });
    await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
    expect(importConfirm).toMatch(/open project has unsaved layout or view changes/i);
    expect(importConfirm.match(/open project/giu)).toHaveLength(1);
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
    await expect(page.locator('.action-error')).toContainText('Save project failed');
    await expect(page.locator('.action-error')).toContainText('conflict');
    await expect(page.locator('.banner.coverage')).toBeVisible();
    await expect(page.locator('.banner.unresolved')).toBeVisible();
    expect(await isElementTopmostAtCenter(page, '.banner.coverage')).toBe(true);
    disk = await readDisk(page, rootName);
    expect(disk.currentText).toBe(externalText);
    expect(disk.backups).toHaveLength(backupsBeforeConflict);

    const callsBeforeDecline = await harnessValue<number>(page, 'directoryCalls');
    page.once('dialog', (dialog) => void dialog.dismiss());
    await page.getByRole('button', { name: 'Open Project', exact: true }).click();
    await expect.poll(() => harnessValue<number>(page, 'directoryCalls')).toBe(callsBeforeDecline);
    await expect(name).toHaveValue('Renamed Project');

    // Pinned order (A2-P2-6): the picker runs FIRST on the click's activation;
    // the discard confirm arrives after an await, so it is polled, not read.
    const openCallsBeforeTemporary = await harnessValue<number>(page, 'openCalls');
    let temporaryConfirm = '';
    page.once('dialog', (dialog) => {
      temporaryConfirm = dialog.message();
      void dialog.dismiss();
    });
    await page.getByRole('button', { name: 'Open JSON temporarily', exact: true }).click();
    await expect.poll(() => temporaryConfirm).toMatch(/unsaved layout or view changes/i);
    expect(await harnessValue<number>(page, 'openCalls')).toBe(openCallsBeforeTemporary + 1);
    expect(temporaryConfirm.match(/open project/giu)).toHaveLength(1);
    expect(temporaryConfirm.match(/unsaved/giu)).toHaveLength(1);
    expect(temporaryConfirm).not.toContain('Preview');
    await expect(name).toHaveValue('Renamed Project');

    await setHarness(page, { cancelNextDirectory: true });
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Open Project', exact: true }).click();
    await expect(page.locator('.status')).toContainText('Cancelled. No project or document state changed.');
    await expect(page.locator('.action-error')).toContainText('conflict');
    await expect(name).toHaveValue('Renamed Project');
    expect(await harnessValue<number>(page, 'directoryCalls')).toBe(callsBeforeDecline + 1);
    const directoryActivations = await harnessValue<boolean[]>(page, 'directoryActivations');
    expect(directoryActivations.length).toBeGreaterThan(0);
    expect(directoryActivations.every(Boolean)).toBe(true);
  } finally {
    await cleanup(page, rootName);
  }
});

test('dirty Import and Restore share one discard authority and commit only after acceptance', async ({ page }) => {
  const rootName = await installHarness(page);
  try {
    await boot(page);
    const name = page.getByLabel('Project name');
    await name.fill('Guarded Project');
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();
    await setHarness(page, { externalName: 'guarded-import.json', externalText: changedDoc() });
    await page.getByRole('button', { name: 'Add JSON', exact: true }).click();
    await page.getByRole('button', { name: 'Refresh imports', exact: true }).click();
    await page.locator('#export-btn').click();
    await expect.poll(async () => (await readDisk(page, rootName)).exports.length).toBe(1);
    await page.getByRole('button', { name: 'Refresh exports', exact: true }).click();

    const importButton = page.getByRole('button', { name: 'Import JSON', exact: true });
    await name.fill('');
    await page.getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(page.locator('.action-error')).toContainText('Rename project failed');
    await name.fill('Guarded Project');
    await page.locator('#zoom-in').click();
    const importStateBefore = await readProjectState(page);
    const importInteractionBefore = await readProjectInteraction(page);
    const importErrorBefore = await page.locator('.action-error').textContent();
    const importDiskBefore = await readDisk(page, rootName);
    const importFile = importDiskBefore.imports[0];
    expect(importFile).toBeDefined();
    const importActionsBefore = await readProjectActions(page);
    const importReadsBefore = await harnessValue<string[]>(page, 'fileReads');
    const importWritesBefore = await harnessValue<string[]>(page, 'fileWrites');
    let importCancelCopy = '';
    page.once('dialog', (dialog) => {
      importCancelCopy = dialog.message();
      void dialog.dismiss();
    });

    await importButton.click();

    expect(importCancelCopy).toMatch(/open project has unsaved layout or view changes/i);
    expect(importCancelCopy.match(/open project/giu)).toHaveLength(1);
    expect(importCancelCopy.match(/unsaved/giu)).toHaveLength(1);
    expect((await readProjectActions(page))['Import JSON'] ?? 0).toBe(
      importActionsBefore['Import JSON'] ?? 0,
    );
    expect(countNamed(await harnessValue<string[]>(page, 'fileReads'), importFile ?? '')).toBe(
      countNamed(importReadsBefore, importFile ?? ''),
    );
    expect(commitWriteCounts(await harnessValue<string[]>(page, 'fileWrites'))).toEqual(
      commitWriteCounts(importWritesBefore),
    );
    expect(projectSafetyState(await readProjectState(page))).toEqual(
      projectSafetyState(importStateBefore),
    );
    expect(await readProjectInteraction(page)).toEqual(importInteractionBefore);
    await expect(page.locator('.action-error')).toHaveText(importErrorBefore ?? '');
    await expect(importButton).toBeFocused();
    expect(await readDisk(page, rootName)).toEqual(importDiskBefore);

    const importAcceptActions = await readProjectActions(page);
    const importAcceptWrites = await harnessValue<string[]>(page, 'fileWrites');
    let importAcceptCopy = '';
    page.once('dialog', (dialog) => {
      importAcceptCopy = dialog.message();
      void dialog.accept();
    });
    await importButton.click();
    await expect(page.locator('.project-message')).toContainText('Imported');
    expect(importAcceptCopy).toBe(importCancelCopy);
    expect((await readProjectActions(page))['Import JSON']).toBe(
      (importAcceptActions['Import JSON'] ?? 0) + 1,
    );
    const importCommittedWrites = commitWriteCounts(
      await harnessValue<string[]>(page, 'fileWrites'),
    );
    const importBaselineWrites = commitWriteCounts(importAcceptWrites);
    expect(importCommittedWrites).toEqual({
      current: importBaselineWrites.current + 1,
      manifest: importBaselineWrites.manifest + 1,
      backup: importBaselineWrites.backup + 1,
    });
    const afterImport = await readDisk(page, rootName);
    expect(afterImport.backups).toHaveLength(importDiskBefore.backups.length + 1);
    expect(JSON.parse(afterImport.currentText)).toMatchObject({ uiImported: true });

    await page.locator('#zoom-in').click();
    await name.fill('');
    await page.getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(page.locator('.action-error')).toContainText('Rename project failed');
    await name.fill('Guarded Project');
    const restoreButton = page.getByRole('button', { name: 'Restore from export', exact: true });
    const restoreStateBefore = await readProjectState(page);
    const restoreInteractionBefore = await readProjectInteraction(page);
    const restoreErrorBefore = await page.locator('.action-error').textContent();
    const restoreDiskBefore = await readDisk(page, rootName);
    const exportFile = restoreDiskBefore.exports[0];
    expect(exportFile).toBeDefined();
    const restoreActionsBefore = await readProjectActions(page);
    const restoreReadsBefore = await harnessValue<string[]>(page, 'fileReads');
    const restoreWritesBefore = await harnessValue<string[]>(page, 'fileWrites');
    let restoreCancelCopy = '';
    page.once('dialog', (dialog) => {
      restoreCancelCopy = dialog.message();
      void dialog.dismiss();
    });

    await restoreButton.click();

    expect(restoreCancelCopy).toMatch(/open project has unsaved layout or view changes/i);
    expect(restoreCancelCopy.match(/open project/giu)).toHaveLength(1);
    expect(restoreCancelCopy.match(/unsaved/giu)).toHaveLength(1);
    expect(restoreCancelCopy.match(/backed up/giu)).toHaveLength(1);
    expect(restoreCancelCopy.match(/Continue\?/gu)).toHaveLength(1);
    expect((await readProjectActions(page))['Restore from export'] ?? 0).toBe(
      restoreActionsBefore['Restore from export'] ?? 0,
    );
    expect(countNamed(await harnessValue<string[]>(page, 'fileReads'), exportFile ?? '')).toBe(
      countNamed(restoreReadsBefore, exportFile ?? ''),
    );
    expect(commitWriteCounts(await harnessValue<string[]>(page, 'fileWrites'))).toEqual(
      commitWriteCounts(restoreWritesBefore),
    );
    expect(projectSafetyState(await readProjectState(page))).toEqual(
      projectSafetyState(restoreStateBefore),
    );
    expect(await readProjectInteraction(page)).toEqual(restoreInteractionBefore);
    await expect(page.locator('.action-error')).toHaveText(restoreErrorBefore ?? '');
    await expect(restoreButton).toBeFocused();
    expect(await readDisk(page, rootName)).toEqual(restoreDiskBefore);

    const restoreAcceptActions = await readProjectActions(page);
    const restoreAcceptWrites = await harnessValue<string[]>(page, 'fileWrites');
    page.once('dialog', (dialog) => void dialog.accept());
    await restoreButton.click();
    await expect(page.locator('.project-message')).toContainText('Restored');
    expect((await readProjectActions(page))['Restore from export']).toBe(
      (restoreAcceptActions['Restore from export'] ?? 0) + 1,
    );
    const restoreCommittedWrites = commitWriteCounts(
      await harnessValue<string[]>(page, 'fileWrites'),
    );
    const restoreBaselineWrites = commitWriteCounts(restoreAcceptWrites);
    expect(restoreCommittedWrites).toEqual({
      current: restoreBaselineWrites.current + 1,
      manifest: restoreBaselineWrites.manifest + 1,
      backup: restoreBaselineWrites.backup + 1,
    });
    expect((await readDisk(page, rootName)).backups).toHaveLength(
      restoreDiskBefore.backups.length + 1,
    );
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
    expect(await harnessValue<boolean[]>(page, 'saveActivations')).toEqual([true]);

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
    await expect(page.locator('.action-error')).toBeHidden();

    const addJson = page.getByRole('button', { name: 'Add JSON', exact: true });
    await expect(addJson).toBeHidden();
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
    // Import already committed the recovered document, so there is no dirty Save action.
    await expect(
      page.locator('#project-rail .project-critical-actions').getByRole('button', {
        name: 'Save',
        exact: true,
        includeHidden: true,
      }),
    ).toBeHidden();
    await expect(page.locator('#export-btn')).toBeEnabled();
    const recovered = await readDisk(page, rootName);
    expect(recovered.backups).toHaveLength(1);
    expect(JSON.parse(recovered.currentText)).toMatchObject({ uiImported: true });

    await removeProjectArea(page, rootName, 'imports');
    await page.getByRole('button', { name: 'Refresh imports', exact: true }).click();
    await expect(page.getByLabel('Project imports').locator('option')).toHaveText('No imports');
    await expect(page.locator('.action-error')).toBeHidden();
  } finally {
    await cleanup(page, rootName);
  }
});

for (const projectAccess of ['editable', 'readonly'] as const) {
  test(`Preview defers ${projectAccess} project recovery actions to their underlying owner`, async ({ page }) => {
    const rootName = await installHarness(page);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    try {
      const expectedBand = projectAccess === 'editable' ? 'hybrid' : 'narrow';
      await page.setViewportSize(
        projectAccess === 'editable'
          ? { width: 1663, height: 900 }
          : { width: 800, height: 800 },
      );
      await boot(page);

      const ownerA = JSON.parse(sampleDoc()) as Record<string, unknown>;
      ownerA['resilienceOwnerMarker'] = 'PREVIEW-EXPORT-A';
      await page.locator('#import-input').setInputFiles({
        name: 'owner-a.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(ownerA), 'utf8'),
      });
      await expect(page.locator('.project-message')).toContainText(
        'Opened owner-a.json temporarily',
      );
      await page.getByLabel('Project name').fill(`Preview recovery ${projectAccess}`);
      await page.getByRole('button', { name: 'Create Project', exact: true }).click();
      await expect(page.locator('.project-message')).toContainText('Created project.');
      await page.locator('#export-btn').click();
      await expect.poll(async () => (await readDisk(page, rootName)).exports.length).toBe(1);
      const ownerAExport = (await readDisk(page, rootName)).exports[0];
      expect(ownerAExport).toBeDefined();
      expect(
        JSON.parse(await readProjectExportText(page, rootName, ownerAExport ?? '{}')),
      ).toMatchObject({ resilienceOwnerMarker: 'PREVIEW-EXPORT-A' });

      await rewriteCurrent(page, rootName, {
        resilienceOwnerMarker: 'UNDERLYING-CURRENT-B',
      });
      await writeMatchingAutosave(page, rootName, { x: 77, y: 88, zoom: 1.7 });
      await page.reload();
      await waitForBoot(page);
      await page.getByRole('button', { name: 'Open Project', exact: true }).click();
      if (projectAccess === 'editable') {
        await page.getByRole('button', { name: 'Enable editing', exact: true }).click();
        await expect(page.locator('.project-message')).toContainText('Editing enabled');
      }

      const openExportCopy = page.getByRole('button', {
        name: 'Open export copy',
        exact: true,
      });
      await openExportCopy.evaluate((button) => {
        (globalThis as unknown as Record<string, unknown>)['__openExportCopyTrusted'] = false;
        button.addEventListener(
          'click',
          (event) => {
            (globalThis as unknown as Record<string, unknown>)['__openExportCopyTrusted'] =
              event.isTrusted;
          },
          { once: true },
        );
      });
      await openExportCopy.click();
      await expect(page.locator('.project-message')).toContainText('Previewing export copy');
      expect(
        await page.evaluate(
          () =>
            (globalThis as unknown as Record<string, unknown>)['__openExportCopyTrusted'],
        ),
      ).toBe(true);
      const previewReturn = page
        .locator('#project-rail .project-critical-actions')
        .getByRole('button', { name: 'Return to project', exact: true });
      await expect(previewReturn).toBeVisible();
      await expect(previewReturn).toBeFocused();
      expect(await activeFocusSafety(page)).toEqual({ body: false, hiddenSubtree: false });
      expect(await rawDocument(page)).toMatchObject({
        resilienceOwnerMarker: 'PREVIEW-EXPORT-A',
      });
      expect(JSON.parse((await readDisk(page, rootName)).currentText)).toMatchObject({
        resilienceOwnerMarker: 'UNDERLYING-CURRENT-B',
      });
      const previewState = await readProjectState(page);
      expect(previewState).toMatchObject({
        sessionKind: 'project-preview',
        previewing: true,
        pendingAutosave: true,
        access: projectAccess === 'editable' ? 'readwrite' : 'readonly',
      });
      const projectStates = page.locator('#project-rail .project-states');
      await expect(projectStates).toContainText('Preview');
      await expect(projectStates).toContainText('Recovery available');

      const restoreView = page.getByRole('button', { name: 'Restore view', exact: true });
      const keepCurrent = page.getByRole('button', { name: 'Keep current', exact: true });
      const exportRecovery = page.getByRole('button', {
        name: 'Export autosave copy',
        exact: true,
      });
      const recoveryButtons = page.locator('.autosave-actions button');
      await expect(restoreView).toBeHidden();
      await expect(keepCurrent).toBeHidden();
      await expect(exportRecovery).toBeHidden();
      expect(
        await recoveryButtons.evaluateAll((buttons) =>
          buttons.map((button) => {
            (button as HTMLButtonElement).focus();
            return document.activeElement === button;
          }),
        ),
      ).toEqual([false, false, false]);

      await page.getByRole('button', { name: 'Collapse project rail', exact: true }).click();
      const compactStates = page.locator('.project-compact-states');
      await expect(compactStates).toBeVisible();
      await expect(compactStates).toContainText('Preview');
      await expect(compactStates).toContainText('Recovery available');
      const compactRecovery = page.getByRole('button', {
        name: 'Recovery available',
        exact: true,
        includeHidden: true,
      });
      await expect(compactRecovery).toBeVisible();
      await compactRecovery.evaluate((button) => {
        (globalThis as unknown as Record<string, unknown>)['__compactRecoveryOpenerNode'] = button;
      });
      const genericProjectShow = page.locator('#show-project-rail');
      const projectCollapse = page.getByRole('button', {
        name: 'Collapse project rail',
        exact: true,
      });
      const focusRoundTripState = projectSafetyState(await readProjectState(page));
      const focusRoundTripRaw = await rawDocument(page);
      const focusRoundTripViewport = await viewport(page);
      await compactRecovery.click();
      await expect(page.locator('#project-rail')).toBeVisible();
      await expect(projectCollapse).toBeFocused();
      await expect.poll(() => readProjectLayout(page)).toMatchObject({
        band: expectedBand,
        activeOverlay: 'project',
        projectOpen: true,
      });
      await expect(exportRecovery).toBeHidden();

      await page.keyboard.press('Escape');
      await expect(page.locator('#project-rail')).toBeHidden();
      await expect(compactRecovery).toBeVisible();
      await expect(compactRecovery).toBeFocused();
      await expect(genericProjectShow).not.toBeFocused();
      await expect.poll(() => readProjectLayout(page)).toMatchObject({
        band: expectedBand,
        activeOverlay: null,
        projectOpen: false,
      });
      expect(projectSafetyState(await readProjectState(page))).toEqual(focusRoundTripState);
      expect(await rawDocument(page)).toEqual(focusRoundTripRaw);
      expect(await viewport(page)).toEqual(focusRoundTripViewport);
      expect(await activeFocusSafety(page)).toEqual({ body: false, hiddenSubtree: false });
      expect(
        await compactRecovery.evaluate(
          (button) =>
            (globalThis as unknown as Record<string, unknown>)[
              '__compactRecoveryOpenerNode'
            ] === button,
        ),
      ).toBe(true);
      await expect(exportRecovery).toBeHidden();

      if (projectAccess === 'editable') {
        await compactRecovery.click();
        await expect(projectCollapse).toBeFocused();
        await page.setViewportSize({ width: 1199, height: 900 });
        await waitForLayoutPaint(page);
        await expect.poll(() => readProjectLayout(page)).toMatchObject({
          band: 'narrow',
          activeOverlay: 'project',
          projectOpen: true,
        });
        await expect(projectCollapse).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(compactRecovery).toBeVisible();
        await expect(compactRecovery).toBeFocused();
        await expect(genericProjectShow).not.toBeFocused();
        await expect.poll(() => readProjectLayout(page)).toMatchObject({
          band: 'narrow',
          activeOverlay: null,
          projectOpen: false,
        });
        expect(await activeFocusSafety(page)).toEqual({ body: false, hiddenSubtree: false });
        expect(projectSafetyState(await readProjectState(page))).toEqual(focusRoundTripState);
        expect(await rawDocument(page)).toEqual(focusRoundTripRaw);
        expect(await viewport(page)).toEqual(focusRoundTripViewport);

        await compactRecovery.click();
        await expect(projectCollapse).toBeFocused();
        await page.setViewportSize({ width: 1200, height: 900 });
        await waitForLayoutPaint(page);
        await expect.poll(() => readProjectLayout(page)).toMatchObject({
          band: 'hybrid',
          activeOverlay: 'project',
          projectOpen: true,
        });
        await expect(projectCollapse).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(compactRecovery).toBeVisible();
        await expect(compactRecovery).toBeFocused();
        await expect(genericProjectShow).not.toBeFocused();
        await expect.poll(() => readProjectLayout(page)).toMatchObject({
          band: 'hybrid',
          activeOverlay: null,
          projectOpen: false,
        });
        expect(await activeFocusSafety(page)).toEqual({ body: false, hiddenSubtree: false });
        expect(projectSafetyState(await readProjectState(page))).toEqual(focusRoundTripState);
        expect(await rawDocument(page)).toEqual(focusRoundTripRaw);
        expect(await viewport(page)).toEqual(focusRoundTripViewport);
        expect(
          await compactRecovery.evaluate(
            (button) =>
              (globalThis as unknown as Record<string, unknown>)[
                '__compactRecoveryOpenerNode'
              ] === button,
          ),
        ).toBe(true);

        await compactRecovery.click();
        await expect(projectCollapse).toBeFocused();
        await compactRecovery.evaluate((button) => {
          (button as HTMLButtonElement).hidden = true;
        });
        await page.keyboard.press('Escape');
        await expect(page.locator('#project-rail')).toBeHidden();
        await expect(compactRecovery).toBeHidden();
        await expect(genericProjectShow).toBeVisible();
        await expect(genericProjectShow).toBeFocused();
        await expect.poll(() => readProjectLayout(page)).toMatchObject({
          activeOverlay: null,
          projectOpen: false,
        });
        expect(await activeFocusSafety(page)).toEqual({ body: false, hiddenSubtree: false });
        expect(projectSafetyState(await readProjectState(page))).toEqual(focusRoundTripState);
        await compactRecovery.evaluate((button) => {
          (button as HTMLButtonElement).hidden = false;
        });
        await expect(compactRecovery).toBeVisible();
      }

      await compactRecovery.click();
      await expect(page.locator('#project-rail')).toBeVisible();
      await expect.poll(() => readProjectLayout(page)).toMatchObject({
        band: expectedBand,
        activeOverlay: 'project',
      });

      const guardedState = projectSafetyState(await readProjectState(page));
      const guardedRaw = await rawDocument(page);
      const guardedViewport = await viewport(page);
      const guardedDisk = await readDisk(page, rootName);
      const guardedSaves = await harnessValue<number>(page, 'saveCalls');
      const guardedSaveNames = await harnessValue<string[]>(page, 'saveNames');
      const guardedWrites = await harnessValue<string[]>(page, 'fileWrites');
      await recoveryButtons.evaluateAll((buttons) => {
        for (const button of buttons) (button as HTMLButtonElement).click();
      });
      await expect(page.locator('.action-error')).toContainText('Return to the project');

      expect(projectSafetyState(await readProjectState(page))).toEqual(guardedState);
      expect(await rawDocument(page)).toEqual(guardedRaw);
      expect(await viewport(page)).toEqual(guardedViewport);
      expect(await readDisk(page, rootName)).toEqual(guardedDisk);
      expect(await harnessValue<number>(page, 'saveCalls')).toBe(guardedSaves);
      expect(await harnessValue<string[]>(page, 'saveNames')).toEqual(guardedSaveNames);
      expect(await harnessValue<string[]>(page, 'fileWrites')).toEqual(guardedWrites);

      await page.getByRole('button', { name: 'Return to project', exact: true }).click();
      await expect(page.locator('.action-error')).toBeHidden();
      expect(await readProjectState(page)).toMatchObject({
        sessionKind: 'project',
        previewing: false,
        pendingAutosave: true,
      });
      expect(await rawDocument(page)).toMatchObject({
        resilienceOwnerMarker: 'UNDERLYING-CURRENT-B',
      });
      await expect(restoreView).toBeVisible();
      await expect(keepCurrent).toBeVisible();
      await expect(exportRecovery).toBeVisible();

      const exportsBeforeRecovery = await readDisk(page, rootName);
      const savesBeforeRecovery = await harnessValue<number>(page, 'saveCalls');
      const saveNamesBeforeRecovery = await harnessValue<string[]>(page, 'saveNames');
      const exportActionsBefore = await readProjectActions(page);
      await exportRecovery.evaluate((button) => {
        (globalThis as unknown as Record<string, unknown>)['__recoveryExportTrusted'] = false;
        button.addEventListener(
          'click',
          (event) => {
            (globalThis as unknown as Record<string, unknown>)['__recoveryExportTrusted'] =
              event.isTrusted;
          },
          { once: true },
        );
      });
      await exportRecovery.click();
      await expect(page.locator('.project-message')).toContainText('Exported autosave copy');
      expect(
        await page.evaluate(
          () =>
            (globalThis as unknown as Record<string, unknown>)['__recoveryExportTrusted'],
        ),
      ).toBe(true);
      expect((await readProjectActions(page))['Export autosave copy']).toBe(
        (exportActionsBefore['Export autosave copy'] ?? 0) + 1,
      );

      let recoveryText: string;
      const exportsAfterRecovery = await readDisk(page, rootName);
      if (projectAccess === 'editable') {
        const addedExports = exportsAfterRecovery.exports.filter(
          (fileName) => !exportsBeforeRecovery.exports.includes(fileName),
        );
        expect(addedExports).toHaveLength(1);
        expect(await harnessValue<number>(page, 'saveCalls')).toBe(savesBeforeRecovery);
        expect(await harnessValue<string[]>(page, 'saveNames')).toEqual(
          saveNamesBeforeRecovery,
        );
        recoveryText = await readProjectExportText(page, rootName, addedExports[0] ?? '');
      } else {
        expect(exportsAfterRecovery.exports).toEqual(exportsBeforeRecovery.exports);
        expect(await harnessValue<number>(page, 'saveCalls')).toBe(savesBeforeRecovery + 1);
        const saveNamesAfterRecovery = await harnessValue<string[]>(page, 'saveNames');
        expect(saveNamesAfterRecovery).toHaveLength(saveNamesBeforeRecovery.length + 1);
        expect(
          (await harnessValue<boolean[]>(page, 'saveActivations')).slice(-1),
        ).toEqual([true]);
        recoveryText = await readRootFileText(
          page,
          rootName,
          saveNamesAfterRecovery.at(-1) ?? '',
        );
      }
      expect(JSON.parse(recoveryText)).toMatchObject({
        resilienceOwnerMarker: 'UNDERLYING-CURRENT-B',
        view: { viewport: { x: 77, y: 88, zoom: 1.7 } },
      });
      expect(await readProjectState(page)).toMatchObject({ pendingAutosave: true });

      const returnedViewport = await viewport(page);
      const exportsAfterCopy = (await readDisk(page, rootName)).exports;
      const savesAfterCopy = await harnessValue<number>(page, 'saveCalls');
      if (projectAccess === 'editable') {
        await restoreView.click();
        expect(await viewport(page)).toEqual({ x: 77, y: 88, zoom: 1.7 });
        expect(await readProjectState(page)).toMatchObject({
          previewing: false,
          pendingAutosave: false,
          dirty: true,
        });
      } else {
        await keepCurrent.click();
        expect(await viewport(page)).toEqual(returnedViewport);
        expect(await readProjectState(page)).toMatchObject({
          previewing: false,
          pendingAutosave: false,
          dirty: false,
        });
      }
      expect((await readDisk(page, rootName)).exports).toEqual(exportsAfterCopy);
      expect(await harnessValue<number>(page, 'saveCalls')).toBe(savesAfterCopy);
      expect(await rawDocument(page)).toMatchObject({
        resilienceOwnerMarker: 'UNDERLYING-CURRENT-B',
      });
      expect(pageErrors).toEqual([]);
    } finally {
      await cleanup(page, rootName);
    }
  });
}

test('Return, Restore autosave, and Keep current successes clear the prior action error', async ({ page }) => {
  const rootName = await installHarness(page);
  try {
    await boot(page);
    await page.getByLabel('Project name').fill('Direct success');
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();
    await page.locator('#export-btn').click();
    await expect.poll(async () => (await readDisk(page, rootName)).exports.length).toBe(1);
    await page.getByRole('button', { name: 'Refresh exports', exact: true }).click();
    await page.getByRole('button', { name: 'Open export copy', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Return to project', exact: true })).toBeVisible();

    await injectInvalidTemporary(page);
    await expect(page.locator('.action-error')).toContainText('Open temporary JSON failed');
    await page.getByRole('button', { name: 'Return to project', exact: true }).click();
    await expect(page.locator('.action-error')).toBeHidden();

    await writeMatchingAutosave(page, rootName);
    await page.reload();
    await waitForBoot(page);
    await page.getByRole('button', { name: 'Open Project', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Restore view', exact: true })).toBeVisible();
    await injectInvalidTemporary(page);
    await expect(page.locator('.action-error')).toContainText('Open temporary JSON failed');
    await page.getByRole('button', { name: 'Restore view', exact: true }).click();
    await expect(page.locator('.action-error')).toBeHidden();

    await writeMatchingAutosave(page, rootName);
    await page.reload();
    await waitForBoot(page);
    await page.getByRole('button', { name: 'Open Project', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Keep current', exact: true })).toBeVisible();
    await injectInvalidTemporary(page);
    await expect(page.locator('.action-error')).toContainText('Open temporary JSON failed');
    await page.getByRole('button', { name: 'Keep current', exact: true }).click();
    await expect(page.locator('.action-error')).toBeHidden();
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

test('Project Rail is distinct, collapsible, atomic in focus, and keeps stable form DOM', async ({ page }, testInfo) => {
  const rootName = await installHarness(page);
  try {
    await page.setViewportSize({ width: 1680, height: 1000 });
    await boot(page);

    const rail = page.locator('#project-rail');
    const explorer = page.locator('#explorer-panel');
    const details = page.locator('#details-panel');
    await expect(rail).toBeVisible();
    await expect(rail).toHaveAttribute('aria-label', 'Project');
    await expect(explorer).toHaveAttribute('aria-label', 'Explorer');
    await expect(details).toHaveAttribute('aria-label', 'Details');
    await expect(rail.locator('.project-session-identity')).toHaveText('Example: AgentsCommander');
    await expect(rail.getByRole('button', { name: 'Create Project', exact: true })).toBeVisible();
    await expect(rail.getByRole('button', { name: 'Open Project', exact: true })).toBeVisible();
    const documentRegion = rail.getByRole('region', { name: 'Document' });
    await expect(documentRegion.getByRole('button', { name: 'Open JSON temporarily' })).toBeVisible();
    await expect(documentRegion.getByRole('button', { name: 'Export JSON' })).toBeVisible();
    await expect(rail.getByRole('button', { name: 'Rename', includeHidden: true })).toBeHidden();
    await expect(rail.getByRole('button', { name: 'Save', exact: true, includeHidden: true })).toBeHidden();
    expect(
      await page.evaluate(() => {
        const project = document.querySelector('#project-rail');
        const toolbar = document.querySelector('.toolbar');
        return project !== null && toolbar !== null &&
          (project.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      }),
    ).toBe(true);
    await captureReviewEvidence(page, testInfo, 'project-rail-example-1680x1000');

    const name = page.getByLabel('Project name');
    await name.fill('Stable Project');
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Created project.');
    const disk = await readDisk(page, rootName);
    const rawId = ((disk.manifest['project'] as Record<string, unknown>)['id'] ?? '') as string;
    const escapedId = escapeForPresentation(rawId);
    await expect(page.locator('.project-identity')).toHaveAccessibleName(
      `Project Stable Project. Project ID ${escapedId}.`,
    );
    expect(await displayedProjectId(page)).toBe(escapedId);
    await expect(page.locator('.project-states')).toContainText('Project access: editable');

    const expandedCanvas = await page.locator('.canvas-host canvas').boundingBox();
    const railBox = await rail.boundingBox();
    expect(expandedCanvas).not.toBeNull();
    expect(railBox?.width).toBeCloseTo(192, 0);
    await page.evaluate(() => {
      const globals = globalThis as unknown as Record<string, unknown>;
      const hooks = globals['__visualSpecs'] as {
        scene(): unknown;
        viewport(): unknown;
      };
      globals['__railScene'] = hooks.scene();
      globals['__railViewport'] = hooks.viewport();
    });

    const collapse = page.getByRole('button', { name: 'Collapse project rail', exact: true });
    const show = page.locator('#show-project-rail');
    await collapse.click();
    await expect(show).toBeFocused();
    await expect(show).toHaveAttribute('aria-controls', 'project-rail');
    await expect(show).toHaveAttribute('aria-expanded', 'false');
    await expect(rail).toBeHidden();
    await expect(page.locator('.project-compact')).toBeVisible();
    await expect(page.locator('.project-compact-identity')).toHaveAccessibleName(
      `Project Stable Project. Project ID ${escapedId}.`,
    );
    expect(
      await rail.evaluate((element) =>
        Array.from(element.querySelectorAll<HTMLElement>('button,input,select,a[href],[tabindex]'))
          .every((control) => control.offsetParent === null),
      ),
    ).toBe(true);
    await waitForLayoutPaint(page);
    const collapsedCanvas = await page.locator('.canvas-host canvas').boundingBox();
    expect(collapsedCanvas).not.toBeNull();
    expect((collapsedCanvas?.width ?? 0) - (expandedCanvas?.width ?? 0)).toBeCloseTo(192, 0);
    expect(
      await page.evaluate(() => {
        const globals = globalThis as unknown as Record<string, unknown>;
        const hooks = globals['__visualSpecs'] as { scene(): unknown; viewport(): unknown };
        return hooks.scene() === globals['__railScene'] &&
          JSON.stringify(hooks.viewport()) === JSON.stringify(globals['__railViewport']);
      }),
    ).toBe(true);
    await captureReviewEvidence(page, testInfo, 'project-rail-editable-collapsed');

    await show.click();
    await expect(collapse).toBeFocused();
    await expect(show).toHaveAttribute('aria-expanded', 'true');
    await waitForLayoutPaint(page);
    expect((await page.locator('.canvas-host canvas').boundingBox())?.width).toBeCloseTo(
      expandedCanvas?.width ?? 0,
      0,
    );

    await page.evaluate(() => {
      const globals = globalThis as unknown as Record<string, unknown>;
      globals['__stableProjectDom'] = {
        name: document.querySelector('.project-name'),
        imports: document.querySelector('.project-imports'),
        exports: document.querySelector('.project-exports'),
      };
    });
    await page.locator('#zoom-in').click();
    await name.focus();
    await name.fill('Draft kept through autosave');
    await name.evaluate((input) => {
      const field = input as HTMLInputElement;
      field.setSelectionRange(6, 10);
      field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'kept' }));
    });
    await expect(page.locator('.project-message')).toContainText('Autosaved view.');
    expect(
      await page.evaluate(() => {
        const globals = globalThis as unknown as Record<string, unknown>;
        const stable = globals['__stableProjectDom'] as Record<string, Element | null>;
        const input = document.querySelector<HTMLInputElement>('.project-name');
        return stable['name'] === input && document.activeElement === input &&
          input?.value === 'Draft kept through autosave' &&
          input.selectionStart === 6 && input.selectionEnd === 10;
      }),
    ).toBe(true);
    await name.dispatchEvent('compositionend', { data: 'kept' });

    await setHarness(page, { externalName: 'stable.json', externalText: changedDoc() });
    await page.getByRole('button', { name: 'Add JSON', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Added');
    await expect(page.getByLabel('Project imports').locator('option')).toHaveCount(1);
    await page.evaluate(() => {
      const globals = globalThis as unknown as Record<string, unknown>;
      const stable = globals['__stableProjectDom'] as Record<string, Element | null>;
      stable['firstImport'] = document.querySelector('.project-imports option');
      globals['__firstImportValue'] = document.querySelector<HTMLOptionElement>('.project-imports option')?.value;
    });
    await page.getByRole('button', { name: 'Refresh imports', exact: true }).click();
    expect(
      await page.evaluate(() => {
        const globals = globalThis as unknown as Record<string, unknown>;
        const stable = globals['__stableProjectDom'] as Record<string, Element | null>;
        return {
          name: stable['name'] === document.querySelector('.project-name'),
          imports: stable['imports'] === document.querySelector('.project-imports'),
          exports: stable['exports'] === document.querySelector('.project-exports'),
          firstImport: stable['firstImport'] === document.querySelector('.project-imports option'),
          valuesSame:
            globals['__firstImportValue'] !== '' &&
            globals['__firstImportValue'] ===
              document.querySelector<HTMLOptionElement>('.project-imports option')?.value,
        };
      }),
    ).toEqual({
      name: true,
      imports: true,
      exports: true,
      firstImport: true,
      valuesSame: true,
    });
  } finally {
    await cleanup(page, rootName);
  }
});

test('hostile manifest ids stay exact, inert, accessible, and collision-visible', async ({ page }) => {
  const rootName = await installHarness(page);
  try {
    await page.setViewportSize({ width: 1680, height: 1000 });
    await boot(page);
    await page.getByLabel('Project name').fill('Same Project');
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Created project.');

    const fixtures = [
      `project-${String.fromCharCode(0x200b)}alpha`,
      `same${String.fromCharCode(0x2060)}id`,
      `caf${String.fromCharCode(0x00e9)}`,
      `cafe${String.fromCharCode(0x0301)}`,
      `a${String.fromCharCode(0x202e)}b`,
      'a b',
      'a\nb',
      'a\\b',
      '<script>',
      String.fromCharCode(0xd800),
      String.fromCharCode(0xd83d, 0xde00),
    ];
    for (const rawId of fixtures) {
      await rewriteManifestIdentity(page, rootName, rawId, 'Same Project');
      await page.getByRole('button', { name: 'Open Project', exact: true }).click();
      await expect.poll(() => currentManifestId(page)).toBe(rawId);
      const escaped = escapeForPresentation(rawId);
      expect(await displayedProjectId(page)).toBe(escaped);
      await expect(page.locator('.project-identity')).toHaveAccessibleName(
        `Project Same Project. Project ID ${escaped}.`,
      );
      await expect(page.locator('.project-identity')).not.toHaveAttribute('title', /.+/u);
      expect(
        await page.evaluate(
          ({ raw, formatted }) => ({
            rawIdUsed: Array.from(document.querySelectorAll<HTMLElement>('[id]'))
              .some((element) => element.id === raw),
            formattedIdUsed: Array.from(document.querySelectorAll<HTMLElement>('[id]'))
              .some((element) => element.id === formatted),
            scriptDescendant: document.querySelector('#project-rail script') !== null,
            direction: getComputedStyle(document.querySelector('.project-id-full') as Element).direction,
          }),
          { raw: rawId, formatted: escaped },
        ),
      ).toEqual({ rawIdUsed: false, formattedIdUsed: false, scriptDescendant: false, direction: 'ltr' });
    }

    const left = 'ABCDEFGH-middle-left-IJKLMNOP';
    const right = 'ABCDEFGH-middle-right-IJKLMNOP';
    await rewriteManifestIdentity(page, rootName, left, 'Same Project');
    await page.getByRole('button', { name: 'Open Project', exact: true }).click();
    await page.getByRole('button', { name: 'Collapse project rail', exact: true }).click();
    const leftToken = await page.locator('.project-id-compact').textContent();
    await page.getByRole('button', { name: 'Show project rail', exact: true }).click();

    await rewriteManifestIdentity(page, rootName, right, 'Same Project');
    await page.getByRole('button', { name: 'Open Project', exact: true }).click();
    const persistedBeforePresentation = await readManifestText(page, rootName);
    await page.getByRole('button', { name: 'Collapse project rail', exact: true }).click();
    const rightToken = await page.locator('.project-id-compact').textContent();
    expect(leftToken).toBe('ABCDEFGH...IJKLMNOP');
    expect(rightToken).not.toBe(leftToken);
    expect(rightToken).toContain(';len=');
    expect([...(rightToken ?? '')].every((char) => {
      const unit = char.charCodeAt(0);
      return unit >= 0x21 && unit <= 0x7e;
    })).toBe(true);
    await expect(page.locator('.project-compact-identity')).toHaveAccessibleName(
      `Project Same Project. Project ID ${escapeForPresentation(right)}.`,
    );
    await page.getByRole('button', { name: 'Show project rail', exact: true }).click();
    expect(await readManifestText(page, rootName)).toBe(persistedBeforePresentation);

    const maximumId = String.fromCharCode(0x200b).repeat(100_000);
    await rewriteManifestIdentity(page, rootName, maximumId, 'Same Project');
    const hostileStartedAt = await page.evaluate(() => performance.now());
    await page.getByRole('button', { name: 'Open Project', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const hooks = (globalThis as unknown as Record<string, unknown>)['__visualSpecs'] as {
            project(): { manifestProjectId: string | null };
          };
          const id = hooks.project().manifestProjectId;
          return { length: id?.length ?? -1, first: id?.charCodeAt(0) ?? -1 };
        }),
      )
      .toEqual({ length: 100_000, first: 0x200b });
    const hostileElapsedMs = await page.evaluate(
      (startedAt) =>
        new Promise<number>((resolve) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve(performance.now() - startedAt)),
          );
        }),
      hostileStartedAt,
    );
    expect(hostileElapsedMs).toBeLessThan(2_000);
    const hostileDom = await page.locator('.project-id-full').evaluate((element) => {
      const text = element.textContent ?? '';
      const lines = text.split('\n');
      const normalized = lines.join('');
      return {
        textLength: text.length,
        normalizedLength: normalized.length,
        childCount: element.childElementCount,
        atomCount: Number((element as HTMLElement).dataset['atomCount'] ?? '0'),
        lineCount: Number((element as HTMLElement).dataset['lineCount'] ?? '0'),
        actualLineCount: lines.length,
        maxLineLength: Math.max(0, ...lines.map((line) => line.length)),
        atomSafeLines: lines.every((line) => /^(?:\\u[0-9A-F]{4}){1,4}$/u.test(line)),
        first: normalized.slice(0, 12),
        last: normalized.slice(-12),
      };
    });
    expect(hostileDom).toEqual({
      textLength: 624_999,
      normalizedLength: 600_000,
      childCount: 0,
      atomCount: 100_000,
      lineCount: 25_000,
      actualLineCount: 25_000,
      maxLineLength: 24,
      atomSafeLines: true,
      first: '\\u200B\\u200B',
      last: '\\u200B\\u200B',
    });
    const hostileA11y = await page.locator('#project-identity-expanded-label').evaluate((element) => ({
      length: element.textContent?.length ?? -1,
      startsCorrectly: element.textContent?.startsWith('Project Same Project. Project ID \\u200B') ?? false,
      endsCorrectly: element.textContent?.endsWith('\\u200B.') ?? false,
    }));
    expect(hostileA11y).toEqual({
      length: 'Project Same Project. Project ID '.length + 600_000 + 1,
      startsCorrectly: true,
      endsCorrectly: true,
    });
    const containment = await page.locator('#project-rail').evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      overflowY: getComputedStyle(element).overflowY,
    }));
    expect(containment.scrollWidth).toBeLessThanOrEqual(containment.clientWidth);
    expect(containment.overflowY).toBe('auto');
  } finally {
    await cleanup(page, rootName);
  }
});

test('global map shortcuts are isolated from every interactive target family', async ({ page }) => {
  const rootName = await installHarness(page);
  try {
    await page.setViewportSize({ width: 1680, height: 1000 });
    await boot(page);
    await page.getByLabel('Project name').fill('Shortcut isolation');
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Created project.');

    await page.evaluate(() => {
      const rail = document.querySelector('#project-rail');
      if (rail === null) throw new Error('Project Rail is missing');
      const add = (tag: string, id: string, attrs: Record<string, string> = {}): HTMLElement => {
        const node = document.createElement(tag);
        node.id = id;
        for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
        node.textContent = id;
        rail.appendChild(node);
        return node;
      };
      add('textarea', 'shortcut-textarea');
      const select = add('select', 'shortcut-select') as HTMLSelectElement;
      select.appendChild(new Option('save', 'save'));
      add('button', 'shortcut-button', { type: 'button' });
      add('a', 'shortcut-link', { href: '#shortcut-target' });
      add('div', 'shortcut-editable', { contenteditable: 'true', tabindex: '0' });
      add('div', 'shortcut-combobox', { role: 'combobox', tabindex: '0' });
      add('div', 'shortcut-listbox', { role: 'listbox', tabindex: '0' });
      add('div', 'shortcut-option', { role: 'option', tabindex: '0' });

      const globals = globalThis as unknown as Record<string, unknown>;
      const hooks = globals['__visualSpecs'] as {
        scene(): unknown;
        viewport(): unknown;
        interaction(): unknown;
        layout(): Record<string, unknown>;
      };
      const layout = hooks.layout();
      globals['__shortcutBaseline'] = {
        scene: hooks.scene(),
        viewport: JSON.stringify(hooks.viewport()),
        interaction: JSON.stringify(hooks.interaction()),
        preferences: JSON.stringify({
          projectPreference: layout['projectPreference'],
          sidebarPreference: layout['sidebarPreference'],
          detailPreference: layout['detailPreference'],
          projectOpen: layout['projectOpen'],
          sidebarOpen: layout['sidebarOpen'],
          detailOpen: layout['detailOpen'],
        }),
      };
    });
    const diskBefore = await readDisk(page, rootName);
    const callsBefore = {
      directory: await harnessValue<number>(page, 'directoryCalls'),
      open: await harnessValue<number>(page, 'openCalls'),
      save: await harnessValue<number>(page, 'saveCalls'),
    };
    const targets = [
      '.project-name',
      '#shortcut-textarea',
      '#shortcut-select',
      '#shortcut-button',
      '#shortcut-link',
      '#shortcut-editable',
      '#shortcut-combobox',
      '#shortcut-listbox',
      '#shortcut-option',
    ];
    const keys = ['f', 'e', 'c', 'r', 's', 'Shift+=', '-', '[', ']', '/'];
    for (const selector of targets) {
      const target = page.locator(selector);
      await target.focus();
      for (const key of keys) await page.keyboard.press(key);
      await expect(target).toBeFocused();
    }

    expect(
      await page.evaluate(() => {
        const globals = globalThis as unknown as Record<string, unknown>;
        const hooks = globals['__visualSpecs'] as {
          scene(): unknown;
          viewport(): unknown;
          interaction(): unknown;
          layout(): Record<string, unknown>;
        };
        const baseline = globals['__shortcutBaseline'] as Record<string, unknown>;
        const layout = hooks.layout();
        return {
          scene: hooks.scene() === baseline['scene'],
          viewport: JSON.stringify(hooks.viewport()) === baseline['viewport'],
          interaction: JSON.stringify(hooks.interaction()) === baseline['interaction'],
          preferences:
            JSON.stringify({
              projectPreference: layout['projectPreference'],
              sidebarPreference: layout['sidebarPreference'],
              detailPreference: layout['detailPreference'],
              projectOpen: layout['projectOpen'],
              sidebarOpen: layout['sidebarOpen'],
              detailOpen: layout['detailOpen'],
            }) === baseline['preferences'],
        };
      }),
    ).toEqual({ scene: true, viewport: true, interaction: true, preferences: true });
    expect({
      directory: await harnessValue<number>(page, 'directoryCalls'),
      open: await harnessValue<number>(page, 'openCalls'),
      save: await harnessValue<number>(page, 'saveCalls'),
    }).toEqual(callsBefore);
    const diskAfter = await readDisk(page, rootName);
    expect(diskAfter.currentText).toBe(diskBefore.currentText);
    expect(diskAfter.imports).toEqual(diskBefore.imports);
    expect(diskAfter.exports).toEqual(diskBefore.exports);
    expect(diskAfter.backups).toEqual(diskBefore.backups);
  } finally {
    await cleanup(page, rootName);
  }
});

test('invalid temporary JSON reports an action error without hiding trust banners', async ({ page }, testInfo) => {
  const rootName = await installHarness(page);
  try {
    await page.setViewportSize({ width: 800, height: 800 });
    await boot(page);
    await page.locator('#import-input').setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{not json', 'utf8'),
    });
    await expect(page.locator('.action-error')).toContainText('Open temporary JSON failed');
    await expect(page.locator('.banner.coverage')).toBeVisible();
    await expect(page.locator('.banner.unresolved')).toBeVisible();
    expect(await isElementTopmostAtCenter(page, '.action-error')).toBe(true);
    expect(await isElementTopmostAtCenter(page, '.banner.coverage')).toBe(true);
    await expect(page.locator('#project-rail')).toBeVisible();
    expect(await page.locator('#project-rail').evaluate((element) => getComputedStyle(element).position)).not.toBe('absolute');
    await captureReviewEvidence(page, testInfo, 'project-rail-action-error-with-trust-banners');
  } finally {
    await cleanup(page, rootName);
  }
});

test('the 1664/1200 transition table preserves preferences and Narrow Escape focus', async ({ page }, testInfo) => {
  const rootName = await installHarness(page);
  try {
    await page.setViewportSize({ width: 1024, height: 768 });
    await boot(page);
    const rail = page.locator('#project-rail');
    const toolbar = page.locator('.toolbar');
    const initialRail = await rail.boundingBox();
    const initialToolbar = await toolbar.boundingBox();
    expect(initialRail).not.toBeNull();
    expect((initialRail?.y ?? 0) + (initialRail?.height ?? 0)).toBeLessThanOrEqual(
      (initialToolbar?.y ?? 0) + 1,
    );
    expect(await rail.evaluate((element) => getComputedStyle(element).position)).not.toBe('absolute');
    expect((await page.locator('.canvas-host canvas').boundingBox())?.width).toBeGreaterThan(920);

    await page.getByLabel('Project name').fill('Responsive Project');
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Created project.');
    await expect.poll(() => readProjectLayout(page)).toMatchObject({
      band: 'narrow',
      activeOverlay: 'project',
      projectOpen: true,
      sidebarOpen: false,
      detailOpen: false,
    });
    expect(await rail.evaluate((element) => getComputedStyle(element).position)).toBe('absolute');
    expect((await rail.boundingBox())?.width).toBeCloseTo(232, 0);
    const canvas = await page.locator('.canvas-host canvas').boundingBox();
    const overlay = await rail.boundingBox();
    expect((canvas?.x ?? 0) + (canvas?.width ?? 0) - ((overlay?.x ?? 0) + (overlay?.width ?? 0))).toBeGreaterThan(350);
    await captureReviewEvidence(page, testInfo, 'project-rail-overlay-1024x768');

    const name = page.getByLabel('Project name');
    await name.focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#show-project-rail')).toBeFocused();
    await expect(rail).toBeHidden();
    await expect.poll(() => readProjectLayout(page)).toMatchObject({ activeOverlay: null });
    expect((await page.locator('.canvas-host canvas').boundingBox())?.width).toBeGreaterThan(920);

    await page.locator('#toggle-sidebar').click();
    await expect.poll(() => readProjectLayout(page)).toMatchObject({
      activeOverlay: 'sidebar',
      sidebarOpen: true,
      projectOpen: false,
      sidebarPreference: 'open',
    });
    await page.locator('#show-project-rail').click();
    await expect.poll(() => readProjectLayout(page)).toMatchObject({
      activeOverlay: 'project',
      projectOpen: true,
      sidebarOpen: false,
      sidebarPreference: 'open',
    });

    for (const [width, expectedBand] of [
      [1199, 'narrow'],
      [1200, 'hybrid'],
      [1663, 'hybrid'],
      [1664, 'wide'],
    ] as const) {
      await page.setViewportSize({ width, height: 800 });
      await waitForLayoutPaint(page);
      const layout = await readProjectLayout(page);
      expect(layout.band).toBe(expectedBand);
      expect(layout.projectPreference).toBe('expanded');
      expect(layout.sidebarPreference).toBe('open');
      expect(layout.detailPreference).toBe('open');
      expect([layout.activeOverlay].filter((surface) => surface !== null)).toHaveLength(
        expectedBand === 'wide' ? 0 : 1,
      );
    }
    await expect.poll(() => readProjectLayout(page)).toMatchObject({
      band: 'wide',
      activeOverlay: null,
      projectOpen: true,
      sidebarOpen: true,
      detailOpen: true,
    });

    await page.getByRole('button', { name: 'Collapse project rail', exact: true }).click();
    await page.setViewportSize({ width: 1663, height: 800 });
    await waitForLayoutPaint(page);
    await expect.poll(() => readProjectLayout(page)).toMatchObject({
      band: 'hybrid',
      projectPreference: 'collapsed',
      activeOverlay: null,
      projectOpen: false,
      sidebarOpen: true,
      detailOpen: true,
    });
    await page.locator('#show-project-rail').click();
    await expect.poll(() => readProjectLayout(page)).toMatchObject({
      projectPreference: 'expanded',
      activeOverlay: 'project',
      sidebarPreference: 'open',
      sidebarOpen: false,
      detailOpen: true,
    });

    await page.setViewportSize({ width: 1024, height: 768 });
    await waitForLayoutPaint(page);
    await page.locator('#import-input').setInputFiles({
      name: 'temporary.json',
      mimeType: 'application/json',
      buffer: Buffer.from(sampleDoc(), 'utf8'),
    });
    await expect.poll(() => currentManifestId(page)).toBeNull();
    await expect.poll(() => readProjectLayout(page)).toMatchObject({
      band: 'narrow',
      activeOverlay: null,
      projectOpen: true,
      projectPreference: 'expanded',
      sidebarPreference: 'open',
      detailPreference: 'open',
    });
    expect(await rail.evaluate((element) => getComputedStyle(element).position)).not.toBe('absolute');
    expect(
      await page.evaluate(() => ({
        horizontal: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        vertical: document.documentElement.scrollHeight <= document.documentElement.clientHeight,
      })),
    ).toEqual({ horizontal: true, vertical: true });
    await captureReviewEvidence(page, testInfo, 'project-rail-inline-1024x768');
  } finally {
    await cleanup(page, rootName);
  }
});

test('Hybrid Project overlay preserves a real selected edge and docked Details evidence', async ({ page }, testInfo) => {
  const rootName = await installHarness(page);
  try {
    await page.setViewportSize({ width: 1663, height: 1000 });
    await boot(page);
    await page.getByLabel('Project name').fill('Hybrid evidence');
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Created project.');
    await page.getByRole('button', { name: 'Collapse project rail', exact: true }).click();
    await expect(page.locator('#show-project-rail')).toBeFocused();
    await expect(page.locator('#toggle-sidebar')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#explorer-panel')).toBeVisible();
    await expect(page.locator('#details-panel')).toBeVisible();

    const beforeScene = await readProjectScene(page);
    const edge = beforeScene.scene.edges.find((candidate) => candidate.kind === 'tauri-command' && !candidate.hidden);
    expect(edge).toBeDefined();
    if (edge === undefined) throw new Error('no visible tauri-command edge');
    const route = routeEdges(beforeScene.scene as unknown as RenderScene).get(edge.id);
    expect(route).toBeDefined();
    if (route === undefined) throw new Error('no routed edge');
    await clickProjectWorld(page, route.mid, beforeScene.viewport);
    await expect(page.locator('.detail .confidence').first()).toBeVisible();
    await expect(page.locator('.detail .evidence code').first()).toBeVisible();
    const baseline = {
      interaction: await readProjectInteraction(page),
      confidence: await page.locator('.detail .confidence').allTextContents(),
      evidence: await page.locator('.detail .evidence code').allTextContents(),
    };

    await page.locator('#show-project-rail').click();
    await expect.poll(() => readProjectLayout(page)).toMatchObject({
      band: 'hybrid',
      activeOverlay: 'project',
      projectOpen: true,
      sidebarPreference: 'open',
      sidebarOpen: false,
      detailOpen: true,
    });
    await expect(page.locator('#toggle-sidebar')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#explorer-panel')).toBeHidden();
    await expect(page.locator('#details-panel')).toBeVisible();
    expect(await readProjectInteraction(page)).toEqual(baseline.interaction);
    expect(await page.locator('.detail .confidence').allTextContents()).toEqual(baseline.confidence);
    expect(await page.locator('.detail .evidence code').allTextContents()).toEqual(baseline.evidence);
    expect(await isElementTopmostAtCenter(page, '.banner.coverage')).toBe(true);
    await captureReviewEvidence(page, testInfo, 'project-rail-hybrid-1663-explorer-suppressed');

    await page.locator('#toggle-detail').click();
    await expect.poll(() => readProjectLayout(page)).toMatchObject({
      activeOverlay: 'project',
      projectOpen: true,
      detailOpen: false,
    });
    await page.locator('#toggle-detail').click();
    await expect.poll(() => readProjectLayout(page)).toMatchObject({
      activeOverlay: 'project',
      projectOpen: true,
      detailPreference: 'open',
      detailOpen: true,
    });
    expect(await readProjectInteraction(page)).toEqual(baseline.interaction);
    expect(await page.locator('.detail .confidence').allTextContents()).toEqual(baseline.confidence);
    expect(await page.locator('.detail .evidence code').allTextContents()).toEqual(baseline.evidence);

    await page.getByLabel('Project name').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#show-project-rail')).toBeFocused();
    await expect.poll(() => readProjectLayout(page)).toMatchObject({
      activeOverlay: null,
      projectOpen: false,
      sidebarPreference: 'open',
      sidebarOpen: true,
      detailOpen: true,
    });
    await expect(page.locator('#toggle-sidebar')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#explorer-panel')).toBeVisible();
    expect(await readProjectInteraction(page)).toEqual(baseline.interaction);
    expect(await page.locator('.detail .confidence').allTextContents()).toEqual(baseline.confidence);
    expect(await page.locator('.detail .evidence code').allTextContents()).toEqual(baseline.evidence);

    const afterScene = await readProjectScene(page);
    const afterRoute = routeEdges(afterScene.scene as unknown as RenderScene).get(edge.id);
    if (afterRoute === undefined) throw new Error('selected edge route disappeared');
    await clickProjectWorld(page, afterRoute.mid, afterScene.viewport);
    expect((await readProjectInteraction(page)).selection.edgeId).toBe(edge.id);

    // A Narrow Details opener must not leak through Wide into the next Hybrid
    // Project overlay. The breakpoint transition binds Project's replacement
    // opener explicitly before Escape can consume it.
    await page.setViewportSize({ width: 1199, height: 900 });
    await waitForLayoutPaint(page);
    await page.locator('#toggle-detail').click();
    await expect.poll(() => readProjectLayout(page)).toMatchObject({
      band: 'narrow',
      activeOverlay: 'detail',
      detailOpen: true,
    });
    await page.setViewportSize({ width: 1664, height: 900 });
    await waitForLayoutPaint(page);
    await expect.poll(() => readProjectLayout(page)).toMatchObject({
      band: 'wide',
      activeOverlay: null,
      projectOpen: false,
      sidebarOpen: true,
      detailOpen: true,
    });
    await page.locator('#show-project-rail').click();
    await page.setViewportSize({ width: 1663, height: 900 });
    await waitForLayoutPaint(page);
    await expect.poll(() => readProjectLayout(page)).toMatchObject({
      band: 'hybrid',
      activeOverlay: 'project',
      projectOpen: true,
      sidebarOpen: false,
      detailOpen: true,
    });
    await page.getByLabel('Project name').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#show-project-rail')).toBeFocused();
    await expect.poll(() => readProjectLayout(page)).toMatchObject({
      activeOverlay: null,
      projectOpen: false,
      sidebarPreference: 'open',
      sidebarOpen: true,
      detailPreference: 'open',
      detailOpen: true,
    });
    expect(await readProjectInteraction(page)).toEqual(baseline.interaction);
    expect(await page.locator('.detail .confidence').allTextContents()).toEqual(baseline.confidence);
    expect(await page.locator('.detail .evidence code').allTextContents()).toEqual(baseline.evidence);
  } finally {
    await cleanup(page, rootName);
  }
});

test('rail reflow reaches painted DPR 1/2 endpoints, coalesces bursts, and remains interactive', async ({ browser }, testInfo) => {
  const evidence: Array<Record<string, unknown>> = [];
  for (const deviceScaleFactor of [1, 2]) {
    const context = await browser.newContext({
      baseURL: 'http://localhost:5175',
      viewport: { width: 1680, height: 1000 },
      deviceScaleFactor,
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const rootName = await installHarness(page);
    try {
      await boot(page);
      await page.getByLabel('Project name').fill(`DPR ${deviceScaleFactor}`);
      await page.getByRole('button', { name: 'Create Project', exact: true }).click();
      await expect(page.locator('.project-message')).toContainText('Created project.');
      await waitForLayoutPaint(page);

      const expanded = await canvasMetrics(page);
      expect(expanded.cssWidth).toBeGreaterThanOrEqual(800);
      expect(expanded.backingWidth).toBe(Math.round(expanded.clientWidth * deviceScaleFactor));
      expect(expanded.backingHeight).toBe(Math.round(expanded.clientHeight * deviceScaleFactor));
      expect(Math.abs(expanded.backingWidth - expanded.cssWidth * deviceScaleFactor)).toBeLessThanOrEqual(1);
      expect(Math.abs(expanded.backingHeight - expanded.cssHeight * deviceScaleFactor)).toBeLessThanOrEqual(1);
      expect(expanded.inkCoverage).toBeGreaterThan(0.005);
      const timingStart = (await readProjectLayout(page)).timings.length;
      await page.evaluate(() => {
        const globals = globalThis as unknown as Record<string, unknown>;
        const hooks = globals['__visualSpecs'] as {
          scene(): unknown;
          viewport(): unknown;
          interaction(): unknown;
        };
        globals['__performanceBaseline'] = {
          scene: hooks.scene(),
          viewport: JSON.stringify(hooks.viewport()),
          interaction: JSON.stringify(hooks.interaction()),
        };
      });

      for (let iteration = 0; iteration < 12; iteration += 1) {
        const selector = iteration % 2 === 0 ? '#collapse-project-rail' : '#show-project-rail';
        await page.locator(selector).click();
        await waitForLayoutPaint(page);
      }
      const repeatedLayout = await readProjectLayout(page);
      const durations = repeatedLayout.timings
        .slice(timingStart)
        .map((timing) => timing.durationMs);
      expect(durations.length).toBeGreaterThanOrEqual(12);
      const p50 = percentile(durations, 0.5);
      const p95 = percentile(durations, 0.95);
      const worst = Math.max(...durations);
      expect(p95).toBeLessThan(100);
      expect(worst).toBeLessThan(100);

      await page.evaluate(() => {
        const collapse = document.querySelector<HTMLButtonElement>('#collapse-project-rail');
        const show = document.querySelector<HTMLButtonElement>('#show-project-rail');
        if (collapse === null || show === null) throw new Error('Project Rail toggles are missing');
        for (let iteration = 0; iteration < 22; iteration += 1) {
          (iteration % 2 === 0 ? collapse : show).click();
        }
      });
      await waitForLayoutPaint(page);
      await expect.poll(async () => (await readProjectLayout(page)).pendingFrames).toEqual({
        resize: false,
        paint: false,
        focus: false,
      });
      await expect(page.locator('#project-rail')).toBeVisible();
      await expect(page.locator('#collapse-project-rail')).toHaveAttribute('aria-expanded', 'true');
      const finalMetrics = await canvasMetrics(page);
      expect(finalMetrics.cssWidth).toBeCloseTo(expanded.cssWidth, 0);
      expect(finalMetrics.backingWidth).toBe(Math.round(finalMetrics.clientWidth * deviceScaleFactor));
      expect(finalMetrics.backingHeight).toBe(Math.round(finalMetrics.clientHeight * deviceScaleFactor));
      expect(finalMetrics.inkCoverage).toBeGreaterThan(0.005);
      expect(
        await page.evaluate(() => {
          const globals = globalThis as unknown as Record<string, unknown>;
          const hooks = globals['__visualSpecs'] as {
            scene(): unknown;
            viewport(): unknown;
            interaction(): unknown;
          };
          const baseline = globals['__performanceBaseline'] as Record<string, unknown>;
          return {
            scene: hooks.scene() === baseline['scene'],
            viewport: JSON.stringify(hooks.viewport()) === baseline['viewport'],
            interaction: JSON.stringify(hooks.interaction()) === baseline['interaction'],
          };
        }),
      ).toEqual({ scene: true, viewport: true, interaction: true });

      const scene = await readProjectScene(page);
      const node = scene.scene.nodes.find((candidate) => candidate.kind === 'application' && !candidate.hidden);
      expect(node).toBeDefined();
      if (node === undefined) throw new Error('no visible application node');
      await clickProjectWorld(page, node.position, scene.viewport);
      expect((await readProjectInteraction(page)).selection.nodeIds).toContain(node.id);
      await page.locator('#collapse-project-rail').click();
      await waitForLayoutPaint(page);
      await page.locator('#show-project-rail').click();
      await waitForLayoutPaint(page);
      expect((await readProjectInteraction(page)).selection.nodeIds).toContain(node.id);

      const beforeZoom = await viewport(page);
      await page.locator('#zoom-in').click();
      expect((await viewport(page)).zoom).toBeGreaterThan(beforeZoom.zoom);
      const beforeDragScene = await readProjectScene(page);
      const dragNode = beforeDragScene.scene.nodes.find((candidate) => candidate.id === node.id);
      if (dragNode === undefined) throw new Error('drag node disappeared');
      await dragProjectNode(page, dragNode.position, beforeDragScene.viewport, { x: 28, y: 22 });
      const afterDragScene = await readProjectScene(page);
      const moved = afterDragScene.scene.nodes.find((candidate) => candidate.id === node.id);
      expect(moved?.position).not.toEqual(dragNode.position);

      evidence.push({
        deviceScaleFactor,
        expanded,
        finalMetrics,
        samples: durations.length,
        p50,
        p95,
        worst,
        rapidToggleCount: 22,
        pageErrors,
      });
      expect(pageErrors).toEqual([]);
    } finally {
      await cleanup(page, rootName);
      await context.close();
    }
  }
  const evidencePath = testInfo.outputPath('project-rail-performance.json');
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
  await testInfo.attach('project-rail-performance.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
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
        saveActivations: [] as boolean[],
        saveNames: [] as string[],
        openCalls: 0,
        openActivations: [] as boolean[],
        fileReads: [] as string[],
        fileWrites: [] as string[],
        cancelNextDirectory: false,
        externalName: 'incoming.json',
        externalText: '{"formatVersion":"1.0","nodes":[],"edges":[]}',
      };
      globals['__projectUiHarness'] = harness;

      const originalGetFile = FileSystemFileHandle.prototype.getFile;
      FileSystemFileHandle.prototype.getFile = function (this: FileSystemFileHandle): Promise<File> {
        harness.fileReads.push(this.name);
        return originalGetFile.call(this);
      };
      const originalCreateWritable = FileSystemFileHandle.prototype.createWritable;
      FileSystemFileHandle.prototype.createWritable = function (
        this: FileSystemFileHandle,
        options?: FileSystemCreateWritableOptions,
      ): Promise<FileSystemWritableFileStream> {
        harness.fileWrites.push(this.name);
        return originalCreateWritable.call(this, options);
      };

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
          harness.openActivations.push(navigator.userActivation.isActive);
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
          harness.saveActivations.push(navigator.userActivation.isActive);
          const opfs = await navigator.storage.getDirectory();
          const root = await opfs.getDirectoryHandle(injectedRoot, { create: true });
          const fileName = `save-${harness.saveCalls}-${picker.suggestedName ?? 'export.json'}`;
          harness.saveNames.push(fileName);
          return root.getFileHandle(fileName, {
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

async function injectInvalidTemporary(page: Page): Promise<void> {
  await page.locator('#import-input').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{not json', 'utf8'),
  });
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

async function rawDocument(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const hooks = (globalThis as unknown as Record<string, unknown>)['__visualSpecs'] as {
      raw(): Record<string, unknown>;
    };
    return hooks.raw();
  });
}

async function activeFocusSafety(
  page: Page,
): Promise<{ body: boolean; hiddenSubtree: boolean }> {
  return page.evaluate(() => {
    const active = document.activeElement;
    return {
      body: active === document.body,
      hiddenSubtree: active instanceof HTMLElement && active.closest('[hidden]') !== null,
    };
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

async function readProjectExportText(
  page: Page,
  rootName: string,
  fileName: string,
): Promise<string> {
  return page.evaluate(async ({ name, file }) => {
    const opfs = await navigator.storage.getDirectory();
    const root = await opfs.getDirectoryHandle(name);
    const project = await root.getDirectoryHandle('.visual-specs');
    const exportsDir = await project.getDirectoryHandle('exports');
    return (await (await exportsDir.getFileHandle(file)).getFile()).text();
  }, { name: rootName, file: fileName });
}

async function readRootFileText(page: Page, rootName: string, fileName: string): Promise<string> {
  return page.evaluate(async ({ name, file }) => {
    const opfs = await navigator.storage.getDirectory();
    const root = await opfs.getDirectoryHandle(name);
    return (await (await root.getFileHandle(file)).getFile()).text();
  }, { name: rootName, file: fileName });
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

async function writeMatchingAutosave(
  page: Page,
  rootName: string,
  recoveryViewport = { x: 10, y: 20, zoom: 1.5 },
): Promise<void> {
  await page.evaluate(async ({ name, viewport: savedViewport }) => {
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
        view: { viewport: savedViewport },
      }),
    );
    await writable.close();
  }, { name: rootName, viewport: recoveryViewport });
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

async function rewriteManifestIdentity(
  page: Page,
  rootName: string,
  id: string,
  name: string,
): Promise<void> {
  await page.evaluate(
    async ({ rootName: root, id: projectId, name: projectName }) => {
      const opfs = await navigator.storage.getDirectory();
      const rootHandle = await opfs.getDirectoryHandle(root);
      const project = await rootHandle.getDirectoryHandle('.visual-specs');
      const manifestHandle = await project.getFileHandle('project.json');
      const manifest = JSON.parse(await (await manifestHandle.getFile()).text()) as Record<string, unknown>;
      const identity = manifest['project'] as Record<string, unknown>;
      identity['id'] = projectId;
      identity['name'] = projectName;
      identity['updatedAtUtc'] = '2026-07-14T05:00:00.000Z';
      const writable = await manifestHandle.createWritable();
      await writable.write(JSON.stringify(manifest));
      await writable.close();
    },
    { rootName, id, name },
  );
}

async function readManifestText(page: Page, rootName: string): Promise<string> {
  return page.evaluate(async (name) => {
    const opfs = await navigator.storage.getDirectory();
    const root = await opfs.getDirectoryHandle(name);
    const project = await root.getDirectoryHandle('.visual-specs');
    return (await (await project.getFileHandle('project.json')).getFile()).text();
  }, rootName);
}

async function currentManifestId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const hooks = (globalThis as unknown as Record<string, unknown>)['__visualSpecs'] as {
      project(): { manifestProjectId: string | null };
    };
    return hooks.project().manifestProjectId;
  });
}

async function displayedProjectId(page: Page): Promise<string> {
  return page.locator('.project-id-full').evaluate((element) =>
    (element.textContent ?? '').replaceAll('\n', ''),
  );
}

function countNamed(values: readonly string[], name: string): number {
  return values.filter((value) => value === name).length;
}

function commitWriteCounts(values: readonly string[]): {
  current: number;
  manifest: number;
  backup: number;
} {
  return {
    current: countNamed(values, 'current.json'),
    manifest: countNamed(values, 'project.json'),
    backup: values.filter((value) => /_current(?:-\d+)?\.json$/u.test(value)).length,
  };
}

function projectSafetyState(state: ProjectControllerState): Record<string, unknown> {
  return {
    sessionKind: state.sessionKind,
    manifestProjectId: state.manifestProjectId,
    projectKey: state.projectKey,
    access: state.access,
    dirty: state.dirty,
    projectDirty: state.projectDirty,
    hasDiscardableChanges: state.hasDiscardableChanges,
    previewing: state.previewing,
    needsRepair: state.needsRepair,
    pendingAutosave: state.pendingAutosave,
    corruptAutosaveIgnored: state.corruptAutosaveIgnored,
    lifecycleBusy: state.lifecycleBusy,
  };
}

async function readProjectState(page: Page): Promise<ProjectControllerState> {
  return page.evaluate(() => {
    const hooks = (globalThis as unknown as Record<string, unknown>)['__visualSpecs'] as {
      project(): ProjectControllerState;
    };
    return hooks.project();
  });
}

async function readProjectActions(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const hooks = (globalThis as unknown as Record<string, unknown>)['__visualSpecs'] as {
      projectActions(): Record<string, number>;
    };
    return hooks.projectActions();
  });
}

async function readProjectLayout(page: Page): Promise<ProjectLayoutState> {
  return page.evaluate(() => {
    const hooks = (globalThis as unknown as Record<string, unknown>)['__visualSpecs'] as {
      layout(): ProjectLayoutState;
    };
    return hooks.layout();
  });
}

async function readProjectInteraction(page: Page): Promise<ProjectInteractionState> {
  return page.evaluate(() => {
    const hooks = (globalThis as unknown as Record<string, unknown>)['__visualSpecs'] as {
      interaction(): ProjectInteractionState;
    };
    return hooks.interaction();
  });
}

async function readProjectScene(page: Page): Promise<ProjectSceneState> {
  return page.evaluate(() => {
    const hooks = (globalThis as unknown as Record<string, unknown>)['__visualSpecs'] as {
      scene(): ProjectSceneState['scene'];
      viewport(): ProjectSceneState['viewport'];
    };
    return { scene: hooks.scene(), viewport: hooks.viewport() };
  });
}

async function clickProjectWorld(
  page: Page,
  world: { x: number; y: number },
  viewportState: { x: number; y: number; zoom: number },
): Promise<void> {
  const box = await page.locator('.canvas-host canvas').boundingBox();
  if (box === null) throw new Error('canvas is missing');
  await page.mouse.click(
    box.x + (world.x - viewportState.x) * viewportState.zoom,
    box.y + (world.y - viewportState.y) * viewportState.zoom,
  );
  await page.waitForTimeout(220);
}

async function dragProjectNode(
  page: Page,
  world: { x: number; y: number },
  viewportState: { x: number; y: number; zoom: number },
  delta: { x: number; y: number },
): Promise<void> {
  const box = await page.locator('.canvas-host canvas').boundingBox();
  if (box === null) throw new Error('canvas is missing');
  const start = {
    x: box.x + (world.x - viewportState.x) * viewportState.zoom,
    y: box.y + (world.y - viewportState.y) * viewportState.zoom,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(220);
}

async function canvasMetrics(page: Page): Promise<{
  cssWidth: number;
  cssHeight: number;
  clientWidth: number;
  clientHeight: number;
  backingWidth: number;
  backingHeight: number;
  inkCoverage: number;
}> {
  return page.locator('.canvas-host canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('canvas context is missing');
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let sampled = 0;
    let ink = 0;
    for (let y = 0; y < canvas.height; y += 8) {
      for (let x = 0; x < canvas.width; x += 8) {
        const offset = (y * canvas.width + x) * 4;
        const red = pixels[offset] ?? 0;
        const green = pixels[offset + 1] ?? 0;
        const blue = pixels[offset + 2] ?? 0;
        sampled += 1;
        if (Math.abs(red - 11) > 6 || Math.abs(green - 14) > 6 || Math.abs(blue - 22) > 6) {
          ink += 1;
        }
      }
    }
    return {
      cssWidth: rect.width,
      cssHeight: rect.height,
      clientWidth: canvas.clientWidth,
      clientHeight: canvas.clientHeight,
      backingWidth: canvas.width,
      backingHeight: canvas.height,
      inkCoverage: sampled === 0 ? 0 : ink / sampled,
    };
  });
}

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return Number.NaN;
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(ordered.length * quantile) - 1);
  return ordered[index] ?? ordered.at(-1) ?? Number.NaN;
}

async function isElementTopmostAtCenter(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((query) => {
    const target = document.querySelector(query);
    if (!(target instanceof HTMLElement)) return false;
    const rect = target.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === target || (hit !== null && target.contains(hit));
  }, selector);
}

async function captureReviewEvidence(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function waitForLayoutPaint(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }),
  );
}

function escapeForPresentation(raw: string): string {
  let escaped = '';
  for (let index = 0; index < raw.length; index += 1) {
    const unit = raw.charCodeAt(index);
    escaped +=
      unit >= 0x21 && unit <= 0x7e && unit !== 0x5c
        ? String.fromCharCode(unit)
        : `\\u${unit.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return escaped;
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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeRenderer } from '../../src/adapters/fake/FakeRenderer.ts';
import { Controller } from '../../src/app/controller.ts';
import { ProjectController } from '../../src/app/projectController.ts';
import { stateFromLoaded } from '../../src/app/state.ts';
import { autosaveViewText } from '../../src/contract/autosaveView.ts';
import { importDoc } from '../../src/contract/load.ts';
import {
  makeProjectManifest,
  parseProjectManifest,
  projectManifestText,
} from '../../src/contract/projectManifest.ts';
import { computeDocRevision } from '../../src/contract/revision.ts';
import type {
  CommitCurrentInput,
  CreateProjectInput,
  ExportPortableInput,
  ExportResult,
  PickedTextSource,
  ProjectCapabilities,
  ProjectRef,
  ProjectSnapshot,
  ProjectStore,
  StoredDocRef,
  UpdateManifestInput,
} from '../../src/ports/projectStore.ts';
import { docText, node, sampleDoc } from '../support/doc.ts';

function boot(store = new FakeProjectStore()) {
  const renderer = new FakeRenderer();
  const controller = new Controller(renderer, stateFromLoaded(importDoc(sampleDoc())));
  controller.start();
  const project = new ProjectController(controller, store);
  return { controller, project, store };
}

class FakeProjectStore implements ProjectStore {
  ref: ProjectRef = { id: 'fake-project', displayName: 'Fake Project' };
  snapshot: ProjectSnapshot = this.snapshotFor(sampleDoc(), 'readonly');
  commits: CommitCurrentInput[] = [];
  manifestUpdates: UpdateManifestInput[] = [];
  imports: StoredDocRef[] = [];
  exports: StoredDocRef[] = [];
  storedText = sampleDoc();
  picked: PickedTextSource | null = null;
  exportInputs: ExportPortableInput[] = [];
  backups: string[] = [];
  writeStages: string[] = [];
  createStages: string[] = [];
  autosaveWrites = 0;
  denyMethod: 'commit' | 'update' | 'writeImport' | 'export' | 'autosave' | null = null;
  failBackup = false;
  failManifestAfterCurrent = false;

  capabilities(): ProjectCapabilities {
    return {
      kind: 'filesystem',
      secureContext: true,
      canPickDirectory: true,
      canWriteProjectDirectory: true,
      canOpenTemporaryJson: true,
      canSaveFile: true,
    };
  }

  async openProjectRead(): Promise<ProjectSnapshot> {
    return { ...this.snapshot, access: 'readonly' };
  }

  async enableEditing(_ref: ProjectRef): Promise<ProjectSnapshot> {
    return { ...this.snapshot, access: 'readwrite' };
  }

  async createProject(
    prepare: () => CreateProjectInput | Promise<CreateProjectInput>,
  ): Promise<ProjectSnapshot> {
    this.createStages.push('picker');
    const input = await prepare();
    this.createStages.push('prepare');
    this.snapshot = {
      ref: this.ref,
      access: 'readwrite',
      manifestText: input.manifestText,
      currentText: input.currentText,
    };
    return this.snapshot;
  }

  async writeAutosaveView(_ref: ProjectRef, _text: string): Promise<void> {
    if (this.denyMethod === 'autosave') throw permissionDenied();
    this.autosaveWrites += 1;
  }

  async commitCurrent(input: CommitCurrentInput): Promise<void> {
    if (this.denyMethod === 'commit') throw permissionDenied();
    this.commits.push(input);
    const sourceText = input.source === undefined ? undefined : this.storedText;
    const plan = input.prepare(
      { manifestText: this.snapshot.manifestText, currentText: this.snapshot.currentText },
      sourceText,
    );
    if (this.failBackup) {
      this.writeStages.push('backup-attempt');
      throw new Error('backup close failed');
    }
    this.writeStages.push('backup');
    this.backups.push(this.snapshot.currentText);
    this.writeStages.push('current');
    this.snapshot = { ...this.snapshot, currentText: plan.currentText };
    if (this.failManifestAfterCurrent) {
      this.failManifestAfterCurrent = false;
      throw new Error('project.json close failed');
    }
    this.writeStages.push('manifest');
    this.snapshot = { ...this.snapshot, manifestText: plan.manifestText };
  }

  async updateManifest(input: UpdateManifestInput): Promise<void> {
    if (this.denyMethod === 'update') throw permissionDenied();
    this.manifestUpdates.push(input);
    input.verifyFresh({
      manifestText: this.snapshot.manifestText,
      currentText: this.snapshot.currentText,
    });
    this.writeStages.push('manifest');
    this.snapshot = { ...this.snapshot, manifestText: input.manifestText };
  }

  async listStoredDocs(_ref: ProjectRef, area: 'imports' | 'exports'): Promise<readonly StoredDocRef[]> {
    return area === 'imports' ? this.imports : this.exports;
  }

  async readStoredDoc(_ref: ProjectRef, _doc: StoredDocRef): Promise<string> {
    return this.storedText;
  }

  async pickExternalJson(): Promise<PickedTextSource> {
    if (this.picked === null) throw new Error('no picked file');
    return this.picked;
  }

  async writeImport(ref: ProjectRef, suggestedName: string, text: string): Promise<StoredDocRef> {
    if (this.denyMethod === 'writeImport') throw permissionDenied();
    const stored: StoredDocRef = {
      id: `${ref.id}:imports:${suggestedName}`,
      area: 'imports',
      displayName: suggestedName,
      fileName: suggestedName,
    };
    this.imports.push(stored);
    this.storedText = text;
    return stored;
  }

  async exportPortable(input: ExportPortableInput): Promise<ExportResult> {
    if (this.denyMethod === 'export') throw permissionDenied();
    this.exportInputs.push(input);
    return {
      fileName: input.suggestedName,
      mode: input.project === null ? 'save-picker' : 'project-export',
    };
  }

  snapshotFor(
    currentText: string,
    access: 'readonly' | 'readwrite',
    options: { name?: string; autosaveViewText?: string } = {},
  ): ProjectSnapshot {
    const manifest = makeProjectManifest({
      id: 'project-1',
      name: options.name ?? 'Fake Project',
      docId: 'doc-1',
      revision: computeDocRevision(currentText),
      nowUtc: '2026-07-12T15:35:29.000Z',
    });
    return {
      ref: this.ref,
      access,
      manifestText: projectManifestText(manifest),
      currentText,
      ...(options.autosaveViewText === undefined ? {} : { autosaveViewText: options.autosaveViewText }),
    };
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ProjectController project lifecycle', () => {
  it('opens when current bytes change but semantic revision matches', async () => {
    const store = new FakeProjectStore();
    const current = '{ "edges": [], "formatVersion": "1.0", "nodes": [] }\r\n';
    const same = '{\n  "formatVersion": "1.0",\n  "nodes": [],\n  "edges": []\n}\n';
    const manifest = makeProjectManifest({
      id: 'project-1',
      name: 'Fake Project',
      docId: 'doc-1',
      revision: computeDocRevision(same),
      nowUtc: '2026-07-12T15:35:29.000Z',
    });
    store.snapshot = {
      ref: store.ref,
      access: 'readonly',
      manifestText: projectManifestText(manifest),
      currentText: current,
    };
    const { project } = boot(store);
    await expect(project.openProject()).resolves.toBeUndefined();
    expect(project.snapshot().phase).toBe('project');
  });

  it('opens a revision skew safely and repairs it only after the explicit action', async () => {
    const store = new FakeProjectStore();
    const originalManifest = store.snapshot.manifestText;
    store.snapshot = { ...store.snapshot, currentText: changedDoc() };
    const { project } = boot(store);

    await project.openProject();
    expect(project.snapshot()).toMatchObject({ access: 'readonly', needsRepair: true });
    expect(project.snapshot().message).toMatch(/opened safely read-only/i);
    expect(store.snapshot.manifestText).toBe(originalManifest);

    await project.repairProject();
    expect(project.snapshot()).toMatchObject({ access: 'readwrite', needsRepair: false });
    expect(store.snapshot.currentText).toBe(changedDoc());
    expect(parseProjectManifest(store.snapshot.manifestText).manifest.current.revision).toBe(
      computeDocRevision(changedDoc()),
    );
  });

  it('recovers reproducibly after current closes but project.json close fails', async () => {
    const store = new FakeProjectStore();
    const first = boot(store);
    await first.project.createProject('Recoverable');
    first.controller.dispatch({ type: 'SetViewport', viewport: { x: 12, y: 34, zoom: 1.5 } });
    store.failManifestAfterCurrent = true;

    await expect(first.project.saveCurrent()).rejects.toThrow(/project\.json close failed/);
    expect(computeDocRevision(store.snapshot.currentText)).not.toBe(
      parseProjectManifest(store.snapshot.manifestText).manifest.current.revision,
    );

    const reopened = boot(store);
    await reopened.project.openProject();
    expect(reopened.project.snapshot().needsRepair).toBe(true);
    const currentBeforeRepair = store.snapshot.currentText;
    await reopened.project.repairProject();
    expect(store.snapshot.currentText).toBe(currentBeforeRepair);
    expect(reopened.project.snapshot().needsRepair).toBe(false);
  });

  it('invokes create preparation after the picker stage and never defaults to Temporary JSON', async () => {
    const { project, store } = boot();
    expect(project.snapshot().name).toBe('');
    await project.createProject('Visual Specs');
    expect(store.createStages).toEqual(['picker', 'prepare']);
    expect(project.snapshot().name).toBe('Visual Specs');
  });

  it('preserves a read-only browsing view when enabling editing and conflicts on semantic changes', async () => {
    const store = new FakeProjectStore();
    const { controller, project } = boot(store);
    await project.openProject();
    controller.dispatch({ type: 'SetViewport', viewport: { x: 99, y: 22, zoom: 1.25 } });
    await project.enableEditing();
    expect(controller.state.view.viewport).toEqual({ x: 99, y: 22, zoom: 1.25 });

    const secondStore = new FakeProjectStore();
    const second = boot(secondStore);
    await second.project.openProject();
    second.controller.dispatch({ type: 'SetViewport', viewport: { x: 7, y: 8, zoom: 2 } });
    secondStore.snapshot = secondStore.snapshotFor(changedDoc(), 'readonly');
    await expect(second.project.enableEditing()).rejects.toThrow(
      /conflict.*reopen the project before retrying enable editing/i,
    );
    expect(second.controller.state.view.viewport).toEqual({ x: 7, y: 8, zoom: 2 });
    expect(second.project.snapshot().access).toBe('readonly');
  });
});

describe.each(['Save', 'Import', 'Rename'] as const)('%s freshness checks', (operation) => {
  it.each(['valid', 'invalid'] as const)(
    'aborts before every write after an external %s change',
    async (kind) => {
      const store = new FakeProjectStore();
      const { project } = boot(store);
      await project.createProject('Fake Project');
      const ref = importRef('import.json');
      store.imports = [ref];
      store.storedText = changedDoc();
      store.snapshot =
        kind === 'valid'
          ? store.snapshotFor(changedDoc(), 'readwrite')
          : { ...store.snapshot, manifestText: '{not json' };
      const diskBefore = { ...store.snapshot };

      const action =
        operation === 'Save'
          ? () => project.saveCurrent()
          : operation === 'Import'
            ? () => project.importStoredDoc(ref)
            : () => project.renameProject('Renamed');
      await expect(action()).rejects.toThrow(/conflict/i);
      expect(store.writeStages).toEqual([]);
      expect(store.backups).toEqual([]);
      expect(store.snapshot.currentText).toBe(diskBefore.currentText);
      expect(store.snapshot.manifestText).toBe(diskBefore.manifestText);
    },
  );
});

describe('backup and stored-document invariants', () => {
  it('backs up fresh on-disk bytes and closes backup before current and manifest', async () => {
    const store = new FakeProjectStore();
    const { project } = boot(store);
    await project.createProject('Fake Project');
    const semanticReformat = JSON.stringify(JSON.parse(store.snapshot.currentText), null, 4) + '\r\n';
    store.snapshot = { ...store.snapshot, currentText: semanticReformat };

    await project.saveCurrent();
    expect(store.backups).toEqual([semanticReformat]);
    expect(store.writeStages).toEqual(['backup', 'current', 'manifest']);
  });

  it('leaves current and manifest intact when backup close fails', async () => {
    const store = new FakeProjectStore();
    const { project } = boot(store);
    await project.createProject('Fake Project');
    const before = { ...store.snapshot };
    store.failBackup = true;

    await expect(project.saveCurrent()).rejects.toThrow(/backup close failed/);
    expect(store.snapshot.currentText).toBe(before.currentText);
    expect(store.snapshot.manifestText).toBe(before.manifestText);
    expect(store.writeStages).toEqual(['backup-attempt']);
  });

  it('re-reads and rejects a stored import that becomes invalid before backup', async () => {
    const store = new FakeProjectStore();
    const { project } = boot(store);
    await project.createProject('Fake Project');
    const ref = importRef('import.json');
    store.imports = [ref];
    let reads = 0;
    const originalRead = store.readStoredDoc.bind(store);
    store.readStoredDoc = async (...args) => {
      reads += 1;
      const text = await originalRead(...args);
      store.storedText = '{"formatVersion":"1.0","nodes":[],"edges":[],"__proto__":{}}';
      return text;
    };
    store.storedText = changedDoc();

    await expect(project.importStoredDoc(ref)).rejects.toThrow(/dangerous key/);
    expect(reads).toBe(1);
    expect(store.writeStages).toEqual([]);
    expect(store.backups).toEqual([]);
  });

  it('previews a read-only import without closing the project and returns clearly', async () => {
    const store = new FakeProjectStore();
    const { project } = boot(store);
    await project.createProject('Fake Project');
    const ref = importRef('future.json');
    store.storedText = readOnlyDoc();

    await project.importStoredDoc(ref);
    expect(project.snapshot()).toMatchObject({ phase: 'project', previewing: true, access: 'readwrite' });
    project.returnToProject();
    expect(project.snapshot()).toMatchObject({ phase: 'project', previewing: false, access: 'readwrite' });
  });

  it('allows an explicit valid import to recover a current document with unknown requirements', async () => {
    const store = new FakeProjectStore();
    store.snapshot = store.snapshotFor(readOnlyDoc(), 'readonly');
    const { project } = boot(store);
    await project.openProject();
    expect(project.snapshot().canAddImport).toBe(false);
    await project.enableEditing();
    expect(project.snapshot()).toMatchObject({ access: 'readwrite', readOnly: true, canAddImport: true });
    store.picked = {
      sourceName: 'recovery.json',
      sizeBytes: sampleDoc().length,
      readText: async () => sampleDoc(),
    };
    await project.addJsonToProject();
    expect(store.imports).toHaveLength(1);
    await project.importStoredDoc(store.imports[0]!);
    expect(project.snapshot().readOnly).toBe(false);
    expect(store.writeStages).toEqual(['backup', 'current', 'manifest']);
  });

  it('revalidates Restore from Export and aborts before backup on a project conflict', async () => {
    const store = new FakeProjectStore();
    const { project } = boot(store);
    await project.createProject('Fake Project');
    const ref: StoredDocRef = {
      id: 'fake-project:exports:copy.json',
      area: 'exports',
      displayName: 'copy.json',
      fileName: 'copy.json',
    };
    store.exports = [ref];
    store.storedText = changedDoc();
    store.snapshot = store.snapshotFor(changedDoc(), 'readwrite', { name: 'Changed externally' });

    await expect(project.restoreStoredExport(ref)).rejects.toThrow(/conflict/i);
    expect(store.writeStages).toEqual([]);
    expect(store.backups).toEqual([]);
  });
});

describe('autosave, export and permissions', () => {
  it('exports a matching autosave copy outside a read-only project through the save fallback', async () => {
    const store = new FakeProjectStore();
    const revision = computeDocRevision(store.snapshot.currentText);
    store.snapshot = {
      ...store.snapshot,
      autosaveViewText: autosaveViewText({
        schema: 'visual-specs.autosave-view',
        formatVersion: '1.0',
        projectId: 'project-1',
        docId: 'doc-1',
        baseRevision: revision,
        savedAtUtc: '2026-07-12T15:35:29.000Z',
        view: { viewport: { x: 1, y: 2, zoom: 1.5 } },
      }),
    };
    const { project } = boot(store);
    await project.openProject();
    await project.exportAutosaveCopy();
    expect(store.exportInputs.at(-1)?.project).toBeNull();
    expect(project.snapshot().message).toContain('save-picker');
  });

  it('keeps a corrupt autosave warning visible after the Open message', async () => {
    const store = new FakeProjectStore();
    store.snapshot = { ...store.snapshot, autosaveViewText: '{not json' };
    const { project } = boot(store);
    await project.openProject();
    expect(project.snapshot().message).toMatch(/Opened project read-only.*corrupt/);
  });

  it.each(['Save', 'Import', 'Restore'] as const)(
    'clears a corrupt autosave warning after successful %s commit cleanup',
    async (operation) => {
      const store = new FakeProjectStore();
      store.snapshot = { ...store.snapshot, autosaveViewText: '{not json' };
      const { project } = boot(store);
      await project.openProject();
      expect(project.snapshot().message).toMatch(/corrupt/);
      await project.enableEditing();

      if (operation === 'Save') {
        await project.saveCurrent();
      } else if (operation === 'Import') {
        store.storedText = changedDoc();
        await project.importStoredDoc(importRef('recovery.json'));
      } else {
        store.storedText = changedDoc();
        await project.restoreStoredExport({
          id: 'fake-project:exports:recovery.json',
          area: 'exports',
          displayName: 'recovery.json',
          fileName: 'recovery.json',
        });
      }

      expect(project.snapshot().message).not.toMatch(/corrupt/);
    },
  );

  it('blocks all export paths for documents with unknown requirements', async () => {
    const store = new FakeProjectStore();
    store.snapshot = store.snapshotFor(readOnlyDoc(), 'readonly');
    const { project } = boot(store);
    await project.openProject();
    expect(project.snapshot().canExport).toBe(false);
    await expect(project.exportJson()).rejects.toThrow(/read-only/i);
    await expect(project.exportAutosaveCopy()).rejects.toThrow(/read-only/i);
    expect(store.exportInputs).toEqual([]);
  });

  it.each([
    ['Save', 'commit'],
    ['Rename', 'update'],
    ['Import', 'commit'],
    ['Add JSON', 'writeImport'],
    ['Export', 'export'],
  ] as const)('degrades to read-only when %s loses permission', async (operation, method) => {
    const store = new FakeProjectStore();
    const { project } = boot(store);
    await project.createProject('Fake Project');
    const ref = importRef('import.json');
    store.storedText = changedDoc();
    store.picked = {
      sourceName: 'added.json',
      sizeBytes: changedDoc().length,
      readText: async () => changedDoc(),
    };
    store.denyMethod = method;
    const action =
      operation === 'Save'
        ? () => project.saveCurrent()
        : operation === 'Rename'
          ? () => project.renameProject('Renamed')
          : operation === 'Import'
            ? () => project.importStoredDoc(ref)
            : operation === 'Add JSON'
              ? () => project.addJsonToProject()
              : () => project.exportJson();
    await expect(action()).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(project.snapshot().access).toBe('readonly');
    expect(project.snapshot().message).toMatch(/permission was revoked/i);
  });

  it('degrades and stops autosave retry after permission revocation', async () => {
    vi.useFakeTimers();
    const store = new FakeProjectStore();
    const { controller, project } = boot(store);
    await project.createProject('Fake Project');
    store.denyMethod = 'autosave';
    controller.dispatch({ type: 'SetViewport', viewport: { x: 5, y: 6, zoom: 1.2 } });
    await vi.advanceTimersByTimeAsync(400);
    expect(project.snapshot().access).toBe('readonly');
    controller.dispatch({ type: 'SetViewport', viewport: { x: 7, y: 8, zoom: 1.3 } });
    await vi.advanceTimersByTimeAsync(400);
    expect(store.autosaveWrites).toBe(0);
  });
});

describe('bounded external input', () => {
  it('rejects oversized external JSON before readText and copies nothing', async () => {
    const store = new FakeProjectStore();
    const { project } = boot(store);
    await project.createProject('Fake Project');
    let readCalls = 0;
    store.picked = {
      sourceName: 'too-big.json',
      sizeBytes: 64 * 1024 * 1024 + 1,
      readText: async () => {
        readCalls += 1;
        return sampleDoc();
      },
    };
    await expect(project.addJsonToProject()).rejects.toThrow(/byte cap/);
    expect(readCalls).toBe(0);
    expect(store.imports).toEqual([]);
  });
});

function importRef(fileName: string): StoredDocRef {
  return {
    id: `fake-project:imports:${fileName}`,
    area: 'imports',
    displayName: fileName,
    fileName,
  };
}

function changedDoc(): string {
  return docText([node('changed', 'repository', null, { path: '' })], []);
}

function readOnlyDoc(): string {
  return docText([node('repo', 'repository', null, { path: '' })], [], {
    requires: ['future-layout'],
  });
}

function permissionDenied(): Error {
  const error = new Error('permission denied');
  error.name = 'NotAllowedError';
  return error;
}

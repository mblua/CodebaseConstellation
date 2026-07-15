import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeRenderer } from '../../src/adapters/fake/FakeRenderer.ts';
import { Controller } from '../../src/app/controller.ts';
import {
  ProjectController,
  type ProjectControllerState,
} from '../../src/app/projectController.ts';
import { stateFromLoaded } from '../../src/app/state.ts';
import { autosaveViewText } from '../../src/contract/autosaveView.ts';
import { DEFAULT_LIMITS } from '../../src/contract/limits.ts';
import { importDoc } from '../../src/contract/load.ts';
import {
  makeProjectManifest,
  parseProjectManifest,
  projectManifestText,
} from '../../src/contract/projectManifest.ts';
import { computeDocRevision } from '../../src/contract/revision.ts';
import {
  makePickedSource,
  startFollowLoop,
  type FollowableHandleLike,
} from '../../src/adapters/filesystem/FsaProjectStore.ts';
import type {
  CommitCurrentInput,
  FollowOptions,
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
import {
  compactManifestProjectId,
  deriveProjectPresentation,
  discardConfirmationCopy,
  escapeManifestProjectId,
  restoreConfirmationCopy,
} from '../../src/ui/app.ts';
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
    options: { id?: string; name?: string; autosaveViewText?: string } = {},
  ): ProjectSnapshot {
    const manifest = makeProjectManifest({
      id: options.id ?? 'project-1',
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

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

class DeferredProjectStore extends FakeProjectStore {
  readonly openQueue: Array<Promise<ProjectSnapshot>> = [];
  readonly createEntered = deferred<void>();
  readonly enableEntered = deferred<void>();
  readonly commitEntered = deferred<void>();
  readonly autosaveEntered = deferred<void>();
  readonly autosaveSettled = deferred<void>();
  readonly listResults = new Map<string, Promise<readonly StoredDocRef[]>>();
  createGate: Promise<void> | null = null;
  enableGate: Promise<void> | null = null;
  commitGate: Promise<void> | null = null;
  autosaveGate: Promise<void> | null = null;
  enableResult: ProjectSnapshot | null = null;
  createdInput: CreateProjectInput | null = null;
  createRef: ProjectRef = { id: 'created-ref', displayName: 'Created project' };

  override async openProjectRead(): Promise<ProjectSnapshot> {
    const queued = this.openQueue.shift();
    return queued === undefined ? super.openProjectRead() : queued;
  }

  override async createProject(
    prepare: () => CreateProjectInput | Promise<CreateProjectInput>,
  ): Promise<ProjectSnapshot> {
    this.createStages.push('picker');
    this.createEntered.resolve(undefined);
    if (this.createGate !== null) await this.createGate;
    const input = await prepare();
    this.createdInput = input;
    this.createStages.push('prepare');
    return {
      ref: this.createRef,
      access: 'readwrite',
      manifestText: input.manifestText,
      currentText: input.currentText,
    };
  }

  override async enableEditing(ref: ProjectRef): Promise<ProjectSnapshot> {
    this.enableEntered.resolve(undefined);
    if (this.enableGate !== null) await this.enableGate;
    if (this.enableResult !== null) return this.enableResult;
    return super.enableEditing(ref);
  }

  override async commitCurrent(input: CommitCurrentInput): Promise<void> {
    this.commitEntered.resolve(undefined);
    if (this.commitGate !== null) await this.commitGate;
    await super.commitCurrent(input);
  }

  override async writeAutosaveView(ref: ProjectRef, text: string): Promise<void> {
    this.autosaveEntered.resolve(undefined);
    try {
      if (this.autosaveGate !== null) await this.autosaveGate;
      await super.writeAutosaveView(ref, text);
    } finally {
      this.autosaveSettled.resolve(undefined);
    }
  }

  override async listStoredDocs(
    ref: ProjectRef,
    area: 'imports' | 'exports',
  ): Promise<readonly StoredDocRef[]> {
    const result = this.listResults.get(`${ref.id}:${area}`);
    return result === undefined ? super.listStoredDocs(ref, area) : result;
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Project Rail application presentation facts', () => {
  it('starts with explicit example identity and no fabricated project owner', () => {
    const renderer = new FakeRenderer();
    const controller = new Controller(renderer, stateFromLoaded(importDoc(sampleDoc())));
    controller.start();
    const project = new ProjectController(controller, new FakeProjectStore(), DEFAULT_LIMITS, {
      sessionKind: 'example',
      displayLabel: 'AgentsCommander',
    });

    expect(project.snapshot()).toMatchObject({
      phase: 'temporary',
      sessionKind: 'example',
      displayLabel: 'AgentsCommander',
      manifestProjectId: null,
      projectDirty: null,
      hasDiscardableChanges: false,
      corruptAutosaveIgnored: false,
      lifecycleBusy: false,
    });
  });

  it.each([
    ['project-alpha', 'project-alpha'],
    ['project-\u200Balpha', String.raw`project-\u200Balpha`],
    ['same\u2060id', String.raw`same\u2060id`],
    ['caf\u00E9', String.raw`caf\u00E9`],
    ['cafe\u0301', String.raw`cafe\u0301`],
    ['a\u202Eb', String.raw`a\u202Eb`],
    ['a b', String.raw`a\u0020b`],
    ['a\nb', String.raw`a\u000Ab`],
    ['a\\b', String.raw`a\u005Cb`],
    ['<script>', '<script>'],
    [String.fromCharCode(0xd800), String.raw`\uD800`],
    [String.fromCharCode(0xd83d, 0xde00), String.raw`\uD83D\uDE00`],
  ])('escapes the exact UTF-16 units in %j', (raw, expected) => {
    const escaped = escapeManifestProjectId(raw);
    expect(escaped.full).toBe(expected);
    expect(escaped.atoms.join('')).toBe(expected);
    expect([...escaped.full].every((char) => {
      const unit = char.charCodeAt(0);
      return unit >= 0x21 && unit <= 0x7e;
    })).toBe(true);
    expect(escaped.full.replace(/\\u[0-9A-F]{4}/gu, '')).not.toContain('\\');
  });

  it('keeps normalization lookalikes and default-ignorables distinguishable', () => {
    const pairs = [
      ['project-alpha', 'project-\u200Balpha'],
      ['same\u200Bid', 'same\u2060id'],
      ['caf\u00E9', 'cafe\u0301'],
      ['a\u202Eb', 'a b'],
      [String.fromCharCode(0xd800), String.fromCharCode(0xd83d, 0xde00)],
    ] as const;

    for (const [left, right] of pairs) {
      expect(escapeManifestProjectId(left).full).not.toBe(escapeManifestProjectId(right).full);
      expect(compactManifestProjectId(left, null)).not.toBe(
        compactManifestProjectId(right, null),
      );
    }
  });

  it('reveals a bounded differing atom when default compact tokens collide', () => {
    const left = 'ABCDEFGH-middle-left-IJKLMNOP';
    const right = 'ABCDEFGH-middle-right-IJKLMNOP';
    const leftToken = compactManifestProjectId(left, null);
    expect(leftToken).toBe('ABCDEFGH...IJKLMNOP');

    const rightToken = compactManifestProjectId(right, {
      name: 'Same name',
      rawId: left,
      compactToken: leftToken,
    });
    expect(rightToken).not.toBe(leftToken);
    expect(rightToken).toContain(';len=');
    expect([...rightToken].every((char) => {
      const unit = char.charCodeAt(0);
      return unit >= 0x21 && unit <= 0x7e;
    })).toBe(true);

    const prefix = 'A'.repeat(DEFAULT_LIMITS.maxStringLength);
    const maxToken = compactManifestProjectId(prefix, null);
    expect(maxToken).toBe('AAAAAAAA...AAAAAAAA');
    expect(escapeManifestProjectId(prefix).atoms).toHaveLength(DEFAULT_LIMITS.maxStringLength);
  });

  it.each([
    ['temporary active document', stateForPresentation({
      sessionKind: 'temporary',
      manifestProjectId: null,
      projectKey: null,
      dirty: true,
      projectDirty: null,
      hasDiscardableChanges: true,
    }), /current document has unsaved view changes/i],
    ['ordinary project dirty alias', stateForPresentation({
      dirty: true,
      projectDirty: true,
      hasDiscardableChanges: true,
    }), /open project has unsaved layout or view changes/i],
    ['ordinary project underlying alias only', stateForPresentation({
      dirty: false,
      projectDirty: true,
      hasDiscardableChanges: true,
    }), /open project has unsaved layout or view changes/i],
    ['preview active only', stateForPresentation({
      sessionKind: 'project-preview',
      previewing: true,
      dirty: true,
      projectDirty: false,
      hasDiscardableChanges: true,
    }), /current Preview has unsaved view changes/i],
  ])('names one discard owner for %s', (_name, state, expected) => {
    const copy = discardConfirmationCopy(state, 'open another project');
    expect(copy).toMatch(expected);
    expect(copy?.match(/unsaved/giu)).toHaveLength(1);
  });

  it('names both independent Preview losses once and never duplicates ordinary aliases', () => {
    const preview = discardConfirmationCopy(
      stateForPresentation({
        sessionKind: 'project-preview',
        previewing: true,
        dirty: true,
        projectDirty: true,
        hasDiscardableChanges: true,
      }),
      'open another project',
    );
    expect(preview?.match(/unsaved/giu)).toHaveLength(2);
    expect(preview).toContain('current Preview');
    expect(preview).toContain('open project');

    const ordinary = discardConfirmationCopy(
      stateForPresentation({ dirty: true, projectDirty: true, hasDiscardableChanges: true }),
      'open another project',
    );
    expect(ordinary?.match(/open project/giu)).toHaveLength(1);
    expect(
      discardConfirmationCopy(
        stateForPresentation({ dirty: false, projectDirty: false, hasDiscardableChanges: false }),
        'open another project',
      ),
    ).toBeNull();
  });

  it('composes dirty Restore loss and backup semantics into one confirmation', () => {
    const copy = restoreConfirmationCopy(
      stateForPresentation({ dirty: true, projectDirty: true, hasDiscardableChanges: true }),
      'copy.json',
    );
    expect(copy).toMatch(/open project has unsaved layout or view changes/i);
    expect(copy.match(/open project/giu)).toHaveLength(1);
    expect(copy.match(/unsaved/giu)).toHaveLength(1);
    expect(copy.match(/backed up/giu)).toHaveLength(1);
    expect(copy.match(/Continue\?/gu)).toHaveLength(1);
  });

  it.each([
    [{ access: 'readonly', readOnly: true, canEnableEditing: true }, ['Project access: read-only', 'Document: read-only'], 'enable'],
    [{ access: 'readwrite', readOnly: true, projectDirty: true }, ['Project access: editable', 'Document: read-only', 'Unsaved project changes'], null],
    [{ access: 'readonly', projectDirty: true, pendingAutosave: true, canEnableEditing: true }, ['Project access: read-only', 'Unsaved project changes', 'Recovery available'], 'enable'],
    [{ access: 'readonly', readOnly: true, projectDirty: true, previewing: true, sessionKind: 'project-preview', needsRepair: true, pendingAutosave: true, canReturnToProject: true }, ['Project access: read-only', 'Document: read-only', 'Unsaved project changes', 'Preview', 'Repair needed', 'Recovery available'], 'return'],
    [{ access: 'readonly', projectDirty: true, needsRepair: true, pendingAutosave: true, canRepairProject: true, canEnableEditing: true }, ['Repair needed', 'Unsaved project changes', 'Recovery available'], 'repair'],
    [{ access: 'readwrite', projectDirty: true, canWriteProject: true }, ['Project access: editable', 'Unsaved project changes'], 'save'],
    [{ corruptAutosaveIgnored: true }, ['Project access: read-only', 'Corrupt autosave ignored'], null],
  ] as const)('composes simultaneous facts %# without suppressing labels', (overrides, labels, action) => {
    const presentation = deriveProjectPresentation(
      stateForPresentation(overrides as Partial<ProjectControllerState>),
    );
    for (const label of labels) expect(presentation.statuses).toContain(label);
    expect(presentation.criticalAction).toBe(action);
  });
});

describe('atomic session lifecycle fencing', () => {
  it('publishes the exact raw manifest id without changing persisted bytes', async () => {
    const store = new FakeProjectStore();
    const rawId = `same${String.fromCharCode(0x200b)}${String.fromCharCode(0xd800)}\\id`;
    store.snapshot = store.snapshotFor(changedDoc(), 'readonly', {
      id: rawId,
      name: 'Same-looking project',
    });
    const manifestBytes = store.snapshot.manifestText;
    const { project } = boot(store);

    await project.openProject();
    expect(project.snapshot()).toMatchObject({
      sessionKind: 'project',
      displayLabel: 'Same-looking project',
      manifestProjectId: rawId,
      projectDirty: false,
      hasDiscardableChanges: false,
    });
    expect(escapeManifestProjectId(project.snapshot().manifestProjectId ?? '').full).toBe(
      String.raw`same\u200B\uD800\u005Cid`,
    );
    expect(store.snapshot.manifestText).toBe(manifestBytes);
  });

  it('keeps active Preview dirty separate from the retained project dirty owner', async () => {
    const store = new FakeProjectStore();
    const { controller, project } = boot(store);
    await project.createProject('Preview owners');
    controller.dispatch({ type: 'SetViewport', viewport: { x: 11, y: 12, zoom: 1.2 } });
    expect(project.snapshot()).toMatchObject({
      sessionKind: 'project',
      dirty: true,
      projectDirty: true,
      hasDiscardableChanges: true,
    });

    store.storedText = changedDoc();
    await project.previewStoredExport(exportRef('preview.json'));
    expect(project.snapshot()).toMatchObject({
      sessionKind: 'project-preview',
      previewing: true,
      dirty: false,
      projectDirty: true,
      hasDiscardableChanges: true,
    });
    controller.dispatch({ type: 'SetViewport', viewport: { x: 21, y: 22, zoom: 1.4 } });
    expect(project.snapshot()).toMatchObject({ dirty: true, projectDirty: true });

    project.returnToProject();
    expect(project.snapshot()).toMatchObject({
      sessionKind: 'project',
      previewing: false,
      dirty: true,
      projectDirty: true,
    });
    expect(controller.state.view.viewport).toEqual({ x: 11, y: 12, zoom: 1.2 });
  });

  it.each(['editable', 'readonly'] as const)(
    'keeps %s project recovery owned by the underlying document throughout Preview',
    async (access) => {
      const store = new FakeProjectStore();
      const underlying = JSON.parse(sampleDoc()) as Record<string, unknown>;
      underlying['resilienceOwnerMarker'] = 'UNDERLYING-CURRENT-B';
      const underlyingText = JSON.stringify(underlying);
      const revision = computeDocRevision(underlyingText);
      store.snapshot = store.snapshotFor(underlyingText, 'readonly', {
        autosaveViewText: autosaveViewText({
          schema: 'visual-specs.autosave-view',
          formatVersion: '1.0',
          projectId: 'project-1',
          docId: 'doc-1',
          baseRevision: revision,
          savedAtUtc: '2026-07-14T06:30:00.000Z',
          view: { viewport: { x: 77, y: 88, zoom: 1.7 } },
        }),
      });
      const { controller, project } = boot(store);
      await project.openProject();
      if (access === 'editable') await project.enableEditing();

      const preview = JSON.parse(sampleDoc()) as Record<string, unknown>;
      preview['resilienceOwnerMarker'] = 'PREVIEW-EXPORT-A';
      store.storedText = JSON.stringify(preview);
      await project.previewStoredExport(exportRef('older-a.json'));
      const previewState = project.snapshot();
      const previewRaw = controller.state.raw;
      const previewView = controller.state.view;
      expect(previewState).toMatchObject({
        sessionKind: 'project-preview',
        previewing: true,
        pendingAutosave: true,
        access: access === 'editable' ? 'readwrite' : 'readonly',
      });

      await expect(project.exportAutosaveCopy()).rejects.toThrow(/Return to the project/i);
      expect(() => project.restoreAutosaveView()).toThrow(/Return to the project/i);
      expect(() => project.keepCurrentView()).toThrow(/Return to the project/i);

      expect(project.snapshot()).toEqual(previewState);
      expect(controller.state.raw).toBe(previewRaw);
      expect(controller.state.view).toBe(previewView);
      expect(store.exportInputs).toEqual([]);
      expect(store.autosaveWrites).toBe(0);
      expect(store.writeStages).toEqual([]);
      expect(store.backups).toEqual([]);

      project.returnToProject();
      expect(project.snapshot()).toMatchObject({
        sessionKind: 'project',
        previewing: false,
        pendingAutosave: true,
      });
      expect(JSON.parse(controller.exportText())).toMatchObject({
        resilienceOwnerMarker: 'UNDERLYING-CURRENT-B',
      });

      await project.exportAutosaveCopy();
      expect(store.exportInputs).toHaveLength(1);
      expect(store.exportInputs[0]?.project).toEqual(
        access === 'editable' ? store.ref : null,
      );
      expect(JSON.parse(store.exportInputs[0]?.text ?? '{}')).toMatchObject({
        resilienceOwnerMarker: 'UNDERLYING-CURRENT-B',
        view: { viewport: { x: 77, y: 88, zoom: 1.7 } },
      });
      expect(project.snapshot().pendingAutosave).toBe(true);
    },
  );

  it('keeps the old aggregate installed while auxiliary reads are pending or fail', async () => {
    const store = new DeferredProjectStore();
    const candidate = projectSnapshot(store, 'candidate-id', 'Candidate', changedDoc());
    const imports = deferred<readonly StoredDocRef[]>();
    const exports = deferred<readonly StoredDocRef[]>();
    store.openQueue.push(Promise.resolve(candidate));
    store.listResults.set(`${candidate.ref.id}:imports`, imports.promise);
    store.listResults.set(`${candidate.ref.id}:exports`, exports.promise);
    const { controller, project } = boot(store);
    controller.dispatch({ type: 'SetViewport', viewport: { x: 3, y: 4, zoom: 1.1 } });
    const oldControllerState = controller.state;
    const oldProject = project.snapshot();

    const opening = project.openProject();
    await vi.waitFor(() => {
      expect(project.snapshot().lifecycleBusy).toBe(true);
    });
    expect(controller.state).toBe(oldControllerState);
    expect(project.snapshot()).toMatchObject({
      sessionKind: oldProject.sessionKind,
      manifestProjectId: oldProject.manifestProjectId,
      displayLabel: oldProject.displayLabel,
      dirty: oldProject.dirty,
      lifecycleBusy: true,
      canCreateProject: false,
      canOpenProject: false,
      canExport: false,
    });

    imports.reject(new Error('imports directory could not be listed'));
    exports.resolve([]);
    await expect(opening).rejects.toThrow(/imports directory could not be listed/);
    expect(controller.state).toBe(oldControllerState);
    expect(project.snapshot()).toMatchObject({
      sessionKind: oldProject.sessionKind,
      manifestProjectId: oldProject.manifestProjectId,
      displayLabel: oldProject.displayLabel,
      dirty: oldProject.dirty,
      lifecycleBusy: false,
    });
  });

  it('does not let an already-started autosave completion mutate a foreground lifecycle', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const store = new DeferredProjectStore();
    const snapshotA = projectSnapshot(store, 'project-a', 'Project A', sampleDoc(), 'readwrite');
    const snapshotB = projectSnapshot(store, 'project-b', 'Project B', changedDoc());
    store.snapshot = snapshotA;
    const { controller, project } = boot(store);
    await project.openProject();
    await project.enableEditing();
    const autosave = deferred<void>();
    store.autosaveGate = autosave.promise;
    store.denyMethod = 'autosave';
    controller.dispatch({ type: 'SetViewport', viewport: { x: 31, y: 32, zoom: 1.4 } });
    await vi.advanceTimersByTimeAsync(400);
    await store.autosaveEntered.promise;

    const messageBeforeForeground = project.snapshot().message;
    const open = deferred<ProjectSnapshot>();
    store.openQueue.push(open.promise);
    const opening = project.openProject();
    expect(project.snapshot()).toMatchObject({ lifecycleBusy: true, access: 'readwrite' });

    autosave.resolve(undefined);
    await store.autosaveSettled.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(project.snapshot()).toMatchObject({
      lifecycleBusy: true,
      access: 'readwrite',
      manifestProjectId: 'project-a',
      message: messageBeforeForeground,
    });

    open.resolve(snapshotB);
    await opening;
    expect(project.snapshot()).toMatchObject({
      lifecycleBusy: false,
      access: 'readonly',
      manifestProjectId: 'project-b',
    });
  });

  it('never notifies a new document with an old project identity, or the inverse', async () => {
    const store = new FakeProjectStore();
    const rawId = `atomic${String.fromCharCode(0x2060)}id`;
    store.snapshot = store.snapshotFor(changedDoc(), 'readonly', {
      id: rawId,
      name: 'Atomic B',
    });
    const { controller, project } = boot(store);
    const traces: Array<{ source: string; document: string; projectId: string | null; busy: boolean }> = [];
    const capture = (source: string): void => {
      traces.push({
        source,
        document: controller.state.model.nodeById.has('changed') ? 'B' : 'old',
        projectId: project.snapshot().manifestProjectId,
        busy: project.snapshot().lifecycleBusy,
      });
    };
    const offController = controller.subscribe(() => capture('controller'));
    const offProject = project.subscribe(() => capture('project'));
    traces.length = 0;

    await project.openProject();
    offController();
    offProject();

    expect(traces.some((trace) => trace.document === 'old' && trace.busy)).toBe(true);
    expect(traces.some((trace) => trace.document === 'B' && trace.projectId === rawId)).toBe(true);
    for (const trace of traces) {
      expect([`${trace.document}:${trace.projectId ?? 'none'}`]).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^(old:none|B:atomic.*id)$/u),
        ]),
      );
    }
    expect(traces.at(-1)).toMatchObject({ source: 'controller', document: 'B', projectId: rawId });
  });

  it.each(['older-first', 'winner-first'] as const)(
    'Open A/Open B admits only B when completions are %s',
    async (order) => {
      const store = new DeferredProjectStore();
      const a = deferred<ProjectSnapshot>();
      const b = deferred<ProjectSnapshot>();
      const snapshotA = projectSnapshot(store, 'project-a', 'Project A', sampleDoc());
      const snapshotB = projectSnapshot(store, 'project-b', 'Project B', changedDoc());
      store.openQueue.push(a.promise, b.promise);
      const { controller, project } = boot(store);

      const openingA = project.openProject();
      const openingB = project.openProject();
      expect(project.snapshot().lifecycleBusy).toBe(true);
      if (order === 'older-first') {
        a.resolve(snapshotA);
        await openingA;
        expect(project.snapshot()).toMatchObject({ lifecycleBusy: true, manifestProjectId: null });
        b.resolve(snapshotB);
        await openingB;
      } else {
        b.resolve(snapshotB);
        await openingB;
        a.resolve(snapshotA);
        await openingA;
      }

      expect(project.snapshot()).toMatchObject({
        lifecycleBusy: false,
        manifestProjectId: 'project-b',
        displayLabel: 'Project B',
        projectKey: snapshotB.ref.id,
      });
      expect(controller.state.model.nodeById.has('changed')).toBe(true);
    },
  );

  it.each(['older-first', 'winner-first'] as const)(
    'Open/Create commits only Create and uses its pre-picker payload when completions are %s',
    async (order) => {
      const store = new DeferredProjectStore();
      const open = deferred<ProjectSnapshot>();
      const create = deferred<void>();
      const snapshotB = projectSnapshot(store, 'project-b', 'Project B', changedDoc());
      store.openQueue.push(open.promise);
      store.createGate = create.promise;
      const { controller, project } = boot(store);
      const capturedText = controller.exportText();

      const opening = project.openProject();
      const creating = project.createProject('Created C');
      await store.createEntered.promise;
      if (order === 'older-first') {
        open.resolve(snapshotB);
        await opening;
        expect(project.snapshot().lifecycleBusy).toBe(true);
        create.resolve(undefined);
        await creating;
      } else {
        create.resolve(undefined);
        await creating;
        open.resolve(snapshotB);
        await opening;
      }

      expect(store.createdInput?.currentText).toBe(capturedText);
      expect(project.snapshot()).toMatchObject({
        lifecycleBusy: false,
        displayLabel: 'Created C',
        projectKey: store.createRef.id,
      });
      expect(controller.state.model.nodeById.has('changed')).toBe(false);
    },
  );

  it.each(['older-first', 'winner-first'] as const)(
    'Open/Enable keeps the captured A head and only Enable wins when completions are %s',
    async (order) => {
      const store = new DeferredProjectStore();
      const snapshotA = projectSnapshot(store, 'project-a', 'Project A', sampleDoc(), 'readwrite');
      const snapshotB = projectSnapshot(store, 'project-b', 'Project B', changedDoc());
      store.snapshot = snapshotA;
      const { controller, project } = boot(store);
      await project.openProject();

      const open = deferred<ProjectSnapshot>();
      const enable = deferred<void>();
      store.openQueue.push(open.promise);
      store.enableGate = enable.promise;
      store.enableResult = { ...snapshotA, access: 'readwrite' };
      const opening = project.openProject();
      const enabling = project.enableEditing();
      await store.enableEntered.promise;
      if (order === 'older-first') {
        open.resolve(snapshotB);
        await opening;
        expect(project.snapshot().lifecycleBusy).toBe(true);
        enable.resolve(undefined);
        await enabling;
      } else {
        enable.resolve(undefined);
        await enabling;
        open.resolve(snapshotB);
        await opening;
      }

      expect(project.snapshot()).toMatchObject({
        lifecycleBusy: false,
        manifestProjectId: 'project-a',
        displayLabel: 'Project A',
        access: 'readwrite',
      });
      expect(controller.state.model.nodeById.has('changed')).toBe(false);
    },
  );

  it.each(['older-first', 'winner-first'] as const)(
    'Open/Save writes only the captured A ref/payload and only Save wins when completions are %s',
    async (order) => {
      const store = new DeferredProjectStore();
      const snapshotA = projectSnapshot(store, 'project-a', 'Project A', sampleDoc(), 'readwrite');
      const snapshotB = projectSnapshot(store, 'project-b', 'Project B', changedDoc());
      store.snapshot = snapshotA;
      const { controller, project } = boot(store);
      await project.openProject();
      await project.enableEditing();
      controller.dispatch({ type: 'SetViewport', viewport: { x: 45, y: 46, zoom: 1.6 } });
      const capturedText = controller.exportText();

      const open = deferred<ProjectSnapshot>();
      const commit = deferred<void>();
      store.openQueue.push(open.promise);
      store.commitGate = commit.promise;
      const opening = project.openProject();
      const saving = project.saveCurrent();
      await store.commitEntered.promise;
      if (order === 'older-first') {
        open.resolve(snapshotB);
        await opening;
        expect(project.snapshot().lifecycleBusy).toBe(true);
        commit.resolve(undefined);
        await saving;
      } else {
        commit.resolve(undefined);
        await saving;
        open.resolve(snapshotB);
        await opening;
      }

      expect(store.commits).toHaveLength(1);
      expect(store.commits[0]?.ref.id).toBe(snapshotA.ref.id);
      expect(store.snapshot.currentText).toBe(capturedText);
      expect(project.snapshot()).toMatchObject({
        lifecycleBusy: false,
        manifestProjectId: 'project-a',
        displayLabel: 'Project A',
        dirty: false,
      });
      expect(controller.state.model.nodeById.has('changed')).toBe(false);
    },
  );
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
  it('re-arms exactly one dirty autosave after Keep current invalidates the pending timer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
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
        savedAtUtc: '2026-07-14T06:00:00.000Z',
        view: { viewport: { x: 1, y: 2, zoom: 1.5 } },
      }),
    };
    const { controller, project } = boot(store);
    await project.openProject();
    await project.enableEditing();
    expect(project.snapshot().pendingAutosave).toBe(true);

    controller.dispatch({ type: 'SetViewport', viewport: { x: 8, y: 9, zoom: 1.3 } });
    project.keepCurrentView();
    expect(project.snapshot()).toMatchObject({ dirty: true, pendingAutosave: false });
    await vi.advanceTimersByTimeAsync(400);

    expect(store.autosaveWrites).toBe(1);
  });

  it('does not re-arm Keep current autosave for clean or read-only sessions', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const cleanStore = new FakeProjectStore();
    const revision = computeDocRevision(cleanStore.snapshot.currentText);
    cleanStore.snapshot = {
      ...cleanStore.snapshot,
      autosaveViewText: autosaveViewText({
        schema: 'visual-specs.autosave-view',
        formatVersion: '1.0',
        projectId: 'project-1',
        docId: 'doc-1',
        baseRevision: revision,
        savedAtUtc: '2026-07-14T06:00:00.000Z',
        view: { viewport: { x: 1, y: 2, zoom: 1.5 } },
      }),
    };
    const clean = boot(cleanStore);
    await clean.project.openProject();
    await clean.project.enableEditing();
    clean.project.keepCurrentView();

    const readonlyStore = new FakeProjectStore();
    readonlyStore.snapshot = { ...cleanStore.snapshot, access: 'readonly' };
    const readonly = boot(readonlyStore);
    await readonly.project.openProject();
    readonly.controller.dispatch({
      type: 'SetViewport',
      viewport: { x: 8, y: 9, zoom: 1.3 },
    });
    readonly.project.keepCurrentView();

    await vi.advanceTimersByTimeAsync(400);
    expect(cleanStore.autosaveWrites).toBe(0);
    expect(readonly.project.snapshot()).toMatchObject({ access: 'readonly', dirty: true });
    expect(readonlyStore.autosaveWrites).toBe(0);
  });

  it('re-arms dirty autosave after a successful non-session foreground operation', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { controller, project, store } = boot();
    await project.createProject('Fake Project');
    controller.dispatch({ type: 'SetViewport', viewport: { x: 8, y: 9, zoom: 1.3 } });

    await project.exportJson();
    expect(project.snapshot()).toMatchObject({ dirty: true, lifecycleBusy: false });
    await vi.advanceTimersByTimeAsync(400);

    expect(store.autosaveWrites).toBe(1);
  });

  it('re-arms dirty autosave after a foreground cancellation or failure preserves the session', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { controller, project, store } = boot();
    await project.createProject('Fake Project');
    controller.dispatch({ type: 'SetViewport', viewport: { x: 10, y: 11, zoom: 1.4 } });
    store.exportPortable = async () => {
      throw new DOMException('cancelled', 'AbortError');
    };

    await expect(project.exportJson()).rejects.toMatchObject({ name: 'AbortError' });
    expect(project.snapshot()).toMatchObject({ dirty: true, lifecycleBusy: false });
    await vi.advanceTimersByTimeAsync(400);

    expect(store.autosaveWrites).toBe(1);
  });

  it('does not emit a spurious autosave after Save or a committed session change', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const first = boot();
    await first.project.createProject('Fake Project');
    first.controller.dispatch({ type: 'SetViewport', viewport: { x: 12, y: 13, zoom: 1.5 } });
    await first.project.saveCurrent();
    await vi.advanceTimersByTimeAsync(400);
    expect(first.project.snapshot().dirty).toBe(false);
    expect(first.store.autosaveWrites).toBe(0);

    const second = boot();
    await second.project.createProject('Project A');
    second.controller.dispatch({ type: 'SetViewport', viewport: { x: 14, y: 15, zoom: 1.6 } });
    second.store.snapshot = projectSnapshot(
      second.store,
      'project-b',
      'Project B',
      changedDoc(),
      'readwrite',
    );
    await second.project.openProject();
    await vi.advanceTimersByTimeAsync(400);
    expect(second.project.snapshot()).toMatchObject({ manifestProjectId: 'project-b', dirty: false });
    expect(second.store.autosaveWrites).toBe(0);
  });

  it('does not re-arm autosave after a foreground permission revocation', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { controller, project, store } = boot();
    await project.createProject('Fake Project');
    controller.dispatch({ type: 'SetViewport', viewport: { x: 16, y: 17, zoom: 1.7 } });
    store.denyMethod = 'export';

    await expect(project.exportJson()).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(project.snapshot()).toMatchObject({ access: 'readonly', dirty: true });
    await vi.advanceTimersByTimeAsync(400);

    expect(store.autosaveWrites).toBe(0);
  });

  it('does not let a stale foreground completion re-arm autosave in a changed session', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { controller, project, store } = boot();
    await project.createProject('Project A');
    controller.dispatch({ type: 'SetViewport', viewport: { x: 18, y: 19, zoom: 1.8 } });
    const exported = deferred<ExportResult>();
    store.exportPortable = async () => exported.promise;

    const exporting = project.exportJson();
    store.snapshot = projectSnapshot(store, 'project-b', 'Project B', changedDoc(), 'readwrite');
    await project.openProject();
    exported.resolve({ fileName: 'stale.json', mode: 'project-export' });
    await exporting;
    await vi.advanceTimersByTimeAsync(400);

    expect(project.snapshot()).toMatchObject({ manifestProjectId: 'project-b', dirty: false });
    expect(store.autosaveWrites).toBe(0);
  });

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
    expect(project.snapshot().corruptAutosaveIgnored).toBe(true);
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
      expect(project.snapshot().corruptAutosaveIgnored).toBe(false);
    },
  );

  it('keeps the structured corrupt-autosave fact after a failed rewrite', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const store = new FakeProjectStore();
    store.snapshot = { ...store.snapshot, autosaveViewText: '{not json' };
    const { controller, project } = boot(store);
    await project.openProject();
    await project.enableEditing();
    store.denyMethod = 'autosave';

    controller.dispatch({ type: 'SetViewport', viewport: { x: 8, y: 9, zoom: 1.3 } });
    await vi.advanceTimersByTimeAsync(400);

    expect(project.snapshot()).toMatchObject({
      access: 'readonly',
      corruptAutosaveIgnored: true,
    });
  });

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
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
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
  it('keeps a picked temporary file read behind the lifecycle fence until one atomic commit', async () => {
    const { controller, project } = boot();
    const oldController = controller.state;
    const text = deferred<string>();
    const opening = project.openTemporarySource({
      sourceName: 'candidate.json',
      sizeBytes: changedDoc().length,
      readText: async () => text.promise,
    });

    expect(controller.state).toBe(oldController);
    expect(project.snapshot()).toMatchObject({
      lifecycleBusy: true,
      sessionKind: 'temporary',
      displayLabel: 'Temporary JSON',
    });
    text.resolve(changedDoc());
    await opening;
    expect(project.snapshot()).toMatchObject({
      lifecycleBusy: false,
      sessionKind: 'temporary',
      displayLabel: 'candidate.json',
      manifestProjectId: null,
    });
    expect(controller.state.model.nodeById.has('changed')).toBe(true);
  });

  it('refuses an oversized temporary source before reading it', async () => {
    const { controller, project } = boot();
    const oldController = controller.state;
    let reads = 0;
    await expect(
      project.openTemporarySource({
        sourceName: 'too-big.json',
        sizeBytes: DEFAULT_LIMITS.maxBytes + 1,
        readText: async () => {
          reads += 1;
          return changedDoc();
        },
      }),
    ).rejects.toThrow(/byte cap/);
    expect(reads).toBe(0);
    expect(controller.state).toBe(oldController);
    expect(project.snapshot().lifecycleBusy).toBe(false);
  });

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


// ── Follow-file: controller lifecycle over fake followable sources ───────────

interface FollowableFake {
  source: PickedTextSource;
  change(text: string): void;
  skip(reason: string): void;
  end(reason: string): void;
  stopCount(): number;
  followCount(): number;
}

function makeFollowable(name: string, initialText: string): FollowableFake {
  let current = initialText;
  let options: FollowOptions | null = null;
  let stops = 0;
  let follows = 0;
  const source: PickedTextSource = {
    sourceName: name,
    sizeBytes: initialText.length,
    readText: async () => current,
    follow: (opts: FollowOptions) => {
      follows += 1;
      options = opts;
      return () => {
        stops += 1;
        options = null;
      };
    },
  };
  return {
    source,
    change: (text: string) => {
      current = text;
      options?.onChange({ text, modifiedAt: Date.now() });
    },
    skip: (reason: string) => options?.onSkipped(reason),
    end: (reason: string) => options?.onEnded(reason),
    stopCount: () => stops,
    followCount: () => follows,
  };
}

function docWithoutPkgB(): string {
  const next = JSON.parse(sampleDoc()) as { nodes: { id: string }[]; edges: { targetId: string }[] };
  next.nodes = next.nodes.filter((n) => !['pkg-b', 'dir-b', 'file-b1'].includes(n.id));
  next.edges = next.edges.filter((e) => e.targetId !== 'file-b1');
  return JSON.stringify(next);
}

describe('follow-file: reload lifecycle', () => {
  it('a delivered change reloads through refresh: layout kept, loss surfaced, message and announcement set', async () => {
    const { controller, project } = boot();
    const fake = makeFollowable('dataset.json', sampleDoc());
    await project.openTemporarySource(fake.source);
    expect(project.snapshot().followState).toEqual({
      kind: 'following',
      label: 'Following dataset.json — reloads on change',
    });

    controller.dispatch({ type: 'MoveNode', id: 'pkg-a', position: { x: 321, y: 123 } });
    fake.change(docWithoutPkgB());

    expect(controller.state.model.nodeById.has('pkg-b')).toBe(false);
    expect(controller.state.view.positions.get('pkg-a')).toEqual({ x: 321, y: 123, pinned: true });
    expect(controller.state.loss).not.toBeNull();
    const snap = project.snapshot();
    expect(snap.message).toMatch(/Reloaded dataset\.json from disk \(\d\d:\d\d:\d\d\)\./u);
    expect(snap.lastReloadAt).toMatch(/^\d\d:\d\d:\d\d$/u);
    expect(snap.announcement?.text).toBe('Reloaded dataset.json.');
    expect(snap.followState.kind).toBe('following');
  });

  it('invalid content NEVER replaces the last good state: same state object, warning, follow continues', async () => {
    const { controller, project } = boot();
    const fake = makeFollowable('dataset.json', sampleDoc());
    await project.openTemporarySource(fake.source);

    const before = controller.state;
    fake.change('{ this is not json');
    expect(controller.state).toBe(before);
    const snap = project.snapshot();
    expect(snap.message).toMatch(/Auto-reload skipped: dataset\.json changed on disk but is invalid or mid-write/u);
    expect(snap.followState.kind).toBe('following');

    fake.change(docWithoutPkgB());
    expect(controller.state).not.toBe(before);
    expect(project.snapshot().message).toMatch(/Reloaded dataset\.json from disk/u);
  });

  it('a reload announcement folds dropped selected ids into the cause (A2-P1-1)', async () => {
    const { controller, project } = boot();
    const fake = makeFollowable('dataset.json', sampleDoc());
    await project.openTemporarySource(fake.source);

    controller.dispatch({ type: 'Select', nodeIds: ['pkg-b'], edgeId: null });
    fake.change(docWithoutPkgB());

    expect(controller.state.selection.nodeIds).toEqual([]);
    expect(project.snapshot().announcement?.text).toBe(
      'Reloaded dataset.json: 1 selected item(s) no longer exist.',
    );
  });

  it('a stale delivery after a NEW temporary session is ignored and the old follow was stopped', async () => {
    const { controller, project } = boot();
    const fake = makeFollowable('old.json', sampleDoc());
    await project.openTemporarySource(fake.source);
    expect(fake.followCount()).toBe(1);

    project.openTemporaryText('new.json', sampleDoc());
    expect(fake.stopCount()).toBe(1);
    expect(project.snapshot().followState.kind).toBe('none');

    const before = controller.state;
    fake.change(docWithoutPkgB());
    expect(controller.state).toBe(before);
  });

  it('opening a project stops the follow and a stale delivery cannot touch the project session', async () => {
    const store = new FakeProjectStore();
    const { controller, project } = boot(store);
    const fake = makeFollowable('dataset.json', sampleDoc());
    await project.openTemporarySource(fake.source);

    await project.createProject('Fake Project');
    expect(fake.stopCount()).toBe(1);
    expect(project.snapshot().followState.kind).toBe('none');

    const before = controller.state;
    fake.change(docWithoutPkgB());
    expect(controller.state).toBe(before);
  });

  it('fallback source without follow: no follow attempted, followState none', async () => {
    const { project } = boot();
    await project.openTemporarySource({
      sourceName: 'plain.json',
      sizeBytes: sampleDoc().length,
      readText: async () => sampleDoc(),
    });
    expect(project.snapshot().followState.kind).toBe('none');
  });

  it('onEnded: persistent stopped state, recovery message, no further reloads (A2-P2-5)', async () => {
    const { controller, project } = boot();
    const fake = makeFollowable('dataset.json', sampleDoc());
    await project.openTemporarySource(fake.source);

    fake.end('read permission is no longer granted (denied)');
    const snap = project.snapshot();
    expect(snap.followState).toEqual({
      kind: 'stopped',
      label: 'Follow stopped — reopen the file to resume',
    });
    expect(snap.message).toMatch(
      /Stopped following dataset\.json: read permission is no longer granted \(denied\)\. The last good state is kept\. Reopen the file to resume following\./u,
    );

    const before = controller.state;
    fake.change(docWithoutPkgB());
    expect(controller.state).toBe(before);
    expect(project.snapshot().followState.kind).toBe('stopped');
  });

  it('oversized warning framing is distinct from invalid/mid-write (A2-P2-3)', async () => {
    const { project } = boot();
    const fake = makeFollowable('dataset.json', sampleDoc());
    await project.openTemporarySource(fake.source);

    fake.skip('dataset.json is 999 bytes, over the 10 byte cap');
    const snap = project.snapshot();
    expect(snap.message).toBe(
      'Auto-reload paused: dataset.json is 999 bytes, over the 10 byte cap. Reloads resume when the file is back under the cap.',
    );
    expect(snap.followState.kind).toBe('following');
    expect(snap.message).not.toMatch(/invalid or mid-write/u);
  });

  it('reload flips readOnly → the message names the flip (A2-F8)', async () => {
    const { controller, project } = boot();
    const fake = makeFollowable('dataset.json', sampleDoc());
    await project.openTemporarySource(fake.source);
    expect(controller.state.readOnly).toBe(false);

    fake.change(readOnlyDoc());
    expect(controller.state.readOnly).toBe(true);
    expect(project.snapshot().message).toMatch(
      /Reloaded dataset\.json from disk \(\d\d:\d\d:\d\d\)\. The reloaded document is read-only: it declares an unsupported requirement\./u,
    );

    fake.change(sampleDoc());
    expect(controller.state.readOnly).toBe(false);
    expect(project.snapshot().message).toMatch(/writable again\./u);
  });
});

describe('follow-file: dirty semantics (A2-F3)', () => {
  it('a reload with drops on a CLEAN session leaves dirty false and schedules no autosave', async () => {
    const store = new FakeProjectStore();
    const { controller, project } = boot(store);
    const fake = makeFollowable('dataset.json', sampleDoc());
    await project.openTemporarySource(fake.source);
    expect(project.snapshot().dirty).toBe(false);

    controller.dispatch({ type: 'Select', nodeIds: [], edgeId: null });
    fake.change(docWithoutPkgB());

    expect(project.snapshot().dirty).toBe(false);
    await vi.waitFor(() => expect(store.autosaveWrites).toBe(0));
  });

  it('a reload on a DIRTY session leaves dirty true', async () => {
    const { controller, project } = boot();
    const fake = makeFollowable('dataset.json', sampleDoc());
    await project.openTemporarySource(fake.source);

    controller.dispatch({ type: 'MoveNode', id: 'pkg-a', position: { x: 5, y: 6 } });
    expect(project.snapshot().dirty).toBe(true);

    fake.change(docWithoutPkgB());
    expect(project.snapshot().dirty).toBe(true);
  });
});

describe('follow-file: busy overlap and the pending slot', () => {
  function gatedExport(store: FakeProjectStore): { release(): void } {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = store.exportPortable.bind(store);
    store.exportPortable = async (input) => {
      await gate;
      return original(input);
    };
    return { release };
  }

  it('deliveries during lifecycleBusy apply exactly once after settle; superseded text never applies', async () => {
    const store = new FakeProjectStore();
    const { controller, project } = boot(store);
    const fake = makeFollowable('dataset.json', sampleDoc());
    await project.openTemporarySource(fake.source);

    const gate = gatedExport(store);
    const running = project.exportJson();
    expect(project.snapshot().lifecycleBusy).toBe(true);

    const before = controller.state;
    fake.change(docWithoutPkgB());
    fake.change(sampleDoc());
    expect(controller.state).toBe(before);

    gate.release();
    await running;

    // Only the LATEST parked text applied: pkg-b is present again.
    expect(controller.state).not.toBe(before);
    expect(controller.state.model.nodeById.has('pkg-b')).toBe(true);
    expect(project.snapshot().message).toMatch(/Reloaded dataset\.json from disk/u);
  });

  it('ended during busy: parked reload applies FIRST, then the persistent stopped state (A2-F5/N1)', async () => {
    const store = new FakeProjectStore();
    const { controller, project } = boot(store);
    const fake = makeFollowable('dataset.json', sampleDoc());
    await project.openTemporarySource(fake.source);

    const gate = gatedExport(store);
    const running = project.exportJson();

    fake.change(docWithoutPkgB());
    fake.end('file is gone');

    gate.release();
    await running;

    expect(controller.state.model.nodeById.has('pkg-b')).toBe(false);
    const snap = project.snapshot();
    expect(snap.followState.kind).toBe('stopped');
    expect(snap.message).toMatch(/Stopped following dataset\.json: file is gone/u);
  });

  it('skipped-then-reload in one busy window: only the reload applies, the stale pause notice is discarded', async () => {
    const store = new FakeProjectStore();
    const { controller, project } = boot(store);
    const fake = makeFollowable('dataset.json', sampleDoc());
    await project.openTemporarySource(fake.source);

    const gate = gatedExport(store);
    const running = project.exportJson();

    fake.skip('dataset.json is 999 bytes, over the 10 byte cap');
    fake.change(docWithoutPkgB());

    gate.release();
    await running;

    expect(controller.state.model.nodeById.has('pkg-b')).toBe(false);
    const snap = project.snapshot();
    expect(snap.message).toMatch(/Reloaded dataset\.json from disk/u);
    expect(snap.message).not.toMatch(/Auto-reload paused/u);
  });

  it('reload-then-skipped: both apply, pause notice on top', async () => {
    const store = new FakeProjectStore();
    const { controller, project } = boot(store);
    const fake = makeFollowable('dataset.json', sampleDoc());
    await project.openTemporarySource(fake.source);

    const gate = gatedExport(store);
    const running = project.exportJson();

    fake.change(docWithoutPkgB());
    fake.skip('dataset.json is 999 bytes, over the 10 byte cap');

    gate.release();
    await running;

    expect(controller.state.model.nodeById.has('pkg-b')).toBe(false);
    const snap = project.snapshot();
    expect(snap.lastReloadAt).not.toBeNull();
    expect(snap.message).toMatch(/^Auto-reload paused: dataset\.json is 999 bytes/u);
    expect(snap.followState.kind).toBe('following');
  });

  it('a lone skipped during busy parks, applies after settle, and touches nothing else', async () => {
    const store = new FakeProjectStore();
    const { controller, project } = boot(store);
    const fake = makeFollowable('dataset.json', sampleDoc());
    await project.openTemporarySource(fake.source);

    const gate = gatedExport(store);
    const running = project.exportJson();

    const before = controller.state;
    fake.skip('dataset.json is 999 bytes, over the 10 byte cap');
    expect(project.snapshot().message).not.toMatch(/Auto-reload paused/u);

    gate.release();
    await running;

    expect(controller.state).toBe(before);
    const snap = project.snapshot();
    expect(snap.message).toMatch(/^Auto-reload paused/u);
    expect(snap.followState.kind).toBe('following');
    expect(snap.dirty).toBe(false);
  });
});

// ── Follow-file: the adapter loop over a scripted minimal handle ─────────────

interface ScriptedFile {
  name: string;
  size: number;
  lastModified: number;
  text: () => Promise<string>;
}

function scriptedHandle(initial: ScriptedFile): FollowableHandleLike & {
  set(file: Partial<ScriptedFile>): void;
  fail(err: unknown, times?: number): void;
  getFileCalls(): number;
  textReads(): number;
  setPermission(state: PermissionState | 'unavailable' | 'throws'): void;
} {
  let file = { ...initial };
  let failWith: unknown = null;
  let failTimes = 0;
  let getFileCalls = 0;
  let textReads = 0;
  let permission: PermissionState | 'unavailable' | 'throws' = 'granted';

  const handle: FollowableHandleLike & Record<string, unknown> = {
    async getFile() {
      getFileCalls += 1;
      if (failTimes > 0) {
        failTimes -= 1;
        throw failWith;
      }
      const snapshot = { ...file };
      return {
        name: snapshot.name,
        size: snapshot.size,
        lastModified: snapshot.lastModified,
        text: async () => {
          textReads += 1;
          return snapshot.text();
        },
      };
    },
    queryPermission: async () => {
      if (permission === 'unavailable') throw new Error('should not be called');
      if (permission === 'throws') throw new Error('query failed');
      return permission;
    },
  };

  return Object.assign(handle, {
    set(next: Partial<ScriptedFile>) {
      file = { ...file, ...next };
    },
    fail(err: unknown, times = 1) {
      failWith = err;
      failTimes = times;
    },
    getFileCalls: () => getFileCalls,
    textReads: () => textReads,
    setPermission(state: PermissionState | 'unavailable' | 'throws') {
      if (state === 'unavailable') {
        delete handle['queryPermission'];
        permission = 'unavailable';
        return;
      }
      permission = state;
    },
  }) as never;
}

function fileOf(name: string, text: string, lastModified: number): ScriptedFile {
  return { name, size: text.length, lastModified, text: async () => text };
}

function collectEvents() {
  const events: string[] = [];
  const options = (maxBytes: number): FollowOptions => ({
    maxBytes,
    onChange: (read) => events.push('change:' + read.text),
    onSkipped: (reason) => events.push('skipped:' + reason),
    onEnded: (reason) => events.push('ended:' + reason),
  });
  return { events, options };
}

/** Real yields so native crypto promises resolve between fake-timer steps. */
async function flushAsync(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await new Promise<void>((resolve) => setImmediate(resolve));
}

async function settle(ms: number): Promise<void> {
  await flushAsync();
  let remaining = ms;
  while (remaining > 0) {
    const step = Math.min(1000, remaining);
    await vi.advanceTimersByTimeAsync(step);
    await flushAsync();
    remaining -= step;
  }
}

describe('follow-file: adapter poll loop (scripted handle)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('baseline gap (A2-F1): a write between the open read and follow() is delivered at the first tick', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const handle = scriptedHandle(fileOf('d.json', 'one', 1000));
    const source = makePickedSource(handle, 'd.json', 3);
    await source.readText(1024);

    handle.set({ size: 3, lastModified: 2000, text: async () => 'two' });

    const { events, options } = collectEvents();
    const stop = source.follow?.(options(1024));
    await settle(1000);
    expect(events).toEqual(['change:two']);
    stop?.();
  });

  it('follow before any completed readText throws; a second follow throws; follow after stop works', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const handle = scriptedHandle(fileOf('d.json', 'one', 1000));
    const source = makePickedSource(handle, 'd.json', 3);
    const { options } = collectEvents();

    expect(() => source.follow?.(options(1024))).toThrow(/requires a completed readText/u);

    await source.readText(1024);
    const stop = source.follow?.(options(1024));
    expect(() => source.follow?.(options(1024))).toThrow(/already active/u);
    stop?.();
    const stopAgain = source.follow?.(options(1024));
    expect(stopAgain).toBeTypeOf('function');
    stopAgain?.();
  });

  it('metadata-only churn advances the baseline silently: no delivery for identical content', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const handle = scriptedHandle(fileOf('d.json', 'one', 1000));
    const source = makePickedSource(handle, 'd.json', 3);
    await source.readText(1024);
    const { events, options } = collectEvents();
    const stop = source.follow?.(options(1024));

    handle.set({ lastModified: 2000 }); // touch: same bytes
    await settle(1000);
    expect(events).toEqual([]);

    handle.set({ lastModified: 3000, size: 3, text: async () => 'two' });
    await settle(1000);
    expect(events).toEqual(['change:two']);
    stop?.();
  });

  it('strict gate (A2-P2-2): a same-size BACKWARDS mtime change is delivered', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const handle = scriptedHandle(fileOf('d.json', 'one', 5000));
    const source = makePickedSource(handle, 'd.json', 3);
    await source.readText(1024);
    const { events, options } = collectEvents();
    const stop = source.follow?.(options(1024));

    handle.set({ lastModified: 1000, size: 3, text: async () => 'two' });
    await settle(1000);
    expect(events).toEqual(['change:two']);
    stop?.();
  });

  it('single-flight (A2-P2-1): a slow read spans ticks without racing and deliveries stay ordered', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const handle = scriptedHandle(fileOf('d.json', 'one', 1000));
    const source = makePickedSource(handle, 'd.json', 3);
    await source.readText(1024);

    let releaseSlow: (v: string) => void = () => undefined;
    const slow = new Promise<string>((resolve) => {
      releaseSlow = resolve;
    });
    handle.set({ lastModified: 2000, size: 4, text: () => slow });

    const { events, options } = collectEvents();
    const stop = source.follow?.(options(1024));

    await settle(1000); // tick 1 starts the slow read
    const callsDuringRead = handle.getFileCalls();
    await settle(2500); // several intervals pass while the read is in flight
    expect(handle.getFileCalls()).toBe(callsDuringRead); // no overlapping tick

    handle.set({ lastModified: 3000, size: 5, text: async () => 'newer' });
    releaseSlow('slow1');
    await settle(1000);

    expect(events[0]).toBe('change:slow1');
    expect(events[1]).toBe('change:newer');
    stop?.();
  });

  it('oversized (A2-F2): metadata gate before any read, exactly one onSkipped, recovery delivers', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const handle = scriptedHandle(fileOf('d.json', 'one', 1000));
    const source = makePickedSource(handle, 'd.json', 3);
    await source.readText(1024);
    const { events, options } = collectEvents();
    const stop = source.follow?.(options(10));

    const readsBefore = handle.textReads();
    handle.set({ lastModified: 2000, size: 999, text: async () => 'x'.repeat(999) });
    await settle(1000);
    expect(events).toEqual(['skipped:d.json is 999 bytes, over the 10 byte cap']);
    expect(handle.textReads()).toBe(readsBefore); // never read the oversized content

    await settle(3000); // same oversized bytes: no repeat warning at tick rate
    expect(events).toHaveLength(1);

    handle.set({ lastModified: 3000, size: 3, text: async () => 'two' });
    await settle(1000);
    expect(events).toEqual([
      'skipped:d.json is 999 bytes, over the 10 byte cap',
      'change:two',
    ]);
    stop?.();
  });

  it('NotAllowedError with still-granted permission counts as transient; denied ends (round-1 amendment)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const handle = scriptedHandle(fileOf('d.json', 'one', 1000));
    const source = makePickedSource(handle, 'd.json', 3);
    await source.readText(1024);
    const { events, options } = collectEvents();
    const stop = source.follow?.(options(1024));

    handle.setPermission('granted');
    handle.fail(new DOMException('blocked', 'NotAllowedError'), 1);
    await settle(1000);
    expect(events).toEqual([]); // survived: misclassified transient

    handle.setPermission('denied');
    handle.fail(new DOMException('blocked', 'NotAllowedError'), 1);
    await settle(1000);
    expect(events).toEqual(['ended:read permission is no longer granted (denied)']);
    stop?.();
  });

  it('a prompt answer also ends (re-prompting without a gesture is forbidden)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const handle = scriptedHandle(fileOf('d.json', 'one', 1000));
    const source = makePickedSource(handle, 'd.json', 3);
    await source.readText(1024);
    const { events, options } = collectEvents();
    source.follow?.(options(1024));

    handle.setPermission('prompt');
    handle.fail(new DOMException('blocked', 'NotAllowedError'), 1);
    await settle(1000);
    expect(events).toEqual(['ended:read permission is no longer granted (prompt)']);
  });

  it('five consecutive transient failures end the follow; a success resets the counter', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const handle = scriptedHandle(fileOf('d.json', 'one', 1000));
    const source = makePickedSource(handle, 'd.json', 3);
    await source.readText(1024);
    const { events, options } = collectEvents();
    source.follow?.(options(1024));

    handle.fail(new DOMException('gone', 'NotFoundError'), 4);
    await settle(4000);
    expect(events).toEqual([]);
    await settle(1000); // success resets the counter
    handle.fail(new DOMException('gone', 'NotFoundError'), 4);
    await settle(4000);
    expect(events).toEqual([]);

    handle.fail(new DOMException('gone', 'NotFoundError'), 5);
    await settle(5000);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatch(/^ended:5 consecutive read failures/u);
  });

  it('stop is idempotent and no callback fires after stop returns', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const handle = scriptedHandle(fileOf('d.json', 'one', 1000));
    const source = makePickedSource(handle, 'd.json', 3);
    await source.readText(1024);
    const { events, options } = collectEvents();
    const stop = source.follow?.(options(1024));

    stop?.();
    stop?.();
    handle.set({ lastModified: 9000, size: 5, text: async () => 'later' });
    await settle(5000);
    expect(events).toEqual([]);
  });

  it('a readText completed mid-follow never advances the active baseline (N2)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const handle = scriptedHandle(fileOf('d.json', 'one', 1000));
    const source = makePickedSource(handle, 'd.json', 3);
    await source.readText(1024);
    const { events, options } = collectEvents();
    const stop = source.follow?.(options(1024));

    // Content changes; a concurrent readText observes it BEFORE the next tick.
    handle.set({ lastModified: 2000, size: 3, text: async () => 'two' });
    await source.readText(1024);

    // The active loop still delivers: its baseline was NOT advanced by readText.
    await settle(1000);
    expect(events).toEqual(['change:two']);
    stop?.();
  });

  it('startFollowLoop over a raw baseline: null contentHash (oversized advance) always delivers next', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const handle = scriptedHandle(fileOf('d.json', 'one', 1000));
    const { events, options } = collectEvents();
    const stop = startFollowLoop(
      handle,
      'd.json',
      { contentHash: null, lastModified: 500, size: 1 },
      options(1024),
    );
    await settle(1000);
    expect(events).toEqual(['change:one']);
    stop();
  });
});

function stateForPresentation(
  overrides: Partial<ProjectControllerState> = {},
): ProjectControllerState {
  return {
    phase: 'project',
    sessionKind: 'project',
    displayLabel: 'Fake Project',
    manifestProjectId: 'project-1',
    projectKey: 'fake-project',
    access: 'readonly',
    name: 'Fake Project',
    readOnly: false,
    dirty: false,
    projectDirty: false,
    hasDiscardableChanges: false,
    previewing: false,
    needsRepair: false,
    corruptAutosaveIgnored: false,
    lifecycleBusy: false,
    canCreateProject: false,
    canOpenProject: true,
    canEnableEditing: false,
    canRepairProject: false,
    canWriteProject: false,
    canAddImport: false,
    canImport: false,
    canBrowseProject: true,
    canRestoreExport: false,
    canReturnToProject: false,
    canExport: true,
    persistenceLabel: 'Project access: read-only.',
    message: '',
    pendingAutosave: false,
    imports: [],
    exports: [],
    followState: { kind: 'none' },
    lastReloadAt: null,
    canPickTemporaryJson: false,
    announcement: null,
    ...overrides,
  };
}

function importRef(fileName: string): StoredDocRef {
  return {
    id: `fake-project:imports:${fileName}`,
    area: 'imports',
    displayName: fileName,
    fileName,
  };
}

function exportRef(fileName: string): StoredDocRef {
  return {
    id: `fake-project:exports:${fileName}`,
    area: 'exports',
    displayName: fileName,
    fileName,
  };
}

function projectSnapshot(
  store: FakeProjectStore,
  id: string,
  name: string,
  currentText: string,
  access: 'readonly' | 'readwrite' = 'readonly',
): ProjectSnapshot {
  return {
    ...store.snapshotFor(currentText, access, { id, name }),
    ref: { id: `${id}-ref`, displayName: name },
    access,
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

import { autosaveMatches, autosaveViewText, parseAutosaveView } from '../contract/autosaveView.ts';
import { exportDoc } from '../contract/export.ts';
import { timestampedJsonName } from '../contract/filename.ts';
import { DEFAULT_LIMITS, type Limits } from '../contract/limits.ts';
import { importDoc, type LoadedDoc } from '../contract/load.ts';
import {
  makeProjectManifest,
  parseProjectManifest,
  projectManifestText,
  validateProjectName,
  withProjectUpdate,
  type ParsedProjectManifest,
  type VisualSpecsProjectManifestV1,
} from '../contract/projectManifest.ts';
import { computeDocRevision, type DocRevision } from '../contract/revision.ts';
import type { VisualSpecsView } from '../contract/types.ts';
import type { ViewState } from '../contract/view.ts';
import type {
  PickedTextSource,
  ProjectHead,
  ProjectRef,
  ProjectSnapshot,
  ProjectStore,
  StoredDocRef,
} from '../ports/projectStore.ts';
import type { Controller } from './controller.ts';

export type ProjectSessionKind = 'example' | 'temporary' | 'project' | 'project-preview';

export interface InitialSessionIdentity {
  sessionKind: 'example' | 'temporary';
  displayLabel: string;
}

export interface ProjectControllerState {
  phase: 'temporary' | 'project';
  sessionKind: ProjectSessionKind;
  displayLabel: string;
  manifestProjectId: string | null;
  projectKey: string | null;
  access: 'readonly' | 'readwrite';
  name: string;
  readOnly: boolean;
  dirty: boolean;
  projectDirty: boolean | null;
  hasDiscardableChanges: boolean;
  previewing: boolean;
  needsRepair: boolean;
  corruptAutosaveIgnored: boolean;
  lifecycleBusy: boolean;
  canCreateProject: boolean;
  canOpenProject: boolean;
  canEnableEditing: boolean;
  canRepairProject: boolean;
  canWriteProject: boolean;
  canAddImport: boolean;
  canImport: boolean;
  canBrowseProject: boolean;
  canRestoreExport: boolean;
  canReturnToProject: boolean;
  canExport: boolean;
  persistenceLabel: string;
  message: string;
  pendingAutosave: boolean;
  imports: readonly StoredDocRef[];
  exports: readonly StoredDocRef[];
}

export class ProjectConflictError extends Error {
  override readonly name = 'ProjectConflictError';
}

const CORRUPT_AUTOSAVE_WARNING = 'Warning: autosave-view.json is corrupt and was ignored.';

type Listener = (state: ProjectControllerState) => void;

interface OpenProjectState {
  ref: ProjectRef;
  access: 'readonly' | 'readwrite';
  manifest: VisualSpecsProjectManifestV1;
  manifestRaw: ParsedProjectManifest['raw'];
  manifestFingerprint: string;
  currentText: string;
  currentRevision: DocRevision;
  needsRepair: boolean;
  pendingAutosave?: VisualSpecsView;
  imports: readonly StoredDocRef[];
  exports: readonly StoredDocRef[];
}

interface InspectedHead {
  parsed: ParsedProjectManifest;
  loaded: LoadedDoc;
  revision: DocRevision;
  fingerprint: string;
}

interface PreviewReturn {
  view: ViewState;
  dirty: boolean;
}

interface OperationGuard {
  epoch: number;
  sessionEpoch: number;
  projectRefId: string | null;
  manifestProjectId: string | null;
}

interface ProjectCandidate {
  loaded: LoadedDoc;
  project: OpenProjectState;
  warnings: string[];
  corruptAutosaveIgnored: boolean;
  message: string;
}

export class ProjectController {
  private readonly controller: Controller;
  private readonly store: ProjectStore;
  private readonly limits: Limits;
  private readonly listeners = new Set<Listener>();
  private project: OpenProjectState | null = null;
  private previewReturn: PreviewReturn | null = null;
  private message = 'Temporary JSON. Project persistence is not active.';
  private warnings: string[] = [];
  private loading = false;
  private dirty = false;
  private sessionKind: ProjectSessionKind;
  private displayLabel: string;
  private corruptAutosaveIgnored = false;
  private lifecycleBusy = false;
  private operationEpoch = 0;
  private sessionEpoch = 0;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private lastViewKey = '';

  constructor(
    controller: Controller,
    store: ProjectStore,
    limits: Limits = DEFAULT_LIMITS,
    initialIdentity: InitialSessionIdentity = {
      sessionKind: 'temporary',
      displayLabel: 'Temporary JSON',
    },
  ) {
    this.controller = controller;
    this.store = store;
    this.limits = limits;
    this.sessionKind = initialIdentity.sessionKind;
    this.displayLabel = initialIdentity.displayLabel;
    this.lastViewKey = viewKey(controller.state.view);
    controller.subscribe((state) => {
      const key = viewKey(state.view);
      if (this.loading || key === this.lastViewKey) {
        this.lastViewKey = key;
        return;
      }
      this.lastViewKey = key;
      this.dirty = true;
      this.scheduleAutosave();
      this.notify();
    });
  }

  snapshot(): ProjectControllerState {
    const caps = this.store.capabilities();
    const readOnly = this.controller.state.readOnly;
    const previewing = this.previewReturn !== null;
    const needsRepair = this.project?.needsRepair === true;
    const hasProject = this.project !== null;
    const available = !this.lifecycleBusy;
    const hasWriteAccess =
      available && hasProject && this.project?.access === 'readwrite' && !needsRepair && !previewing;
    const canWriteProject = hasWriteAccess && !readOnly;
    const projectDirty =
      this.project === null ? null : previewing ? (this.previewReturn?.dirty ?? false) : this.dirty;
    const fallback = caps.canSaveFile ? 'save picker' : 'download';
    return {
      phase: hasProject ? 'project' : 'temporary',
      sessionKind: this.sessionKind,
      displayLabel: this.displayLabel,
      manifestProjectId: this.project?.manifest.project.id ?? null,
      projectKey: this.project?.ref.id ?? null,
      access: this.project?.access ?? 'readonly',
      name: this.project?.manifest.project.name ?? '',
      readOnly,
      dirty: this.dirty,
      projectDirty,
      hasDiscardableChanges: this.dirty || projectDirty === true,
      previewing,
      needsRepair,
      corruptAutosaveIgnored: this.corruptAutosaveIgnored,
      lifecycleBusy: this.lifecycleBusy,
      canCreateProject:
        available &&
        caps.canPickDirectory &&
        caps.canWriteProjectDirectory &&
        !readOnly &&
        !previewing,
      canOpenProject: available && caps.canPickDirectory,
      canEnableEditing:
        available &&
        hasProject &&
        this.project?.access === 'readonly' &&
        !needsRepair &&
        !previewing &&
        caps.canWriteProjectDirectory,
      canRepairProject:
        available && hasProject && needsRepair && !previewing && caps.canWriteProjectDirectory,
      canWriteProject,
      canAddImport: hasWriteAccess && caps.canOpenTemporaryJson,
      canImport: hasWriteAccess,
      canBrowseProject: available && hasProject && !previewing,
      canRestoreExport: hasWriteAccess,
      canReturnToProject: available && previewing,
      canExport: available && !readOnly,
      persistenceLabel:
        this.project === null
          ? caps.kind === 'filesystem'
            ? `No project open; export uses ${fallback}.`
            : `No project persistence in this browser; temporary open and ${fallback} only.`
          : previewing
            ? `Project access: ${this.project.access === 'readwrite' ? 'editable' : 'read-only'}. Preview only; the project remains open and export uses ${fallback}.`
            : this.project.access === 'readwrite' && !needsRepair
              ? 'Project access: editable. Project writes go to .visual-specs.'
              : `Project access: read-only. Export uses ${fallback}.`,
      message: [this.message, ...this.warnings].filter((part) => part !== '').join(' '),
      pendingAutosave: this.project?.pendingAutosave !== undefined,
      imports: this.project?.imports ?? [],
      exports: this.project?.exports ?? [],
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Marks composition-root initialization (for example the first Fit) as baseline. */
  markClean(): void {
    this.dirty = false;
    this.notify();
  }

  async createProject(name: string): Promise<void> {
    const validatedName = validateProjectName(name);
    const currentText = this.controller.exportText();
    const projectId = newId();
    const docId = newId();
    const nowUtc = new Date().toISOString();
    const guard = this.beginOperation();
    try {
      const snapshot = await this.store.createProject(() => {
        const manifest = makeProjectManifest({
          id: projectId,
          name: validatedName,
          docId,
          revision: computeDocRevision(currentText, this.limits),
          nowUtc,
        });
        const manifestText = projectManifestText(manifest);
        parseProjectManifest(manifestText, this.limits);
        importDoc(currentText, this.limits);
        return {
          manifestText,
          currentText,
          gitignoreText: '/data/autosave-view.json\n/exports/\n/backups/\n',
          gitattributesText: '* text eol=lf\n',
        };
      });
      const candidate = await this.prepareProjectCandidate(snapshot, 'Created project.');
      if (this.operationIsCurrent(guard)) this.commitProjectCandidate(candidate);
    } finally {
      this.settleOperation(guard);
    }
  }

  async openProject(): Promise<void> {
    const guard = this.beginOperation();
    try {
      const snapshot = await this.store.openProjectRead();
      const candidate = await this.prepareProjectCandidate(snapshot, 'Opened project read-only.');
      if (this.operationIsCurrent(guard)) this.commitProjectCandidate(candidate);
    } finally {
      this.settleOperation(guard);
    }
  }

  async enableEditing(): Promise<void> {
    const project = this.requireProject();
    if (project.needsRepair) throw new Error('Repair the project revision mismatch first.');
    const guard = this.beginOperation();
    try {
      const snapshot = await this.store.enableEditing(project.ref);
      const inspected = this.assertFresh(project, snapshot, 'Enable editing');
      this.completeOperation(guard, () => {
        this.project = {
          ...project,
          access: 'readwrite',
          manifest: inspected.parsed.manifest,
          manifestRaw: inspected.parsed.raw,
          manifestFingerprint: inspected.fingerprint,
          currentText: snapshot.currentText,
        };
        this.message = 'Editing enabled; the in-memory view was preserved after a fresh re-read.';
      });
    } catch (err) {
      this.handlePermissionFailure(err, guard);
      if (err instanceof ProjectConflictError) {
        throw new ProjectConflictError(
          err.message + ' Reopen the project before retrying Enable editing.',
        );
      }
      throw err;
    } finally {
      this.settleOperation(guard);
    }
  }

  async repairProject(): Promise<void> {
    const project = this.requireProject();
    if (!project.needsRepair) return;
    const guard = this.beginOperation();
    let snapshot: ProjectSnapshot;
    try {
      snapshot = await this.store.enableEditing(project.ref);
    } catch (err) {
      this.handlePermissionFailure(err, guard);
      this.settleOperation(guard);
      throw err;
    }
    try {
      const inspected = this.assertRepairHead(project, snapshot, 'Repair');
      const nowUtc = new Date().toISOString();
      const manifest = withProjectUpdate(inspected.parsed.manifest, {
        revision: inspected.revision,
        committedAtUtc: nowUtc,
        updatedAtUtc: nowUtc,
      });
      const manifestText = projectManifestText(manifest, inspected.parsed.raw);
      const parsed = parseProjectManifest(manifestText, this.limits);
      await this.withPermissionHandling(
        () =>
          this.store.updateManifest({
            ref: project.ref,
            manifestText,
            verifyFresh: (actual) => {
              this.assertRepairHead(project, actual, 'Repair');
            },
          }),
        guard,
      );
      this.completeOperation(guard, () => {
        this.cancelAutosave();
        this.project = {
          ...project,
          access: 'readwrite',
          manifest,
          manifestRaw: parsed.raw,
          manifestFingerprint: projectManifestText(parsed.manifest, parsed.raw),
          currentText: snapshot.currentText,
          currentRevision: inspected.revision,
          needsRepair: false,
        };
        this.message = 'Repaired project.json explicitly by adopting the validated current document.';
      });
    } finally {
      this.settleOperation(guard);
    }
  }

  async renameProject(name: string): Promise<void> {
    const project = this.requireProject();
    this.requireWritable();
    const nowUtc = new Date().toISOString();
    const manifest = withProjectUpdate(project.manifest, {
      name: validateProjectName(name),
      updatedAtUtc: nowUtc,
    });
    const text = projectManifestText(manifest, project.manifestRaw);
    const parsed = parseProjectManifest(text, this.limits);
    const guard = this.beginOperation();
    try {
      await this.withPermissionHandling(
        () =>
          this.store.updateManifest({
            ref: project.ref,
            manifestText: text,
            verifyFresh: (actual) => {
              this.assertFresh(project, actual, 'Rename');
            },
          }),
        guard,
      );
      this.completeOperation(guard, () => {
        this.project = {
          ...project,
          manifest,
          manifestRaw: parsed.raw,
          manifestFingerprint: projectManifestText(parsed.manifest, parsed.raw),
        };
        this.displayLabel = manifest.project.name;
        this.message = 'Project renamed to ' + manifest.project.name + '.';
      });
    } finally {
      this.settleOperation(guard);
    }
  }

  async saveCurrent(): Promise<void> {
    const project = this.requireProject();
    this.requireWritable();
    const currentText = this.controller.exportText();
    const revision = computeDocRevision(currentText, this.limits);
    importDoc(currentText, this.limits);
    const nowUtc = new Date().toISOString();
    const manifest = withProjectUpdate(project.manifest, {
      revision,
      committedAtUtc: nowUtc,
      updatedAtUtc: nowUtc,
    });
    const manifestText = projectManifestText(manifest, project.manifestRaw);
    const parsed = parseProjectManifest(manifestText, this.limits);
    const guard = this.beginOperation();
    try {
      await this.withPermissionHandling(
        () =>
          this.store.commitCurrent({
            ref: project.ref,
            prepare: (actual) => {
              this.assertFresh(project, actual, 'Save');
              return { manifestText, currentText, clearAutosaveView: true };
            },
          }),
        guard,
      );
      this.completeOperation(guard, () => {
        this.project = {
          ...project,
          manifest,
          manifestRaw: parsed.raw,
          manifestFingerprint: projectManifestText(parsed.manifest, parsed.raw),
          currentText,
          currentRevision: revision,
          pendingAutosave: undefined,
        };
        this.dirty = false;
        this.clearCorruptAutosaveWarning();
        this.message = 'Saved current document and manifest.';
      });
    } finally {
      this.settleOperation(guard);
    }
  }

  async addJsonToProject(): Promise<void> {
    const project = this.requireProject();
    this.requireProjectWriteAccess();
    const guard = this.beginOperation();
    try {
      const source = await this.store.pickExternalJson();
      if (source.sizeBytes > this.limits.maxBytes) {
        throw new Error(
          source.sourceName +
            ' is ' +
            source.sizeBytes +
            ' bytes, over the ' +
            this.limits.maxBytes +
            ' byte cap.',
        );
      }
      const text = await source.readText(this.limits.maxBytes);
      importDoc(text, this.limits);
      const stored = await this.withPermissionHandling(
        () =>
          this.store.writeImport(
            project.ref,
            timestampedJsonName(sourceStem(source.sourceName)),
            text,
          ),
        guard,
      );
      this.completeOperation(guard, () => {
        this.project = { ...project, imports: [...project.imports, stored].sort(compareStored) };
        this.message = 'Added ' + stored.fileName + ' to imports.';
      });
    } finally {
      this.settleOperation(guard);
    }
  }

  async refreshImports(): Promise<void> {
    const project = this.requireProject();
    const guard = this.beginOperation();
    try {
      const imports = await this.store.listStoredDocs(project.ref, 'imports');
      this.completeOperation(guard, () => {
        this.project = { ...project, imports };
        this.message = 'Refreshed imports.';
      });
    } finally {
      this.settleOperation(guard);
    }
  }

  async refreshExports(): Promise<void> {
    const project = this.requireProject();
    const guard = this.beginOperation();
    try {
      const exports = await this.store.listStoredDocs(project.ref, 'exports');
      this.completeOperation(guard, () => {
        this.project = { ...project, exports };
        this.message = 'Refreshed export copies.';
      });
    } finally {
      this.settleOperation(guard);
    }
  }

  async importStoredDoc(doc: StoredDocRef): Promise<void> {
    if (doc.area !== 'imports') throw new Error('Import JSON only reads the imports area.');
    await this.replaceFromStored(doc, `Imported ${doc.fileName} as current.`);
  }

  async previewStoredExport(doc: StoredDocRef): Promise<void> {
    const project = this.requireProject();
    if (doc.area !== 'exports') throw new Error('Open Export Copy only reads the exports area.');
    const guard = this.beginOperation();
    try {
      const text = await this.store.readStoredDoc(project.ref, doc);
      const loaded = importDoc(text, this.limits);
      if (this.operationIsCurrent(guard, true)) {
        this.beginProjectPreview(
          loaded,
          'Previewing export copy ' + doc.fileName + '. Use Return to project when done.',
        );
      }
    } finally {
      this.settleOperation(guard);
    }
  }

  async restoreStoredExport(doc: StoredDocRef): Promise<void> {
    if (doc.area !== 'exports') throw new Error('Restore from Export only reads the exports area.');
    await this.replaceFromStored(doc, `Restored ${doc.fileName} as current.`);
  }

  returnToProject(): void {
    const project = this.requireProject();
    if (this.previewReturn === null) return;
    const returning = this.previewReturn;
    const loaded = importDoc(project.currentText, this.limits);
    this.invalidateOperations();
    this.installLoadedSession(
      loaded,
      () => {
        this.previewReturn = null;
        this.dirty = returning.dirty;
        this.sessionKind = 'project';
        this.displayLabel = project.manifest.project.name;
        this.message = 'Returned to the open project; its permission and in-memory view were preserved.';
      },
      returning.view,
    );
    if (returning.dirty) this.scheduleAutosave();
  }

  openTemporaryText(sourceName: string, text: string): void {
    const loaded = importDoc(text, this.limits);
    this.loadTemporaryLoaded(
      loaded,
      sourceName,
      'Opened ' + sourceName + ' temporarily. This did not write .visual-specs.',
    );
  }

  async openTemporaryPicked(): Promise<void> {
    const guard = this.beginOperation();
    try {
      const source = await this.store.pickExternalJson();
      await this.readTemporarySource(source, guard);
    } finally {
      this.settleOperation(guard);
    }
  }

  /**
   * Browser-input counterpart to openTemporaryPicked(). The native input picker is
   * activated synchronously by the UI; once it yields a File, this method owns the
   * bounded asynchronous read under the same epoch/session fence as every other load.
   */
  async openTemporarySource(source: PickedTextSource): Promise<void> {
    const guard = this.beginOperation();
    try {
      await this.readTemporarySource(source, guard);
    } finally {
      this.settleOperation(guard);
    }
  }

  async exportJson(): Promise<void> {
    const text = this.controller.exportText();
    const name = this.project?.manifest.project.name ?? 'visual-specs';
    const projectRef =
      this.project !== null &&
      this.project.access === 'readwrite' &&
      !this.project.needsRepair &&
      this.previewReturn === null
        ? this.project.ref
        : null;
    const action = () =>
      this.store.exportPortable({
        project: projectRef,
        suggestedName: timestampedJsonName(name),
        text,
      });
    const guard = this.beginOperation();
    try {
      const result =
        projectRef === null ? await action() : await this.withPermissionHandling(action, guard);
      this.completeOperation(guard, () => {
        this.message =
          result.mode === 'project-export'
            ? 'Exported ' + result.fileName + ' to .visual-specs/exports.'
            : 'Exported ' +
              result.fileName +
              ' using ' +
              result.mode +
              '; .visual-specs was not written.';
      });
    } finally {
      this.settleOperation(guard);
    }
  }

  async exportAutosaveCopy(): Promise<void> {
    const project = this.requireProject();
    if (this.controller.state.readOnly) {
      throw new Error('This document is read-only because it declares unsupported requirements.');
    }
    if (project.pendingAutosave === undefined) return;
    const view = toViewState(project.pendingAutosave, this.controller.state.view);
    const text = exportDoc({ raw: this.controller.state.raw, view, readOnly: false });
    const projectRef = project.access === 'readwrite' && !project.needsRepair ? project.ref : null;
    const action = () =>
      this.store.exportPortable({
        project: projectRef,
        suggestedName: timestampedJsonName(`${project.manifest.project.name}-autosave`),
        text,
      });
    const guard = this.beginOperation();
    try {
      const result =
        projectRef === null ? await action() : await this.withPermissionHandling(action, guard);
      this.completeOperation(guard, () => {
        this.message =
          'Exported autosave copy ' + result.fileName + ' using ' + result.mode + '.';
      });
    } finally {
      this.settleOperation(guard);
    }
  }

  restoreAutosaveView(): void {
    const project = this.requireProject();
    if (project.pendingAutosave === undefined) return;
    const view = toViewState(project.pendingAutosave, this.controller.state.view);
    this.invalidateOperations();
    this.installViewState(view, () => {
      this.project = { ...project, pendingAutosave: undefined };
      this.dirty = true;
      this.message = 'Restored autosave view in memory.';
    });
    this.scheduleAutosave();
  }

  keepCurrentView(): void {
    if (this.project === null) return;
    this.invalidateOperations();
    this.project = { ...this.project, pendingAutosave: undefined };
    this.message = 'Kept current view.';
    this.notify();
  }

  private async replaceFromStored(doc: StoredDocRef, successMessage: string): Promise<void> {
    const project = this.requireProject();
    if (this.previewReturn !== null) throw new Error('Return to the project before replacing its current document.');
    const guard = this.beginOperation();
    try {
      const firstText = await this.store.readStoredDoc(project.ref, doc);
      const firstLoaded = importDoc(firstText, this.limits);
      if (firstLoaded.readOnly) {
        if (this.operationIsCurrent(guard, true)) {
          this.beginProjectPreview(
            firstLoaded,
            'Previewing read-only ' +
              (doc.area === 'imports' ? 'import' : 'export') +
              ' ' +
              doc.fileName +
              '. Use Return to project when done.',
          );
        }
        return;
      }
      if (project.needsRepair) {
        throw new Error('Repair the project revision mismatch before writing it.');
      }
      if (project.access !== 'readwrite') throw new Error('Project is open read-only.');

      let committed:
        | {
            text: string;
            loaded: LoadedDoc;
            manifest: VisualSpecsProjectManifestV1;
            parsed: ParsedProjectManifest;
            revision: DocRevision;
          }
        | undefined;
      await this.withPermissionHandling(
        () =>
          this.store.commitCurrent({
            ref: project.ref,
            source: doc,
            prepare: (actual, sourceText) => {
              const inspected = this.assertFresh(
                project,
                actual,
                doc.area === 'imports' ? 'Import' : 'Restore',
              );
              if (sourceText === undefined) throw new Error('Stored source was not re-read.');
              const loaded = importDoc(sourceText, this.limits);
              if (loaded.readOnly) {
                throw new Error('The stored document became read-only and was not used to replace current.');
              }
              const revision = computeDocRevision(sourceText, this.limits);
              const nowUtc = new Date().toISOString();
              const manifest = withProjectUpdate(inspected.parsed.manifest, {
                revision,
                committedAtUtc: nowUtc,
                updatedAtUtc: nowUtc,
              });
              const manifestText = projectManifestText(manifest, inspected.parsed.raw);
              const parsed = parseProjectManifest(manifestText, this.limits);
              committed = { text: sourceText, loaded, manifest, parsed, revision };
              return { manifestText, currentText: sourceText, clearAutosaveView: true };
            },
          }),
        guard,
      );
      if (committed === undefined) throw new Error('Stored document commit did not complete.');
      if (!this.operationIsCurrent(guard, true)) return;
      const completed = committed;
      this.installLoadedSession(completed.loaded, () => {
        this.cancelAutosave();
        this.project = {
          ...project,
          manifest: completed.manifest,
          manifestRaw: completed.parsed.raw,
          manifestFingerprint: projectManifestText(
            completed.parsed.manifest,
            completed.parsed.raw,
          ),
          currentText: completed.text,
          currentRevision: completed.revision,
          pendingAutosave: undefined,
        };
        this.previewReturn = null;
        this.dirty = false;
        this.sessionKind = 'project';
        this.displayLabel = completed.manifest.project.name;
        this.clearCorruptAutosaveWarning();
        this.message = successMessage;
      });
    } finally {
      this.settleOperation(guard);
    }
  }

  private async readTemporarySource(
    source: PickedTextSource,
    guard: OperationGuard,
  ): Promise<void> {
    if (source.sizeBytes > this.limits.maxBytes) {
      throw new Error(
        source.sourceName +
          ' is ' +
          source.sizeBytes +
          ' bytes, over the ' +
          this.limits.maxBytes +
          ' byte cap.',
      );
    }
    const text = await source.readText(this.limits.maxBytes);
    const loaded = importDoc(text, this.limits);
    if (this.operationIsCurrent(guard, true)) {
      this.loadTemporaryLoaded(
        loaded,
        source.sourceName,
        'Opened ' + source.sourceName + ' temporarily. This did not write .visual-specs.',
      );
    }
  }

  private async prepareProjectCandidate(
    snapshot: {
      ref: ProjectRef;
      access: 'readonly' | 'readwrite';
      manifestText: string;
      currentText: string;
      autosaveViewText?: string;
    },
    message: string,
  ): Promise<ProjectCandidate> {
    const inspected = this.inspectHead(snapshot);
    const needsRepair = inspected.revision !== inspected.parsed.manifest.current.revision;
    let pendingAutosave: VisualSpecsView | undefined;
    const warnings: string[] = [];
    let corruptAutosaveIgnored = false;
    if (snapshot.autosaveViewText !== undefined) {
      try {
        const autosave = parseAutosaveView(snapshot.autosaveViewText, this.limits);
        if (
          autosaveMatches(autosave, {
            projectId: inspected.parsed.manifest.project.id,
            docId: inspected.parsed.manifest.current.docId,
            revision: inspected.revision,
          })
        ) {
          pendingAutosave = autosave.view;
        }
      } catch {
        warnings.push(CORRUPT_AUTOSAVE_WARNING);
        corruptAutosaveIgnored = true;
      }
    }

    // Stored-document lists are part of the candidate, not best-effort decoration.
    // If either read fails, the old complete session remains installed and the
    // action-specific UI error reports the failed Open/Create operation.
    const [imports, exports] = await Promise.all([
      this.store.listStoredDocs(snapshot.ref, 'imports'),
      this.store.listStoredDocs(snapshot.ref, 'exports'),
    ]);
    const project: OpenProjectState = {
      ref: snapshot.ref,
      access: needsRepair ? 'readonly' : snapshot.access,
      manifest: inspected.parsed.manifest,
      manifestRaw: inspected.parsed.raw,
      manifestFingerprint: inspected.fingerprint,
      currentText: snapshot.currentText,
      currentRevision: inspected.revision,
      needsRepair,
      pendingAutosave,
      imports,
      exports,
    };
    return {
      loaded: inspected.loaded,
      project,
      warnings,
      corruptAutosaveIgnored,
      message: needsRepair
        ? message +
          ' project.json and data/current.json disagree. The validated current opened safely read-only; use Repair project to adopt it explicitly.'
        : pendingAutosave === undefined
          ? message
          : message + ' Autosave view is available.',
    };
  }

  private commitProjectCandidate(candidate: ProjectCandidate): void {
    this.installLoadedSession(candidate.loaded, () => {
      this.cancelAutosave();
      this.previewReturn = null;
      this.dirty = false;
      this.project = candidate.project;
      this.sessionKind = 'project';
      this.displayLabel = candidate.project.manifest.project.name;
      this.warnings = candidate.warnings;
      this.corruptAutosaveIgnored = candidate.corruptAutosaveIgnored;
      this.message = candidate.message;
    });
  }

  private beginProjectPreview(loaded: LoadedDoc, message: string): void {
    const returning =
      this.previewReturn ?? { view: cloneView(this.controller.state.view), dirty: this.dirty };
    this.installLoadedSession(loaded, () => {
      this.cancelAutosave();
      this.previewReturn = returning;
      this.dirty = false;
      this.sessionKind = 'project-preview';
      this.displayLabel = this.project?.manifest.project.name ?? this.displayLabel;
      this.message = message;
    });
  }

  private loadTemporaryLoaded(loaded: LoadedDoc, displayLabel: string, message: string): void {
    this.invalidateOperations();
    this.installLoadedSession(loaded, () => {
      this.cancelAutosave();
      this.project = null;
      this.previewReturn = null;
      this.dirty = false;
      this.sessionKind = 'temporary';
      this.displayLabel = displayLabel;
      this.warnings = [];
      this.corruptAutosaveIgnored = false;
      this.message = message;
    });
  }

  private scheduleAutosave(resumeGuard?: OperationGuard): void {
    this.cancelAutosave();
    if (!this.autosaveIsSafe(resumeGuard)) return;
    const guard = this.captureOperationGuard();
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      void this.flushAutosave(guard);
    }, 350);
  }

  private autosaveIsSafe(guard?: OperationGuard): boolean {
    const project = this.project;
    return (
      this.dirty &&
      project !== null &&
      !this.lifecycleBusy &&
      project.access === 'readwrite' &&
      !project.needsRepair &&
      this.previewReturn === null &&
      !this.controller.state.readOnly &&
      (guard === undefined || this.operationIsCurrent(guard, true))
    );
  }

  private async flushAutosave(guard: OperationGuard): Promise<void> {
    const project = this.project;
    if (project === null || !this.autosaveIsSafe(guard)) {
      return;
    }
    const view = toVisualSpecsView(this.controller.state.view);
    const text = autosaveViewText({
      schema: 'visual-specs.autosave-view',
      formatVersion: '1.0',
      projectId: project.manifest.project.id,
      docId: project.manifest.current.docId,
      baseRevision: project.currentRevision,
      savedAtUtc: new Date().toISOString(),
      view,
    });
    try {
      await this.store.writeAutosaveView(project.ref, text);
      if (this.backgroundIsCurrent(guard)) {
        this.clearCorruptAutosaveWarning();
        this.message = 'Autosaved view.';
        this.notify();
      }
    } catch (err) {
      if (isPermissionDenied(err) && this.backgroundIsCurrent(guard)) {
        this.handlePermissionFailure(err, guard, false);
      } else if (!isPermissionDenied(err) && this.backgroundIsCurrent(guard)) {
        this.message = err instanceof Error ? `Autosave failed. ${err.message}` : 'Autosave failed.';
        this.notify();
      }
    }
  }

  private inspectHead(actual: ProjectHead): InspectedHead {
    const parsed = parseProjectManifest(actual.manifestText, this.limits);
    const loaded = importDoc(actual.currentText, this.limits);
    const revision = computeDocRevision(actual.currentText, this.limits);
    return {
      parsed,
      loaded,
      revision,
      fingerprint: projectManifestText(parsed.manifest, parsed.raw),
    };
  }

  private assertFresh(
    expected: OpenProjectState,
    actual: ProjectHead,
    operation: string,
  ): InspectedHead {
    let inspected: InspectedHead;
    try {
      inspected = this.inspectHead(actual);
    } catch (err) {
      throw conflict(operation, `project files changed externally and are now invalid. ${errorMessage(err)}`);
    }
    if (inspected.revision !== inspected.parsed.manifest.current.revision) {
      throw conflict(operation, 'project.json and data/current.json changed into a mismatched revision pair.');
    }
    if (
      inspected.revision !== expected.currentRevision ||
      inspected.fingerprint !== expected.manifestFingerprint
    ) {
      throw conflict(operation, 'project files changed externally since they were opened.');
    }
    return inspected;
  }

  private assertRepairHead(
    expected: OpenProjectState,
    actual: ProjectHead,
    operation: string,
  ): InspectedHead {
    let inspected: InspectedHead;
    try {
      inspected = this.inspectHead(actual);
    } catch (err) {
      throw conflict(operation, `project files changed externally and are now invalid. ${errorMessage(err)}`);
    }
    if (
      inspected.revision !== expected.currentRevision ||
      inspected.fingerprint !== expected.manifestFingerprint
    ) {
      throw conflict(operation, 'the mismatched project changed again; reopen it before repairing.');
    }
    return inspected;
  }

  private async withPermissionHandling<T>(
    action: () => Promise<T>,
    guard: OperationGuard,
  ): Promise<T> {
    try {
      return await action();
    } catch (err) {
      this.handlePermissionFailure(err, guard);
      throw err;
    }
  }

  private handlePermissionFailure(
    err: unknown,
    guard: OperationGuard,
    requireOperationCurrent = true,
  ): void {
    const current = requireOperationCurrent
      ? this.operationIsCurrent(guard, true)
      : this.sessionIsCurrent(guard);
    if (!isPermissionDenied(err) || this.project === null || !current) return;
    this.cancelAutosave();
    this.project = { ...this.project, access: 'readonly' };
    this.message = `Write permission was revoked; the project is read-only and autosave stopped. ${errorMessage(err)}`;
    if (!this.lifecycleBusy) this.notify();
  }

  private cancelAutosave(): void {
    if (this.autosaveTimer !== null) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
  }

  private clearCorruptAutosaveWarning(): void {
    this.warnings = this.warnings.filter((warning) => warning !== CORRUPT_AUTOSAVE_WARNING);
    this.corruptAutosaveIgnored = false;
  }

  private beginOperation(): OperationGuard {
    // A foreground lifecycle/write action owns the next completion. A pending
    // background autosave is cancelled; an already-started one is still fenced by
    // its captured session token in flushAutosave(). The winning close re-arms
    // recovery only when this same dirty session remains autosave-safe.
    this.cancelAutosave();
    this.operationEpoch += 1;
    const guard = this.captureOperationGuard();
    this.lifecycleBusy = true;
    this.notify();
    return guard;
  }

  private captureOperationGuard(): OperationGuard {
    return {
      epoch: this.operationEpoch,
      sessionEpoch: this.sessionEpoch,
      projectRefId: this.project?.ref.id ?? null,
      manifestProjectId: this.project?.manifest.project.id ?? null,
    };
  }

  private invalidateOperations(): void {
    this.operationEpoch += 1;
    this.lifecycleBusy = false;
  }

  private operationIsCurrent(guard: OperationGuard, requireSameSession = false): boolean {
    if (guard.epoch !== this.operationEpoch) return false;
    return !requireSameSession || this.sessionIsCurrent(guard);
  }

  private sessionIsCurrent(guard: OperationGuard): boolean {
    return (
      guard.sessionEpoch === this.sessionEpoch &&
      guard.projectRefId === (this.project?.ref.id ?? null) &&
      guard.manifestProjectId === (this.project?.manifest.project.id ?? null)
    );
  }

  private backgroundIsCurrent(guard: OperationGuard): boolean {
    return (
      !this.lifecycleBusy &&
      guard.epoch === this.operationEpoch &&
      this.sessionIsCurrent(guard)
    );
  }

  private completeOperation(
    guard: OperationGuard,
    install: () => void,
    requireSameSession = true,
  ): boolean {
    if (!this.operationIsCurrent(guard, requireSameSession)) return false;
    install();
    this.lifecycleBusy = false;
    this.scheduleAutosave(guard);
    this.notify();
    return true;
  }

  private settleOperation(guard: OperationGuard): void {
    if (guard.epoch !== this.operationEpoch || !this.lifecycleBusy) return;
    this.lifecycleBusy = false;
    this.scheduleAutosave(guard);
    this.notify();
  }

  private installLoadedSession(
    loaded: LoadedDoc,
    install: () => void,
    viewOverride?: ViewState,
  ): void {
    this.loading = true;
    try {
      this.controller.installLoaded(
        loaded,
        () => {
          install();
          this.sessionEpoch += 1;
          this.lastViewKey = viewKey(this.controller.state.view);
          this.lifecycleBusy = false;
          this.notify();
        },
        viewOverride,
      );
    } finally {
      this.loading = false;
      this.lastViewKey = viewKey(this.controller.state.view);
    }
  }

  private installViewState(view: ViewState, install: () => void): void {
    this.loading = true;
    try {
      this.controller.installView(view, () => {
        install();
        this.lastViewKey = viewKey(this.controller.state.view);
        this.lifecycleBusy = false;
        this.notify();
      });
    } finally {
      this.loading = false;
      this.lastViewKey = viewKey(this.controller.state.view);
    }
  }

  private requireProject(): OpenProjectState {
    if (this.project === null) throw new Error('No Visual Specs project is open.');
    return this.project;
  }

  private requireProjectWriteAccess(): OpenProjectState {
    const project = this.requireProject();
    if (this.previewReturn !== null) throw new Error('Return to the project before writing it.');
    if (project.needsRepair) throw new Error('Repair the project revision mismatch before writing it.');
    if (project.access !== 'readwrite') throw new Error('Project is open read-only.');
    return project;
  }

  private requireWritable(): OpenProjectState {
    const project = this.requireProjectWriteAccess();
    if (this.controller.state.readOnly) {
      throw new Error('This document is read-only because it declares unsupported requirements.');
    }
    return project;
  }

  private notify(): void {
    const state = this.snapshot();
    for (const listener of [...this.listeners]) listener(state);
  }
}

function toVisualSpecsView(view: ViewState): VisualSpecsView {
  const positions: VisualSpecsView['positions'] = Object.create(null) as NonNullable<
    VisualSpecsView['positions']
  >;
  for (const [id, p] of view.positions) {
    positions[id] = p.pinned === true ? { x: p.x, y: p.y, pinned: true } : { x: p.x, y: p.y };
  }
  return {
    positions,
    expanded: [...view.expanded].sort(),
    viewport: view.viewport,
  };
}

function toViewState(view: VisualSpecsView, fallback: ViewState): ViewState {
  const positions = new Map(fallback.positions);
  if (view.positions !== undefined) {
    positions.clear();
    for (const [id, p] of Object.entries(view.positions)) positions.set(id, p);
  }
  return {
    positions,
    expanded: view.expanded === undefined ? fallback.expanded : new Set(view.expanded),
    viewport: view.viewport ?? fallback.viewport,
  };
}

function cloneView(view: ViewState): ViewState {
  return {
    positions: new Map(view.positions),
    expanded: new Set(view.expanded),
    viewport: { ...view.viewport },
  };
}

function viewKey(view: ViewState): string {
  return JSON.stringify(toVisualSpecsView(view));
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function sourceStem(name: string): string {
  return name.replace(/\.json$/iu, '');
}

function compareStored(a: StoredDocRef, b: StoredDocRef): number {
  return a.fileName.localeCompare(b.fileName);
}

function conflict(operation: string, detail: string): ProjectConflictError {
  return new ProjectConflictError(`${operation} aborted before any write: conflict — ${detail}`);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isPermissionDenied(err: unknown): boolean {
  const name = typeof err === 'object' && err !== null && 'name' in err ? String(err.name) : '';
  const message = errorMessage(err);
  return (
    name === 'NotAllowedError' ||
    name === 'SecurityError' ||
    /permission (?:was )?(?:denied|revoked|not granted)/iu.test(message)
  );
}

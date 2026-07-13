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
  ProjectHead,
  ProjectRef,
  ProjectSnapshot,
  ProjectStore,
  StoredDocRef,
} from '../ports/projectStore.ts';
import type { Controller } from './controller.ts';

export interface ProjectControllerState {
  phase: 'temporary' | 'project';
  projectKey: string | null;
  access: 'readonly' | 'readwrite';
  name: string;
  readOnly: boolean;
  dirty: boolean;
  previewing: boolean;
  needsRepair: boolean;
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
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private lastViewKey = '';

  constructor(controller: Controller, store: ProjectStore, limits: Limits = DEFAULT_LIMITS) {
    this.controller = controller;
    this.store = store;
    this.limits = limits;
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
    const hasWriteAccess = hasProject && this.project?.access === 'readwrite' && !needsRepair && !previewing;
    const canWriteProject = hasWriteAccess && !readOnly;
    const fallback = caps.canSaveFile ? 'save picker' : 'download';
    return {
      phase: hasProject ? 'project' : 'temporary',
      projectKey: this.project?.ref.id ?? null,
      access: this.project?.access ?? 'readonly',
      name: this.project?.manifest.project.name ?? '',
      readOnly,
      dirty: this.dirty,
      previewing,
      needsRepair,
      canCreateProject:
        caps.canPickDirectory && caps.canWriteProjectDirectory && !readOnly && !previewing,
      canOpenProject: caps.canPickDirectory,
      canEnableEditing:
        hasProject &&
        this.project?.access === 'readonly' &&
        !needsRepair &&
        !previewing &&
        caps.canWriteProjectDirectory,
      canRepairProject:
        hasProject && needsRepair && !previewing && caps.canWriteProjectDirectory,
      canWriteProject,
      canAddImport: hasWriteAccess && caps.canOpenTemporaryJson,
      canImport: hasWriteAccess,
      canBrowseProject: hasProject && !previewing,
      canRestoreExport: hasWriteAccess,
      canReturnToProject: previewing,
      canExport: !readOnly,
      persistenceLabel:
        this.project === null
          ? caps.kind === 'filesystem'
            ? `No project open; export uses ${fallback}.`
            : `No project persistence in this browser; temporary open and ${fallback} only.`
          : previewing
            ? `Preview only; the project remains open and export uses ${fallback}.`
            : this.project.access === 'readwrite' && !needsRepair
              ? 'Project writes go to .visual-specs.'
              : `Project is open read-only; export uses ${fallback}.`,
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
    const snapshot = await this.store.createProject(() => {
      const currentText = this.controller.exportText();
      const nowUtc = new Date().toISOString();
      const manifest = makeProjectManifest({
        id: newId(),
        name: validatedName,
        docId: newId(),
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
    await this.loadProjectSnapshot(snapshot, 'Created project.');
  }

  async openProject(): Promise<void> {
    const snapshot = await this.store.openProjectRead();
    await this.loadProjectSnapshot(snapshot, 'Opened project read-only.');
  }

  async enableEditing(): Promise<void> {
    const project = this.requireProject();
    if (project.needsRepair) throw new Error('Repair the project revision mismatch first.');
    try {
      const snapshot = await this.store.enableEditing(project.ref);
      const inspected = this.assertFresh(project, snapshot, 'Enable editing');
      this.project = {
        ...project,
        access: 'readwrite',
        manifest: inspected.parsed.manifest,
        manifestRaw: inspected.parsed.raw,
        manifestFingerprint: inspected.fingerprint,
        currentText: snapshot.currentText,
      };
      this.message = 'Editing enabled; the in-memory view was preserved after a fresh re-read.';
      this.notify();
    } catch (err) {
      this.handlePermissionFailure(err);
      if (err instanceof ProjectConflictError) {
        throw new ProjectConflictError(
          `${err.message} Reopen the project before retrying Enable editing.`,
        );
      }
      throw err;
    }
  }

  async repairProject(): Promise<void> {
    const project = this.requireProject();
    if (!project.needsRepair) return;
    let snapshot: ProjectSnapshot;
    try {
      snapshot = await this.store.enableEditing(project.ref);
    } catch (err) {
      this.handlePermissionFailure(err);
      throw err;
    }
    const inspected = this.assertRepairHead(project, snapshot, 'Repair');
    const nowUtc = new Date().toISOString();
    const manifest = withProjectUpdate(inspected.parsed.manifest, {
      revision: inspected.revision,
      committedAtUtc: nowUtc,
      updatedAtUtc: nowUtc,
    });
    const manifestText = projectManifestText(manifest, inspected.parsed.raw);
    const parsed = parseProjectManifest(manifestText, this.limits);
    await this.withPermissionHandling(() =>
      this.store.updateManifest({
        ref: project.ref,
        manifestText,
        verifyFresh: (actual) => {
          this.assertRepairHead(project, actual, 'Repair');
        },
      }),
    );
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
    this.notify();
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
    await this.withPermissionHandling(() =>
      this.store.updateManifest({
        ref: project.ref,
        manifestText: text,
        verifyFresh: (actual) => {
          this.assertFresh(project, actual, 'Rename');
        },
      }),
    );
    this.project = {
      ...project,
      manifest,
      manifestRaw: parsed.raw,
      manifestFingerprint: projectManifestText(parsed.manifest, parsed.raw),
    };
    this.message = `Project renamed to ${manifest.project.name}.`;
    this.notify();
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
    await this.withPermissionHandling(() =>
      this.store.commitCurrent({
        ref: project.ref,
        prepare: (actual) => {
          this.assertFresh(project, actual, 'Save');
          return { manifestText, currentText, clearAutosaveView: true };
        },
      }),
    );
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
    this.notify();
  }

  async addJsonToProject(): Promise<void> {
    const project = this.requireProject();
    this.requireProjectWriteAccess();
    const source = await this.store.pickExternalJson();
    if (source.sizeBytes > this.limits.maxBytes) {
      throw new Error(`${source.sourceName} is ${source.sizeBytes} bytes, over the ${this.limits.maxBytes} byte cap.`);
    }
    const text = await source.readText(this.limits.maxBytes);
    importDoc(text, this.limits);
    const stored = await this.withPermissionHandling(() =>
      this.store.writeImport(
        project.ref,
        timestampedJsonName(sourceStem(source.sourceName)),
        text,
      ),
    );
    this.project = { ...project, imports: [...project.imports, stored].sort(compareStored) };
    this.message = `Added ${stored.fileName} to imports.`;
    this.notify();
  }

  async refreshImports(): Promise<void> {
    const project = this.requireProject();
    const imports = await this.store.listStoredDocs(project.ref, 'imports');
    this.project = { ...project, imports };
    this.message = 'Refreshed imports.';
    this.notify();
  }

  async refreshExports(): Promise<void> {
    const project = this.requireProject();
    const exports = await this.store.listStoredDocs(project.ref, 'exports');
    this.project = { ...project, exports };
    this.message = 'Refreshed export copies.';
    this.notify();
  }

  async importStoredDoc(doc: StoredDocRef): Promise<void> {
    if (doc.area !== 'imports') throw new Error('Import JSON only reads the imports area.');
    await this.replaceFromStored(doc, `Imported ${doc.fileName} as current.`);
  }

  async previewStoredExport(doc: StoredDocRef): Promise<void> {
    const project = this.requireProject();
    if (doc.area !== 'exports') throw new Error('Open Export Copy only reads the exports area.');
    const text = await this.store.readStoredDoc(project.ref, doc);
    const loaded = importDoc(text, this.limits);
    this.beginProjectPreview(loaded, `Previewing export copy ${doc.fileName}. Use Return to project when done.`);
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
    this.loading = true;
    try {
      this.controller.replaceLoaded(loaded);
      this.controller.replaceView(returning.view);
    } finally {
      this.loading = false;
      this.lastViewKey = viewKey(this.controller.state.view);
    }
    this.previewReturn = null;
    this.dirty = returning.dirty;
    this.message = 'Returned to the open project; its permission and in-memory view were preserved.';
    this.notify();
  }

  openTemporaryText(sourceName: string, text: string): void {
    const loaded = importDoc(text, this.limits);
    this.loadTemporaryLoaded(loaded, `Opened ${sourceName} temporarily. This did not write .visual-specs.`);
  }

  async openTemporaryPicked(): Promise<void> {
    const source = await this.store.pickExternalJson();
    if (source.sizeBytes > this.limits.maxBytes) {
      throw new Error(`${source.sourceName} is ${source.sizeBytes} bytes, over the ${this.limits.maxBytes} byte cap.`);
    }
    this.openTemporaryText(source.sourceName, await source.readText(this.limits.maxBytes));
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
    const result = projectRef === null ? await action() : await this.withPermissionHandling(action);
    this.message =
      result.mode === 'project-export'
        ? `Exported ${result.fileName} to .visual-specs/exports.`
        : `Exported ${result.fileName} using ${result.mode}; .visual-specs was not written.`;
    this.notify();
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
    const result = projectRef === null ? await action() : await this.withPermissionHandling(action);
    this.message = `Exported autosave copy ${result.fileName} using ${result.mode}.`;
    this.notify();
  }

  restoreAutosaveView(): void {
    const project = this.requireProject();
    if (project.pendingAutosave === undefined) return;
    this.loading = true;
    try {
      this.controller.replaceView(toViewState(project.pendingAutosave, this.controller.state.view));
    } finally {
      this.loading = false;
      this.lastViewKey = viewKey(this.controller.state.view);
    }
    this.project = { ...project, pendingAutosave: undefined };
    this.dirty = true;
    this.message = 'Restored autosave view in memory.';
    this.notify();
  }

  keepCurrentView(): void {
    if (this.project === null) return;
    this.project = { ...this.project, pendingAutosave: undefined };
    this.message = 'Kept current view.';
    this.notify();
  }

  private async replaceFromStored(doc: StoredDocRef, successMessage: string): Promise<void> {
    const project = this.requireProject();
    if (this.previewReturn !== null) throw new Error('Return to the project before replacing its current document.');
    const firstText = await this.store.readStoredDoc(project.ref, doc);
    const firstLoaded = importDoc(firstText, this.limits);
    if (firstLoaded.readOnly) {
      this.beginProjectPreview(
        firstLoaded,
        `Previewing read-only ${doc.area === 'imports' ? 'import' : 'export'} ${doc.fileName}. Use Return to project when done.`,
      );
      return;
    }
    this.requireProjectWriteAccess();

    let committed:
      | {
          text: string;
          loaded: LoadedDoc;
          manifest: VisualSpecsProjectManifestV1;
          parsed: ParsedProjectManifest;
          revision: DocRevision;
        }
      | undefined;
    await this.withPermissionHandling(() =>
      this.store.commitCurrent({
        ref: project.ref,
        source: doc,
        prepare: (actual, sourceText) => {
          const inspected = this.assertFresh(project, actual, doc.area === 'imports' ? 'Import' : 'Restore');
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
    );
    if (committed === undefined) throw new Error('Stored document commit did not complete.');
    this.loading = true;
    try {
      this.controller.replaceLoaded(committed.loaded);
    } finally {
      this.loading = false;
      this.lastViewKey = viewKey(this.controller.state.view);
    }
    this.project = {
      ...project,
      manifest: committed.manifest,
      manifestRaw: committed.parsed.raw,
      manifestFingerprint: projectManifestText(committed.parsed.manifest, committed.parsed.raw),
      currentText: committed.text,
      currentRevision: committed.revision,
      pendingAutosave: undefined,
    };
    this.dirty = false;
    this.clearCorruptAutosaveWarning();
    this.message = successMessage;
    this.notify();
  }

  private async loadProjectSnapshot(
    snapshot: {
      ref: ProjectRef;
      access: 'readonly' | 'readwrite';
      manifestText: string;
      currentText: string;
      autosaveViewText?: string;
    },
    message: string,
  ): Promise<void> {
    const inspected = this.inspectHead(snapshot);
    const needsRepair = inspected.revision !== inspected.parsed.manifest.current.revision;
    let pendingAutosave: VisualSpecsView | undefined;
    const warnings: string[] = [];
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
      }
    }

    this.loading = true;
    try {
      this.controller.replaceLoaded(inspected.loaded);
    } finally {
      this.loading = false;
      this.lastViewKey = viewKey(this.controller.state.view);
    }
    const [imports, exports] = await Promise.all([
      this.store.listStoredDocs(snapshot.ref, 'imports').catch(() => []),
      this.store.listStoredDocs(snapshot.ref, 'exports').catch(() => []),
    ]);
    this.cancelAutosave();
    this.previewReturn = null;
    this.dirty = false;
    this.project = {
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
    this.warnings = warnings;
    this.message = needsRepair
      ? `${message} project.json and data/current.json disagree. The validated current opened safely read-only; use Repair project to adopt it explicitly.`
      : pendingAutosave === undefined
        ? message
        : `${message} Autosave view is available.`;
    this.notify();
  }

  private beginProjectPreview(loaded: LoadedDoc, message: string): void {
    if (this.previewReturn === null) {
      this.previewReturn = { view: cloneView(this.controller.state.view), dirty: this.dirty };
    }
    this.loading = true;
    try {
      this.controller.replaceLoaded(loaded);
    } finally {
      this.loading = false;
      this.lastViewKey = viewKey(this.controller.state.view);
    }
    this.dirty = false;
    this.message = message;
    this.notify();
  }

  private loadTemporaryLoaded(loaded: LoadedDoc, message: string): void {
    this.loading = true;
    try {
      this.controller.replaceLoaded(loaded);
    } finally {
      this.loading = false;
      this.lastViewKey = viewKey(this.controller.state.view);
    }
    this.cancelAutosave();
    this.project = null;
    this.previewReturn = null;
    this.dirty = false;
    this.warnings = [];
    this.message = message;
    this.notify();
  }

  private scheduleAutosave(): void {
    this.cancelAutosave();
    const project = this.project;
    if (
      project === null ||
      project.access !== 'readwrite' ||
      project.needsRepair ||
      this.previewReturn !== null ||
      this.controller.state.readOnly
    ) {
      return;
    }
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      void this.flushAutosave();
    }, 350);
  }

  private async flushAutosave(): Promise<void> {
    const project = this.project;
    if (
      project === null ||
      project.access !== 'readwrite' ||
      project.needsRepair ||
      this.previewReturn !== null ||
      this.controller.state.readOnly
    ) {
      return;
    }
    try {
      const text = autosaveViewText({
        schema: 'visual-specs.autosave-view',
        formatVersion: '1.0',
        projectId: project.manifest.project.id,
        docId: project.manifest.current.docId,
        baseRevision: project.currentRevision,
        savedAtUtc: new Date().toISOString(),
        view: toVisualSpecsView(this.controller.state.view),
      });
      await this.withPermissionHandling(() => this.store.writeAutosaveView(project.ref, text));
      this.message = 'Autosaved view.';
      this.notify();
    } catch (err) {
      if (!isPermissionDenied(err)) {
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

  private async withPermissionHandling<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (err) {
      this.handlePermissionFailure(err);
      throw err;
    }
  }

  private handlePermissionFailure(err: unknown): void {
    if (!isPermissionDenied(err) || this.project === null) return;
    this.cancelAutosave();
    this.project = { ...this.project, access: 'readonly' };
    this.message = `Write permission was revoked; the project is read-only and autosave stopped. ${errorMessage(err)}`;
    this.notify();
  }

  private cancelAutosave(): void {
    if (this.autosaveTimer !== null) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
  }

  private clearCorruptAutosaveWarning(): void {
    this.warnings = this.warnings.filter((warning) => warning !== CORRUPT_AUTOSAVE_WARNING);
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

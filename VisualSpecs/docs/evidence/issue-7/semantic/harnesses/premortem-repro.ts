import { FakeRenderer } from '../repo-CodebaseConstellation/VisualSpecs/src/adapters/fake/FakeRenderer.ts';
import { Controller } from '../repo-CodebaseConstellation/VisualSpecs/src/app/controller.ts';
import { ProjectController } from '../repo-CodebaseConstellation/VisualSpecs/src/app/projectController.ts';
import { stateFromLoaded } from '../repo-CodebaseConstellation/VisualSpecs/src/app/state.ts';
import { importDoc } from '../repo-CodebaseConstellation/VisualSpecs/src/contract/load.ts';
import {
  makeProjectManifest,
  projectManifestText,
} from '../repo-CodebaseConstellation/VisualSpecs/src/contract/projectManifest.ts';
import { computeDocRevision } from '../repo-CodebaseConstellation/VisualSpecs/src/contract/revision.ts';
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
} from '../repo-CodebaseConstellation/VisualSpecs/src/ports/projectStore.ts';

function doc(id: string, requires: readonly string[] = []): string {
  return JSON.stringify({
    formatVersion: '1.0',
    nodes: [{ id, kind: 'repository', label: id, parentId: null, path: '' }],
    edges: [],
    ...(requires.length === 0 ? {} : { requires }),
  });
}

function snapshot(id: string, currentText: string): ProjectSnapshot {
  const manifest = makeProjectManifest({
    id: `manifest-${id}`,
    name: `Project ${id}`,
    docId: `doc-${id}`,
    revision: computeDocRevision(currentText),
    nowUtc: '2026-07-14T00:00:00.000Z',
  });
  return {
    ref: { id: `ref-${id}`, displayName: `Folder ${id}` },
    access: 'readonly',
    manifestText: projectManifestText(manifest),
    currentText,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

class Store implements ProjectStore {
  readonly caps: ProjectCapabilities = {
    kind: 'filesystem',
    secureContext: true,
    canPickDirectory: true,
    canWriteProjectDirectory: true,
    canOpenTemporaryJson: true,
    canSaveFile: true,
  };
  readonly snapshots = new Map<string, ProjectSnapshot>();
  readonly openQueue: ProjectSnapshot[] = [];
  readonly blockedLists = new Map<string, Promise<readonly StoredDocRef[]>>();
  storedText = doc('PREVIEW');
  writes: Array<{ ref: string; currentText: string }> = [];

  capabilities(): ProjectCapabilities {
    return this.caps;
  }

  async openProjectRead(): Promise<ProjectSnapshot> {
    const next = this.openQueue.shift();
    if (next === undefined) throw new Error('no queued project');
    return next;
  }

  async enableEditing(ref: ProjectRef): Promise<ProjectSnapshot> {
    const found = this.snapshots.get(ref.id);
    if (found === undefined) throw new Error(`missing ${ref.id}`);
    return { ...found, access: 'readwrite' };
  }

  async createProject(_prepare: () => CreateProjectInput | Promise<CreateProjectInput>): Promise<ProjectSnapshot> {
    throw new Error('not used');
  }

  async writeAutosaveView(): Promise<void> {}

  async commitCurrent(input: CommitCurrentInput): Promise<void> {
    const found = this.snapshots.get(input.ref.id);
    if (found === undefined) throw new Error(`missing ${input.ref.id}`);
    const plan = input.prepare(
      { manifestText: found.manifestText, currentText: found.currentText },
      undefined,
    );
    this.writes.push({ ref: input.ref.id, currentText: plan.currentText });
    this.snapshots.set(input.ref.id, {
      ...found,
      manifestText: plan.manifestText,
      currentText: plan.currentText,
    });
  }

  async updateManifest(_input: UpdateManifestInput): Promise<void> {
    throw new Error('not used');
  }

  async listStoredDocs(ref: ProjectRef): Promise<readonly StoredDocRef[]> {
    return this.blockedLists.get(ref.id) ?? [];
  }

  async readStoredDoc(): Promise<string> {
    return this.storedText;
  }

  async pickExternalJson(): Promise<PickedTextSource> {
    throw new Error('not used');
  }

  async writeImport(): Promise<StoredDocRef> {
    throw new Error('not used');
  }

  async exportPortable(_input: ExportPortableInput): Promise<ExportResult> {
    throw new Error('not used');
  }
}

function boot(store: Store): { controller: Controller; project: ProjectController } {
  const controller = new Controller(
    new FakeRenderer(),
    stateFromLoaded(importDoc(doc('EXAMPLE'))),
  );
  controller.start();
  return { controller, project: new ProjectController(controller, store) };
}

async function untilNode(controller: Controller, id: string): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (controller.state.model.nodes[0]?.id === id) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`node ${id} did not load`);
}

async function concurrentOpenRepro(): Promise<void> {
  const a = snapshot('A', doc('A'));
  const b = snapshot('B', doc('B'));
  const store = new Store();
  store.snapshots.set(a.ref.id, a);
  store.snapshots.set(b.ref.id, b);
  store.openQueue.push(a, b);
  const listA = deferred<readonly StoredDocRef[]>();
  store.blockedLists.set(a.ref.id, listA.promise);
  const { controller, project } = boot(store);

  const openA = project.openProject();
  await untilNode(controller, 'A');
  console.log('OPEN_A_IN_FLIGHT', JSON.stringify({
    graph: controller.state.model.nodes[0]?.id,
    projectName: project.snapshot().name,
    phase: project.snapshot().phase,
  }));

  await project.openProject();
  console.log('OPEN_B_COMPLETE', JSON.stringify({
    graph: controller.state.model.nodes[0]?.id,
    projectName: project.snapshot().name,
  }));

  listA.resolve([]);
  await openA;
  console.log('STALE_A_COMPLETES', JSON.stringify({
    graph: controller.state.model.nodes[0]?.id,
    projectName: project.snapshot().name,
    projectKey: project.snapshot().projectKey,
  }));

  await project.enableEditing();
  await project.saveCurrent();
  const write = store.writes.at(-1);
  console.log('CROSS_PROJECT_WRITE', JSON.stringify({
    destination: write?.ref,
    writtenNode: write === undefined ? null : JSON.parse(write.currentText).nodes[0].id,
  }));
}

async function previewDirtyRepro(): Promise<void> {
  const a = snapshot('A', doc('A'));
  const store = new Store();
  store.snapshots.set(a.ref.id, a);
  store.openQueue.push(a);
  const { controller, project } = boot(store);
  await project.openProject();
  await project.enableEditing();
  controller.dispatch({ type: 'SetViewport', viewport: { x: 11, y: 22, zoom: 1.2 } });
  const before = project.snapshot();
  await project.previewStoredExport({
    id: 'ref-A:exports:preview.json',
    area: 'exports',
    displayName: 'preview.json',
    fileName: 'preview.json',
  });
  const during = project.snapshot();
  project.openTemporaryText('temporary.json', doc('TEMPORARY'));
  const after = project.snapshot();
  console.log('PREVIEW_DIRTY_GUARD', JSON.stringify({
    dirtyBeforePreview: before.dirty,
    dirtySeenByExistingConfirmDuringPreview: during.dirty,
    previewing: during.previewing,
    phaseAfterContextSwitch: after.phase,
    canReturnAfterContextSwitch: after.canReturnToProject,
  }));
}

await concurrentOpenRepro();
await previewDirtyRepro();

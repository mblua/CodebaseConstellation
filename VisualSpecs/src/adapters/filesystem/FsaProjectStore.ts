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
} from '../../ports/projectStore.ts';
import { DownloadStore } from '../download/DownloadStore.ts';

const PROJECT_DIR = '.visual-specs';
const DATA_DIR = 'data';
const IMPORTS_DIR = 'imports';
const EXPORTS_DIR = 'exports';
const BACKUPS_DIR = 'backups';
const PROJECT_JSON = 'project.json';
const CURRENT_JSON = 'current.json';
const AUTOSAVE_VIEW_JSON = 'autosave-view.json';
const GITKEEP = '.gitkeep';
const JSON_TYPES = [
  {
    description: 'Visual Specs JSON',
    accept: { 'application/json': ['.json'] },
  },
] as const;

interface StoredProject {
  root: FileSystemDirectoryHandle;
  projectDir: FileSystemDirectoryHandle;
  access: 'readonly' | 'readwrite';
  displayName: string;
}

export interface FsaProjectStoreOptions {
  maxBytes: number;
  clock?: () => Date;
  downloadStore?: DownloadStore;
  /** Explicitly models OPFS/test handles whose write permission is implicit. */
  implicitWritePermission?: boolean;
}

export class FsaProjectStore implements ProjectStore {
  private readonly maxBytes: number;
  private readonly clock: () => Date;
  private readonly downloadStore: DownloadStore;
  private readonly implicitWritePermission: boolean;
  private readonly projects = new Map<string, StoredProject>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private nextId = 1;

  constructor(options: FsaProjectStoreOptions) {
    this.maxBytes = options.maxBytes;
    this.clock = options.clock ?? (() => new Date());
    this.downloadStore = options.downloadStore ?? new DownloadStore();
    this.implicitWritePermission = options.implicitWritePermission === true;
  }

  capabilities(): ProjectCapabilities {
    const secureContext = globalThis.isSecureContext === true;
    return {
      kind: secureContext && typeof showDirectoryPicker === 'function' ? 'filesystem' : 'download-only',
      secureContext,
      canPickDirectory: secureContext && typeof showDirectoryPicker === 'function',
      canWriteProjectDirectory: secureContext && typeof showDirectoryPicker === 'function',
      canOpenTemporaryJson: typeof showOpenFilePicker === 'function',
      canSaveFile: typeof showSaveFilePicker === 'function',
    };
  }

  async openProjectRead(): Promise<ProjectSnapshot> {
    this.assertCanPickDirectory();
    const root = await showDirectoryPicker({ mode: 'read' });
    const projectDir = await root.getDirectoryHandle(PROJECT_DIR, { create: false });
    await assertReachable(root, projectDir);
    const snapshot = await this.readSnapshot(root, projectDir, 'readonly');
    this.projects.set(snapshot.ref.id, {
      root,
      projectDir,
      access: 'readonly',
      displayName: snapshot.ref.displayName,
    });
    return snapshot;
  }

  async enableEditing(ref: ProjectRef): Promise<ProjectSnapshot> {
    const stored = this.mustProject(ref);
    let permission: PermissionState;
    if (stored.root.requestPermission !== undefined) {
      permission = await stored.root.requestPermission({ mode: 'readwrite' });
    } else if (this.implicitWritePermission) {
      permission = 'granted';
    } else {
      throw new Error('This directory handle cannot request write permission.');
    }
    if (permission !== 'granted') throw new Error('Write permission was not granted.');
    const snapshot = await this.readSnapshot(stored.root, stored.projectDir, 'readwrite', ref.id);
    this.projects.set(ref.id, { ...stored, access: 'readwrite' });
    return snapshot;
  }

  async createProject(
    prepare: () => CreateProjectInput | Promise<CreateProjectInput>,
  ): Promise<ProjectSnapshot> {
    this.assertCanPickDirectory();
    // Picker first: callers may perform expensive semantic hashing in `prepare`
    // without consuming the click's transient activation.
    const root = await showDirectoryPicker({ mode: 'readwrite' });
    const existing = await maybeDirectory(root, PROJECT_DIR);
    if (existing !== null) {
      if ((await maybeFile(existing, PROJECT_JSON)) !== null) {
        throw new Error(
          '.visual-specs/project.json already exists. No files were written. ' +
            'If its metadata is valid, use Open Project; otherwise repair or migrate it manually.',
        );
      }
      if (await hasAnyEntry(existing)) {
        throw new Error('.visual-specs already exists and is not empty. No files were written.');
      }
    }

    const input = await prepare();
    const projectDir = existing ?? (await root.getDirectoryHandle(PROJECT_DIR, { create: true }));
    await assertReachable(root, projectDir);

    const data = await projectDir.getDirectoryHandle(DATA_DIR, { create: true });
    const imports = await projectDir.getDirectoryHandle(IMPORTS_DIR, { create: true });
    await projectDir.getDirectoryHandle(EXPORTS_DIR, { create: true });
    await projectDir.getDirectoryHandle(BACKUPS_DIR, { create: true });
    await writeText(data, CURRENT_JSON, input.currentText);
    await writeText(projectDir, '.gitattributes', input.gitattributesText);
    await writeText(projectDir, '.gitignore', input.gitignoreText);
    await writeText(imports, GITKEEP, '');
    await writeText(projectDir, PROJECT_JSON, input.manifestText);

    const snapshot = await this.readSnapshot(root, projectDir, 'readwrite');
    this.projects.set(snapshot.ref.id, {
      root,
      projectDir,
      access: 'readwrite',
      displayName: snapshot.ref.displayName,
    });
    return snapshot;
  }

  async writeAutosaveView(ref: ProjectRef, text: string): Promise<void> {
    const stored = this.mustWritable(ref);
    await this.enqueue(ref.id, async () => {
      const data = await stored.projectDir.getDirectoryHandle(DATA_DIR, { create: true });
      await writeText(data, AUTOSAVE_VIEW_JSON, text);
    });
  }

  async commitCurrent(input: CommitCurrentInput): Promise<void> {
    const stored = this.mustWritable(input.ref);
    await this.enqueue(input.ref.id, async () => {
      const actual = await this.readHead(stored.projectDir);
      const sourceText =
        input.source === undefined
          ? undefined
          : await this.readStoredDocNow(input.ref, stored, input.source);
      const plan = input.prepare(actual, sourceText);
      const data = await stored.projectDir.getDirectoryHandle(DATA_DIR, { create: false });
      const backups = await stored.projectDir.getDirectoryHandle(BACKUPS_DIR, { create: true });
      // The backup is mandatory and contains the bytes read immediately before
      // replacement, never an app-cached copy. Its close resolves before current.
      await this.writeUnique(backups, timestampedInternalName('current', this.clock()), actual.currentText);
      await writeText(data, CURRENT_JSON, plan.currentText);
      await writeText(stored.projectDir, PROJECT_JSON, plan.manifestText);
      // current + project.json are already a durable commit. Autosave cleanup is
      // deliberately best-effort: a stale overlay has a different baseRevision
      // and is ignored on the next open, so cleanup failure must not falsify the
      // commit result and leave the controller behind the bytes now on disk.
      if (plan.clearAutosaveView) await removeIfExistsBestEffort(data, AUTOSAVE_VIEW_JSON);
    });
  }

  async updateManifest(input: UpdateManifestInput): Promise<void> {
    const stored = this.mustWritable(input.ref);
    await this.enqueue(input.ref.id, async () => {
      const actual = await this.readHead(stored.projectDir);
      input.verifyFresh(actual);
      await writeText(stored.projectDir, PROJECT_JSON, input.manifestText);
    });
  }

  async listStoredDocs(ref: ProjectRef, area: 'imports' | 'exports'): Promise<readonly StoredDocRef[]> {
    const stored = this.mustProject(ref);
    const dir =
      area === 'exports' && stored.access === 'readwrite'
        ? await stored.projectDir.getDirectoryHandle(area, { create: true })
        : await maybeDirectory(stored.projectDir, area);
    if (dir === null) return [];
    const out: StoredDocRef[] = [];
    for await (const handle of dir.values()) {
      if (handle.kind !== 'file') continue;
      if (!isFilesystemJsonSegment(handle.name)) continue;
      out.push({
        id: storedDocId(ref.id, area, handle.name),
        area,
        displayName: handle.name,
        fileName: handle.name,
      });
    }
    out.sort((a, b) => a.fileName.localeCompare(b.fileName));
    return out;
  }

  async readStoredDoc(ref: ProjectRef, doc: StoredDocRef): Promise<string> {
    const stored = this.mustProject(ref);
    return this.readStoredDocNow(ref, stored, doc);
  }

  private async readStoredDocNow(
    ref: ProjectRef,
    stored: StoredProject,
    doc: StoredDocRef,
  ): Promise<string> {
    if (doc.id !== storedDocId(ref.id, doc.area, doc.fileName)) {
      throw new Error('Stored document reference no longer matches this project.');
    }
    if (!isFilesystemJsonSegment(doc.fileName)) throw new Error('Stored document name is not a JSON file segment.');
    const dir = await stored.projectDir.getDirectoryHandle(doc.area, { create: false });
    const file = await dir.getFileHandle(doc.fileName, { create: false });
    return readFileText(file, this.maxBytes);
  }

  async pickExternalJson(): Promise<PickedTextSource> {
    if (typeof showOpenFilePicker !== 'function') throw new Error('File picker is not available.');
    const [handle] = await showOpenFilePicker({
      multiple: false,
      types: JSON_TYPES,
      excludeAcceptAllOption: false,
    });
    if (handle === undefined) throw new Error('No file was selected.');
    const file = await handle.getFile();
    return {
      sourceName: file.name,
      sizeBytes: file.size,
      readText: async (maxBytes: number) => {
        if (file.size > maxBytes) {
          throw new Error(`${file.name} is ${file.size} bytes, over the ${maxBytes} byte cap.`);
        }
        return file.text();
      },
    };
  }

  async writeImport(ref: ProjectRef, suggestedName: string, text: string): Promise<StoredDocRef> {
    const stored = this.mustWritable(ref);
    return this.enqueue(ref.id, async () => {
      const imports = await stored.projectDir.getDirectoryHandle(IMPORTS_DIR, { create: true });
      const fileName = await this.writeUnique(imports, suggestedName, text);
      return {
        id: storedDocId(ref.id, 'imports', fileName),
        area: 'imports',
        displayName: fileName,
        fileName,
      };
    });
  }

  async exportPortable(input: ExportPortableInput): Promise<ExportResult> {
    if (input.project !== null) {
      const stored = this.mustWritable(input.project);
      return this.enqueue(input.project.id, async () => {
        const exportsDir = await stored.projectDir.getDirectoryHandle(EXPORTS_DIR, { create: true });
        const fileName = await this.writeUnique(exportsDir, input.suggestedName, input.text);
        return { fileName, mode: 'project-export' };
      });
    }
    if (typeof showSaveFilePicker === 'function') {
      const handle = await showSaveFilePicker({
        suggestedName: input.suggestedName,
        types: JSON_TYPES,
      });
      await writeHandleText(handle, input.text);
      return { fileName: handle.name || input.suggestedName, mode: 'save-picker' };
    }
    return this.downloadStore.exportJson(input.suggestedName, input.text);
  }

  private async readHead(projectDir: FileSystemDirectoryHandle): Promise<{
    manifestText: string;
    currentText: string;
  }> {
    const data = await projectDir.getDirectoryHandle(DATA_DIR, { create: false });
    const manifestText = await readFileText(
      await projectDir.getFileHandle(PROJECT_JSON, { create: false }),
      this.maxBytes,
    );
    const currentText = await readFileText(
      await data.getFileHandle(CURRENT_JSON, { create: false }),
      this.maxBytes,
    );
    return { manifestText, currentText };
  }

  private async readSnapshot(
    root: FileSystemDirectoryHandle,
    projectDir: FileSystemDirectoryHandle,
    access: 'readonly' | 'readwrite',
    existingId?: string,
  ): Promise<ProjectSnapshot> {
    const data = await projectDir.getDirectoryHandle(DATA_DIR, { create: false });
    const { manifestText, currentText } = await this.readHead(projectDir);
    const autosave = await maybeFile(data, AUTOSAVE_VIEW_JSON);
    const autosaveViewText = autosave === null ? undefined : await readFileText(autosave, this.maxBytes);
    const id = existingId ?? `fsa-${this.nextId++}`;
    const ref = { id, displayName: root.name || 'Project' };
    return autosaveViewText === undefined
      ? { ref, access, manifestText, currentText }
      : { ref, access, manifestText, currentText, autosaveViewText };
  }

  private async writeUnique(
    dir: FileSystemDirectoryHandle,
    suggestedName: string,
    text: string,
  ): Promise<string> {
    if (!isFilesystemJsonSegment(suggestedName)) throw new Error('Suggested file name is not a JSON segment.');
    for (let attempt = 1; attempt <= 999; attempt += 1) {
      const candidate = withCollisionSuffix(suggestedName, attempt);
      const existing = await maybeFile(dir, candidate);
      if (existing !== null) continue;
      await writeText(dir, candidate, text);
      return candidate;
    }
    throw new Error('Could not find an unused JSON export/import name.');
  }

  private mustProject(ref: ProjectRef): StoredProject {
    const project = this.projects.get(ref.id);
    if (project === undefined) throw new Error('Project is no longer open.');
    return project;
  }

  private mustWritable(ref: ProjectRef): StoredProject {
    const project = this.mustProject(ref);
    if (project.access !== 'readwrite') throw new Error('Project is open read-only.');
    return project;
  }

  private assertCanPickDirectory(): void {
    const caps = this.capabilities();
    if (!caps.secureContext || !caps.canPickDirectory) {
      throw new Error('Project persistence requires File System Access in a secure context.');
    }
  }

  private async enqueue<T>(projectId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(projectId) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.queues.set(projectId, next.catch(() => undefined));
    return next;
  }
}

async function readFileText(handle: FileSystemFileHandle, maxBytes: number): Promise<string> {
  const file = await handle.getFile();
  if (file.size > maxBytes) {
    throw new Error(`${file.name} is ${file.size} bytes, over the ${maxBytes} byte cap.`);
  }
  return file.text();
}

async function writeText(
  dir: FileSystemDirectoryHandle,
  name: string,
  text: string,
): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  await writeHandleText(handle, text);
}

async function writeHandleText(handle: FileSystemFileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function maybeDirectory(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await dir.getDirectoryHandle(name, { create: false });
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

async function maybeFile(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemFileHandle | null> {
  try {
    return await dir.getFileHandle(name, { create: false });
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

async function hasAnyEntry(dir: FileSystemDirectoryHandle): Promise<boolean> {
  for await (const _ of dir.keys()) return true;
  return false;
}

async function removeIfExistsBestEffort(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<void> {
  try {
    await dir.removeEntry(name);
  } catch {
    // Autosave is an optional view overlay. Its baseRevision makes a leftover
    // file safe to ignore, including permission and transient I/O failures.
  }
}

async function assertReachable(
  root: FileSystemDirectoryHandle,
  projectDir: FileSystemDirectoryHandle,
): Promise<void> {
  if (root.resolve === undefined) return;
  const segments = await root.resolve(projectDir);
  if (segments === null || segments.join('/') !== PROJECT_DIR) {
    throw new Error('.visual-specs is not reachable as a direct child of the selected folder.');
  }
}

function isNotFound(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'NotFoundError';
}

function storedDocId(projectId: string, area: 'imports' | 'exports', fileName: string): string {
  return `${projectId}:${area}:${fileName}`;
}

export function isFilesystemJsonSegment(fileName: string): boolean {
  const stem = fileName.slice(0, -'.json'.length);
  return (
    fileName.endsWith('.json') &&
    fileName === fileName.normalize('NFC') &&
    fileName === fileName.trim() &&
    !/[\\/:*?"<>|\u0000-\u001f\u007f-\u009f]/u.test(fileName) &&
    !/\p{Cf}/u.test(fileName) &&
    stem.length > 0 &&
    stem === stem.replace(/^[.\s-]+|[.\s-]+$/gu, '')
  );
}

function withCollisionSuffix(fileName: string, attempt: number): string {
  if (attempt <= 1) return fileName;
  return fileName.replace(/\.json$/u, `-${attempt}.json`);
}

function timestampedInternalName(stem: string, date: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}-` +
    `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}_${stem}.json`
  );
}

export type PermissionStateLike = 'granted' | 'prompt' | 'denied' | 'unsupported';

export interface ProjectCapabilities {
  kind: 'filesystem' | 'download-only' | 'unsupported';
  secureContext: boolean;
  canPickDirectory: boolean;
  canWriteProjectDirectory: boolean;
  canOpenTemporaryJson: boolean;
  canSaveFile: boolean;
}

export interface ProjectRef {
  id: string;
  displayName: string;
}

export interface StoredDocRef {
  id: string;
  area: 'imports' | 'exports';
  displayName: string;
  fileName: string;
}

export interface ProjectSnapshot {
  ref: ProjectRef;
  access: 'readonly' | 'readwrite';
  manifestText: string;
  currentText: string;
  autosaveViewText?: string;
}

export interface ProjectHead {
  manifestText: string;
  currentText: string;
}

export interface PickedTextSource {
  sourceName: string;
  sizeBytes: number;
  readText(maxBytes: number): Promise<string>;
}

export interface CommitCurrentPlan {
  manifestText: string;
  currentText: string;
  clearAutosaveView: boolean;
}

export interface CommitCurrentInput {
  ref: ProjectRef;
  /** Optional stored source to re-read, preflight and validate in the write queue. */
  source?: StoredDocRef;
  /**
   * Runs inside the adapter's per-project queue after bounded fresh reads of
   * manifest/current (and `source`, when present), before the first write. It
   * must synchronously validate and compare the actual head with the app's
   * expected semantic state, throwing on conflict or invalid source content.
   */
  prepare(actual: ProjectHead, sourceText: string | undefined): CommitCurrentPlan;
}

export interface UpdateManifestInput {
  ref: ProjectRef;
  manifestText: string;
  /** Same serialized, pre-write freshness contract as `commitCurrent`. */
  verifyFresh(actual: ProjectHead): void;
}

export interface CreateProjectInput {
  manifestText: string;
  currentText: string;
  gitignoreText: string;
  gitattributesText: string;
}

export interface ExportPortableInput {
  project: ProjectRef | null;
  suggestedName: string;
  text: string;
}

export interface ExportResult {
  fileName: string;
  mode: 'project-export' | 'save-picker' | 'download';
}

/**
 * Storage capability port. App/UI code must check `capabilities()` and project
 * access before invoking methods whose capability is disabled; implementations may
 * reject unsupported calls, but normal flows are gated before they reach the port.
 */
export interface ProjectStore {
  capabilities(): ProjectCapabilities;
  openProjectRead(): Promise<ProjectSnapshot>;
  enableEditing(ref: ProjectRef): Promise<ProjectSnapshot>;
  /**
   * The adapter invokes `prepare` only after the directory picker resolves and
   * the destination passes its non-destructive checks. This keeps transient
   * activation ahead of hashing/serialization work.
   */
  createProject(prepare: () => CreateProjectInput | Promise<CreateProjectInput>): Promise<ProjectSnapshot>;
  writeAutosaveView(ref: ProjectRef, text: string): Promise<void>;
  commitCurrent(input: CommitCurrentInput): Promise<void>;
  updateManifest(input: UpdateManifestInput): Promise<void>;
  listStoredDocs(ref: ProjectRef, area: 'imports' | 'exports'): Promise<readonly StoredDocRef[]>;
  readStoredDoc(ref: ProjectRef, doc: StoredDocRef): Promise<string>;
  pickExternalJson(): Promise<PickedTextSource>;
  writeImport(ref: ProjectRef, suggestedName: string, text: string): Promise<StoredDocRef>;
  exportPortable(input: ExportPortableInput): Promise<ExportResult>;
}

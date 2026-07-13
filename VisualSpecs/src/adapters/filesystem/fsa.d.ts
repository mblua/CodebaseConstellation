type FileSystemPermissionMode = 'read' | 'readwrite';
type FileSystemHandleKind = 'file' | 'directory';
type FileSystemWriteChunkType = string | BufferSource | Blob;

interface FileSystemHandlePermissionDescriptor {
  mode?: FileSystemPermissionMode;
}

interface FileSystemCreateWritableOptions {
  keepExistingData?: boolean;
  mode?: 'siloed' | 'exclusive';
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: FileSystemWriteChunkType): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemHandle {
  readonly kind: FileSystemHandleKind;
  readonly name: string;
  queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface FileSystemFileHandle extends FileSystemHandle {
  readonly kind: 'file';
  getFile(): Promise<File>;
  createWritable(options?: FileSystemCreateWritableOptions): Promise<FileSystemWritableFileStream>;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  readonly kind: 'directory';
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  keys(): AsyncIterableIterator<string>;
  values(): AsyncIterableIterator<FileSystemHandle>;
  resolve?(possibleDescendant: FileSystemHandle): Promise<string[] | null>;
}

interface OpenFilePickerOptions {
  multiple?: boolean;
  types?: readonly {
    description?: string;
    accept: Record<string, readonly string[]>;
  }[];
  excludeAcceptAllOption?: boolean;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: readonly {
    description?: string;
    accept: Record<string, readonly string[]>;
  }[];
}

declare function showDirectoryPicker(options?: {
  id?: string;
  mode?: FileSystemPermissionMode;
  startIn?: string;
}): Promise<FileSystemDirectoryHandle>;
declare function showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
declare function showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;

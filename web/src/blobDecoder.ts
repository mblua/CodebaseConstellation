import type { DecodedEdges, DecodedPositions } from "./model";

const HEADER_BYTES = 32;
const POSITION_RECORD_BYTES = 32;
const EDGE_RECORD_BYTES = 24;
const POSITION_FLAGS_MASK = 0x0f;
const EDGE_FLAGS_MASK = 0x03;

export interface BlobMetadata {
  kind: "positions" | "edges";
  formatVersion: number;
  recordCount: number;
  byteLength: number;
  sha256Hex: string;
  snapshotId: bigint;
  layoutId: bigint;
}

export class BlobFormatError extends Error {
  readonly blobKind: BlobMetadata["kind"];
  readonly recordIndex: number | null;

  constructor(kind: BlobMetadata["kind"], message: string, recordIndex: number | null = null) {
    super(`${kind}${recordIndex === null ? "" : ` record ${recordIndex}`}: ${message}`);
    this.name = "BlobFormatError";
    this.blobKind = kind;
    this.recordIndex = recordIndex;
  }
}

function bytesOf(content: ArrayBuffer | Uint8Array): Uint8Array {
  return content instanceof Uint8Array ? content : new Uint8Array(content);
}

function magicAt(view: DataView): string {
  return String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
}

function fail(meta: BlobMetadata, message: string, recordIndex: number | null = null): never {
  throw new BlobFormatError(meta.kind, message, recordIndex);
}

function validateCommon(bytes: Uint8Array, meta: BlobMetadata, expectedMagic: string): DataView {
  if (meta.formatVersion !== 1) {
    fail(meta, `database metadata declares unsupported format version ${meta.formatVersion}; expected 1`);
  }
  if (!Number.isSafeInteger(meta.recordCount) || meta.recordCount < 0) {
    fail(meta, `database metadata has invalid record_count ${meta.recordCount}`);
  }
  if (!Number.isSafeInteger(meta.byteLength) || meta.byteLength < HEADER_BYTES) {
    fail(meta, `database metadata has invalid byte_length ${meta.byteLength}`);
  }
  if (bytes.byteLength !== meta.byteLength) {
    fail(meta, `byte length is ${bytes.byteLength}, but database metadata says ${meta.byteLength}`);
  }
  if (bytes.byteLength < HEADER_BYTES) {
    fail(meta, `header is truncated (${bytes.byteLength} bytes; expected ${HEADER_BYTES})`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = magicAt(view);
  if (magic !== expectedMagic) {
    fail(meta, `magic is ${JSON.stringify(magic)}; expected ${expectedMagic}`);
  }
  const version = view.getUint16(4, true);
  if (version !== 1 || version !== meta.formatVersion) {
    fail(meta, `format version is ${version}; expected database version ${meta.formatVersion}`);
  }
  const headerBytes = view.getUint16(6, true);
  if (headerBytes !== HEADER_BYTES) {
    fail(meta, `header size is ${headerBytes}; expected ${HEADER_BYTES}`);
  }
  const recordCount = view.getUint32(8, true);
  if (recordCount !== meta.recordCount) {
    fail(meta, `record count is ${recordCount}; database metadata says ${meta.recordCount}`);
  }
  const snapshotId = view.getBigUint64(16, true);
  if (snapshotId !== meta.snapshotId) {
    fail(meta, `snapshot id is ${snapshotId}; expected ${meta.snapshotId}`);
  }
  const layoutId = view.getBigUint64(24, true);
  if (layoutId !== meta.layoutId) {
    fail(meta, `layout id is ${layoutId}; expected ${meta.layoutId}`);
  }
  return view;
}

export function decodePositions(
  content: ArrayBuffer | Uint8Array,
  meta: BlobMetadata,
): DecodedPositions {
  if (meta.kind !== "positions") {
    throw new BlobFormatError(meta.kind, "positions decoder received non-position metadata");
  }
  const bytes = bytesOf(content);
  const view = validateCommon(bytes, meta, "CCP1");
  const dimensions = view.getUint8(12);
  const scalarCode = view.getUint8(13);
  const headerFlags = view.getUint16(14, true);
  if (dimensions !== 3) fail(meta, `dimensions is ${dimensions}; v1 requires 3`);
  if (scalarCode !== 1) fail(meta, `scalar code is ${scalarCode}; v1 requires IEEE-754 f32 (1)`);
  if (headerFlags !== 0) fail(meta, `reserved header flags are non-zero (0x${headerFlags.toString(16)})`);

  const expectedBytes = HEADER_BYTES + meta.recordCount * POSITION_RECORD_BYTES;
  if (bytes.byteLength !== expectedBytes) {
    fail(meta, `size equation failed: got ${bytes.byteLength}, expected 32 + 32 × ${meta.recordCount} = ${expectedBytes}`);
  }

  const nodeIds = new BigUint64Array(meta.recordCount);
  const coordinates = new Float32Array(meta.recordCount * 3);
  const radii = new Float32Array(meta.recordCount);
  const kindCodes = new Uint16Array(meta.recordCount);
  const flags = new Uint16Array(meta.recordCount);
  const clusterIds = new Uint32Array(meta.recordCount);
  const seenNodeIds = new Set<string>();

  for (let index = 0; index < meta.recordCount; index += 1) {
    const offset = HEADER_BYTES + index * POSITION_RECORD_BYTES;
    const nodeId = view.getBigUint64(offset, true);
    const nodeKey = nodeId.toString();
    if (seenNodeIds.has(nodeKey)) fail(meta, `duplicates node id ${nodeId}`, index);
    seenNodeIds.add(nodeKey);

    const x = view.getFloat32(offset + 8, true);
    const y = view.getFloat32(offset + 12, true);
    const z = view.getFloat32(offset + 16, true);
    const radius = view.getFloat32(offset + 20, true);
    if (![x, y, z, radius].every(Number.isFinite)) {
      fail(meta, "coordinates and radius must be finite", index);
    }
    if (radius <= 0) fail(meta, `radius is ${radius}; it must be greater than zero`, index);

    const kindCode = view.getUint16(offset + 24, true);
    if (kindCode === 0) fail(meta, "node kind render code cannot be zero", index);
    const nodeFlags = view.getUint16(offset + 26, true);
    const reservedFlags = nodeFlags & ~POSITION_FLAGS_MASK;
    if (reservedFlags !== 0) {
      fail(meta, `reserved node flags are set (0x${reservedFlags.toString(16)})`, index);
    }

    nodeIds[index] = nodeId;
    coordinates[index * 3] = x;
    coordinates[index * 3 + 1] = y;
    coordinates[index * 3 + 2] = z;
    radii[index] = radius;
    kindCodes[index] = kindCode;
    flags[index] = nodeFlags;
    clusterIds[index] = view.getUint32(offset + 28, true);
  }

  return {
    snapshotId: meta.snapshotId,
    layoutId: meta.layoutId,
    nodeIds,
    coordinates,
    radii,
    kindCodes,
    flags,
    clusterIds,
  };
}

export function decodeEdges(
  content: ArrayBuffer | Uint8Array,
  meta: BlobMetadata,
  nodeCount: number,
): DecodedEdges {
  if (meta.kind !== "edges") {
    throw new BlobFormatError(meta.kind, "edge decoder received non-edge metadata");
  }
  if (!Number.isSafeInteger(nodeCount) || nodeCount < 0) {
    throw new BlobFormatError(meta.kind, `invalid positions record count ${nodeCount}`);
  }
  const bytes = bytesOf(content);
  const view = validateCommon(bytes, meta, "CCE1");
  const recordBytes = view.getUint16(12, true);
  const headerFlags = view.getUint16(14, true);
  if (recordBytes !== EDGE_RECORD_BYTES) {
    fail(meta, `record size is ${recordBytes}; expected ${EDGE_RECORD_BYTES}`);
  }
  if (headerFlags !== 0) fail(meta, `reserved header flags are non-zero (0x${headerFlags.toString(16)})`);

  const expectedBytes = HEADER_BYTES + meta.recordCount * EDGE_RECORD_BYTES;
  if (bytes.byteLength !== expectedBytes) {
    fail(meta, `size equation failed: got ${bytes.byteLength}, expected 32 + 24 × ${meta.recordCount} = ${expectedBytes}`);
  }

  const edgeIds = new BigUint64Array(meta.recordCount);
  const sourceIndices = new Uint32Array(meta.recordCount);
  const targetIndices = new Uint32Array(meta.recordCount);
  const kindCodes = new Uint16Array(meta.recordCount);
  const flags = new Uint16Array(meta.recordCount);
  const weights = new Float32Array(meta.recordCount);
  const seenEdgeIds = new Set<string>();

  for (let index = 0; index < meta.recordCount; index += 1) {
    const offset = HEADER_BYTES + index * EDGE_RECORD_BYTES;
    const edgeId = view.getBigUint64(offset, true);
    const edgeKey = edgeId.toString();
    if (seenEdgeIds.has(edgeKey)) fail(meta, `duplicates edge id ${edgeId}`, index);
    seenEdgeIds.add(edgeKey);

    const sourceIndex = view.getUint32(offset + 8, true);
    const targetIndex = view.getUint32(offset + 12, true);
    if (sourceIndex >= nodeCount) {
      fail(meta, `source node_index ${sourceIndex} is outside positions count ${nodeCount}`, index);
    }
    if (targetIndex >= nodeCount) {
      fail(meta, `target node_index ${targetIndex} is outside positions count ${nodeCount}`, index);
    }

    const kindCode = view.getUint16(offset + 16, true);
    if (kindCode === 0) fail(meta, "edge kind render code cannot be zero", index);
    const edgeFlags = view.getUint16(offset + 18, true);
    const reservedFlags = edgeFlags & ~EDGE_FLAGS_MASK;
    if (reservedFlags !== 0) {
      fail(meta, `reserved edge flags are set (0x${reservedFlags.toString(16)})`, index);
    }
    const weight = view.getFloat32(offset + 20, true);
    if (!Number.isFinite(weight) || weight < 0) {
      fail(meta, `weight ${weight} must be finite and non-negative`, index);
    }

    edgeIds[index] = edgeId;
    sourceIndices[index] = sourceIndex;
    targetIndices[index] = targetIndex;
    kindCodes[index] = kindCode;
    flags[index] = edgeFlags;
    weights[index] = weight;
  }

  return {
    snapshotId: meta.snapshotId,
    layoutId: meta.layoutId,
    edgeIds,
    sourceIndices,
    targetIndices,
    kindCodes,
    flags,
    weights,
  };
}

export async function validateSha256(
  content: ArrayBuffer | Uint8Array,
  meta: BlobMetadata,
): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(meta.sha256Hex)) {
    fail(meta, `database SHA-256 metadata is not 64 lowercase hexadecimal characters`);
  }
  const bytes = bytesOf(content);
  const digestInput = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", digestInput));
  const actual = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actual !== meta.sha256Hex) {
    fail(meta, `SHA-256 is ${actual}; database metadata says ${meta.sha256Hex}`);
  }
}

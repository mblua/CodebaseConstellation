import { describe, expect, it } from "vitest";
import {
  BlobFormatError,
  decodeEdges,
  decodePositions,
  validateSha256,
  type BlobMetadata,
} from "../src/blobDecoder";

function writeMagic(view: DataView, magic: string): void {
  for (let index = 0; index < magic.length; index += 1) {
    view.setUint8(index, magic.charCodeAt(index));
  }
}

function makePositions(
  records: Array<{
    id: bigint;
    x: number;
    y: number;
    z: number;
    radius: number;
    kindCode: number;
    flags?: number;
    cluster?: number;
  }>,
): Uint8Array {
  const bytes = new Uint8Array(32 + records.length * 32);
  const view = new DataView(bytes.buffer);
  writeMagic(view, "CCP1");
  view.setUint16(4, 1, true);
  view.setUint16(6, 32, true);
  view.setUint32(8, records.length, true);
  view.setUint8(12, 3);
  view.setUint8(13, 1);
  view.setUint16(14, 0, true);
  view.setBigUint64(16, 7n, true);
  view.setBigUint64(24, 9n, true);
  records.forEach((record, index) => {
    const offset = 32 + index * 32;
    view.setBigUint64(offset, record.id, true);
    view.setFloat32(offset + 8, record.x, true);
    view.setFloat32(offset + 12, record.y, true);
    view.setFloat32(offset + 16, record.z, true);
    view.setFloat32(offset + 20, record.radius, true);
    view.setUint16(offset + 24, record.kindCode, true);
    view.setUint16(offset + 26, record.flags ?? 0, true);
    view.setUint32(offset + 28, record.cluster ?? 0, true);
  });
  return bytes;
}

function makeEdges(
  records: Array<{
    id: bigint;
    source: number;
    target: number;
    kindCode: number;
    flags?: number;
    weight: number;
  }>,
): Uint8Array {
  const bytes = new Uint8Array(32 + records.length * 24);
  const view = new DataView(bytes.buffer);
  writeMagic(view, "CCE1");
  view.setUint16(4, 1, true);
  view.setUint16(6, 32, true);
  view.setUint32(8, records.length, true);
  view.setUint16(12, 24, true);
  view.setUint16(14, 0, true);
  view.setBigUint64(16, 7n, true);
  view.setBigUint64(24, 9n, true);
  records.forEach((record, index) => {
    const offset = 32 + index * 24;
    view.setBigUint64(offset, record.id, true);
    view.setUint32(offset + 8, record.source, true);
    view.setUint32(offset + 12, record.target, true);
    view.setUint16(offset + 16, record.kindCode, true);
    view.setUint16(offset + 18, record.flags ?? 1, true);
    view.setFloat32(offset + 20, record.weight, true);
  });
  return bytes;
}

function metadata(kind: BlobMetadata["kind"], bytes: Uint8Array, count: number): BlobMetadata {
  return {
    kind,
    formatVersion: 1,
    recordCount: count,
    byteLength: bytes.byteLength,
    sha256Hex: "0".repeat(64),
    snapshotId: 7n,
    layoutId: 9n,
  };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("positions blob decoder", () => {
  it("decodes tightly packed v1 records", () => {
    const bytes = makePositions([
      { id: 101n, x: 1.5, y: -2, z: 3, radius: 0.75, kindCode: 3, cluster: 4 },
      { id: 102n, x: 0, y: 5, z: -1, radius: 1.25, kindCode: 7, flags: 0x03 },
    ]);
    const decoded = decodePositions(bytes, metadata("positions", bytes, 2));
    expect([...decoded.nodeIds]).toEqual([101n, 102n]);
    expect([...decoded.coordinates]).toEqual([1.5, -2, 3, 0, 5, -1]);
    expect([...decoded.radii]).toEqual([0.75, 1.25]);
    expect([...decoded.kindCodes]).toEqual([3, 7]);
    expect([...decoded.clusterIds]).toEqual([4, 0]);
  });

  it("reports a human-readable magic mismatch", () => {
    const bytes = makePositions([{ id: 1n, x: 0, y: 0, z: 0, radius: 1, kindCode: 3 }]);
    bytes[0] = "X".charCodeAt(0);
    expect(() => decodePositions(bytes, metadata("positions", bytes, 1))).toThrowError(
      /positions: magic is "XCP1"; expected CCP1/,
    );
  });

  it("rejects non-finite scalars and reserved node flags", () => {
    const nonFinite = makePositions([{ id: 1n, x: Number.NaN, y: 0, z: 0, radius: 1, kindCode: 3 }]);
    expect(() => decodePositions(nonFinite, metadata("positions", nonFinite, 1))).toThrowError(
      /record 0: coordinates and radius must be finite/,
    );
    const reserved = makePositions([{ id: 1n, x: 0, y: 0, z: 0, radius: 1, kindCode: 3, flags: 0x10 }]);
    expect(() => decodePositions(reserved, metadata("positions", reserved, 1))).toThrowError(
      /record 0: reserved node flags are set/,
    );
  });

  it("rejects duplicate node ids", () => {
    const bytes = makePositions([
      { id: 3n, x: 0, y: 0, z: 0, radius: 1, kindCode: 3 },
      { id: 3n, x: 1, y: 1, z: 1, radius: 1, kindCode: 3 },
    ]);
    expect(() => decodePositions(bytes, metadata("positions", bytes, 2))).toThrowError(
      /record 1: duplicates node id 3/,
    );
  });
});

describe("edge blob decoder", () => {
  it("decodes records and validates dense node indexes", () => {
    const bytes = makeEdges([
      { id: 201n, source: 0, target: 1, kindCode: 4, flags: 1, weight: 0.75 },
      { id: 202n, source: 1, target: 2, kindCode: 18, flags: 3, weight: 1 },
    ]);
    const decoded = decodeEdges(bytes, metadata("edges", bytes, 2), 3);
    expect([...decoded.edgeIds]).toEqual([201n, 202n]);
    expect([...decoded.sourceIndices]).toEqual([0, 1]);
    expect([...decoded.targetIndices]).toEqual([1, 2]);
    expect([...decoded.flags]).toEqual([1, 3]);
  });

  it("rejects an index outside the positions blob", () => {
    const bytes = makeEdges([{ id: 201n, source: 0, target: 3, kindCode: 4, weight: 1 }]);
    expect(() => decodeEdges(bytes, metadata("edges", bytes, 1), 3)).toThrowError(
      /record 0: target node_index 3 is outside positions count 3/,
    );
  });

  it("rejects size metadata and reserved flags", () => {
    const bytes = makeEdges([{ id: 201n, source: 0, target: 1, kindCode: 4, flags: 5, weight: 1 }]);
    expect(() => decodeEdges(bytes, metadata("edges", bytes, 1), 2)).toThrowError(
      /record 0: reserved edge flags are set/,
    );
    const wrongLength = metadata("edges", bytes, 1);
    wrongLength.byteLength += 1;
    expect(() => decodeEdges(bytes, wrongLength, 2)).toThrowError(/byte length is .*metadata says/);
  });
});

describe("blob digest validation", () => {
  it("accepts the declared SHA-256 and rejects a disagreement", async () => {
    const bytes = makePositions([{ id: 1n, x: 0, y: 0, z: 0, radius: 1, kindCode: 3 }]);
    const meta = metadata("positions", bytes, 1);
    meta.sha256Hex = await sha256(bytes);
    await expect(validateSha256(bytes, meta)).resolves.toBeUndefined();
    const badMeta = { ...meta, sha256Hex: "f".repeat(64) };
    await expect(validateSha256(bytes, badMeta)).rejects.toBeInstanceOf(BlobFormatError);
    await expect(validateSha256(bytes, badMeta)).rejects.toThrow(/SHA-256 is/);
  });
});

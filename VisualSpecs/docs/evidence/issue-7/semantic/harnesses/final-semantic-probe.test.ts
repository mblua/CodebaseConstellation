import { describe, expect, it } from 'vitest';
import {
  compactManifestProjectId,
  escapeManifestProjectId,
  type PreviousProjectIdentity,
} from '../repo-CodebaseConstellation/VisualSpecs/src/ui/app.ts';

function decodeEscapedId(value: string): string {
  let decoded = '';
  for (let index = 0; index < value.length; ) {
    if (value[index] !== '\\') {
      decoded += value[index];
      index += 1;
      continue;
    }
    const atom = value.slice(index, index + 6);
    if (!/^\\u[0-9A-F]{4}$/u.test(atom)) throw new Error(`invalid atom ${atom}`);
    decoded += String.fromCharCode(Number.parseInt(atom.slice(2), 16));
    index += 6;
  }
  return decoded;
}

function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
}

describe('independent final semantic identity probe', () => {
  it('is injective over every individual UTF-16 code unit and round-trips hostile sequences', () => {
    const presentations = new Set<string>();
    for (let unit = 0; unit <= 0xffff; unit += 1) {
      const raw = String.fromCharCode(unit);
      const escaped = escapeManifestProjectId(raw).full;
      expect(decodeEscapedId(escaped)).toBe(raw);
      presentations.add(escaped);
    }
    expect(presentations.size).toBe(0x1_0000);

    const next = generator(0x7c0111de);
    for (let sample = 0; sample < 10_000; sample += 1) {
      const length = next() % 33;
      let raw = '';
      for (let index = 0; index < length; index += 1) {
        raw += String.fromCharCode(next() & 0xffff);
      }
      const escaped = escapeManifestProjectId(raw).full;
      expect(decodeEscapedId(escaped)).toBe(raw);
      expect(/^[\x21-\x7E]*$/u.test(escaped)).toBe(true);
    }
  });

  it('makes every immediate same-name compact-token collision visibly unequal and bounded', () => {
    const next = generator(0x7c0111de);
    for (let sample = 0; sample < 10_000; sample += 1) {
      const prefix = 'ABCDEFGH';
      const suffix = 'IJKLMNOP';
      const left = prefix + String.fromCharCode(next() & 0xffff) + '-left-' + suffix;
      let right = prefix + String.fromCharCode(next() & 0xffff) + '-right-' + suffix;
      if (right === left) right += '!';
      const priorToken = compactManifestProjectId(left, null);
      const previous: PreviousProjectIdentity = {
        name: 'same',
        rawId: left,
        compactToken: priorToken,
      };
      const nextToken = compactManifestProjectId(right, previous);
      expect(nextToken).not.toBe(priorToken);
      expect(nextToken.length).toBeLessThanOrEqual(80);
      expect(/^[\x21-\x7E]*$/u.test(nextToken)).toBe(true);
    }
  });
});

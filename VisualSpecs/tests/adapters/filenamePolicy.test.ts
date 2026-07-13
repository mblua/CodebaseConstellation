import { describe, expect, it } from 'vitest';
import { isFilesystemJsonSegment } from '../../src/adapters/filesystem/FsaProjectStore.ts';
import { isSingleJsonSegment } from '../../src/contract/filename.ts';
import {
  acceptedJsonSegments,
  rejectedJsonSegments,
  unicodeWhitespaceEdgeCharacters,
} from '../support/filenamePolicy.ts';

describe('filesystem filename validator', () => {
  it('matches the shared contract policy table', () => {
    for (const name of acceptedJsonSegments) expect(isFilesystemJsonSegment(name), name).toBe(true);
    for (const name of rejectedJsonSegments) expect(isFilesystemJsonSegment(name), name).toBe(false);
  });

  it('stays differential-equivalent to the contract across adversarial edge characters', () => {
    const edgeCharacters = [
      '',
      '.',
      '-',
      ' ',
      ...unicodeWhitespaceEdgeCharacters,
      '\u200b',
      '\u2060',
      '\ufeff',
      '/',
      '\\',
    ];
    const candidates = new Set<string>([...acceptedJsonSegments, ...rejectedJsonSegments]);
    for (const left of edgeCharacters) {
      for (const right of edgeCharacters) {
        candidates.add(`${left}report${right}.json`);
        candidates.add(`prefix${left}middle${right}.json`);
      }
    }

    for (const name of candidates) {
      expect(isFilesystemJsonSegment(name), name).toBe(isSingleJsonSegment(name));
    }
  });
});

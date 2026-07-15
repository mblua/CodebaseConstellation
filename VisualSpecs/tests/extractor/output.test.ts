// Atomic publication (plan/9-extract-watch.md §Atomicity, §Verification 2).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, ExtractorError } from '../../tools/extractor/errors.ts';
import {
  STALE_TEMP_AGE_MS,
  cleanStaleTemps,
  writeFileAtomic,
  writeIfChanged,
} from '../../tools/extractor/output.ts';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vs-output-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const capture = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return undefined;
};

const tempsIn = (dir: string): string[] => readdirSync(dir).filter((f) => f.endsWith('.tmp'));

describe('writeFileAtomic', () => {
  it('writes the full content and leaves no temp file behind', () => {
    const outPath = writeFileAtomic('data/doc.json', '{"a":1}', root);
    expect(readFileSync(outPath, 'utf8')).toBe('{"a":1}');
    expect(tempsIn(join(root, 'data'))).toEqual([]);
  });

  it('replaces an existing document whole', () => {
    writeFileAtomic('data/doc.json', '{"v":1}', root);
    const outPath = writeFileAtomic('data/doc.json', '{"v":2}', root);
    expect(readFileSync(outPath, 'utf8')).toBe('{"v":2}');
  });

  it('retries a retryable rename failure with backoff, then succeeds', () => {
    const sleeps: number[] = [];
    let failures = 2;
    const outPath = writeFileAtomic('data/doc.json', '{"v":3}', root, {
      backoffMs: 7,
      sleep: (ms) => sleeps.push(ms),
      rename: (from, to) => {
        if (failures > 0) {
          failures -= 1;
          const err = new Error('locked') as NodeJS.ErrnoException;
          err.code = 'EPERM';
          throw err;
        }
        renameSync(from, to);
      },
    });
    expect(readFileSync(outPath, 'utf8')).toBe('{"v":3}');
    expect(sleeps).toEqual([7, 7]);
  });

  it('on exhausted retries: old content intact, temp removed, exit 9, NEVER a direct write', () => {
    writeFileAtomic('data/doc.json', '{"old":true}', root);
    const err = capture(() =>
      writeFileAtomic('data/doc.json', '{"new":true}', root, {
        attempts: 3,
        sleep: () => {},
        rename: () => {
          const e = new Error('locked') as NodeJS.ErrnoException;
          e.code = 'EPERM';
          throw e;
        },
      }),
    );
    expect(err).toBeInstanceOf(ExtractorError);
    expect((err as ExtractorError).exitCode).toBe(EXIT.invalidOutput);
    expect(readFileSync(join(root, 'data/doc.json'), 'utf8')).toBe('{"old":true}');
    expect(tempsIn(join(root, 'data'))).toEqual([]);
  });

  it('rethrows a NON-retryable rename error immediately, temp removed', () => {
    const err = capture(() =>
      writeFileAtomic('data/doc.json', 'x', root, {
        sleep: () => {
          throw new Error('must not sleep for a non-retryable error');
        },
        rename: () => {
          const e = new Error('nope') as NodeJS.ErrnoException;
          e.code = 'EISDIR';
          throw e;
        },
      }),
    );
    expect((err as NodeJS.ErrnoException).code).toBe('EISDIR');
    expect(tempsIn(join(root, 'data'))).toEqual([]);
  });

  it('rejects an out outside the working root (exit 8) before touching the disk', () => {
    const err = capture(() => writeFileAtomic('../escape.json', 'x', root));
    expect(err).toBeInstanceOf(ExtractorError);
    expect((err as ExtractorError).exitCode).toBe(EXIT.outOutsideRoot);
  });
});

describe('writeIfChanged (watch-only skip-identical)', () => {
  it('skips a byte-identical rewrite: no write, no rename, mtime untouched', () => {
    const outPath = writeFileAtomic('data/doc.json', '{"same":1}', root);
    const before = statSync(outPath).mtimeMs;
    const { written } = writeIfChanged('data/doc.json', '{"same":1}', root);
    expect(written).toBe(false);
    expect(statSync(outPath).mtimeMs).toBe(before);
  });

  it('writes when the content differs', () => {
    writeFileAtomic('data/doc.json', '{"v":1}', root);
    const { written } = writeIfChanged('data/doc.json', '{"v":2}', root);
    expect(written).toBe(true);
    expect(readFileSync(join(root, 'data/doc.json'), 'utf8')).toBe('{"v":2}');
  });

  it('compares against ON-DISK bytes: a hand-edited out is re-asserted', () => {
    writeFileAtomic('data/doc.json', '{"truth":1}', root);
    writeFileSync(join(root, 'data/doc.json'), '{"hand":"edit"}', 'utf8');
    const { written } = writeIfChanged('data/doc.json', '{"truth":1}', root);
    expect(written).toBe(true);
    expect(readFileSync(join(root, 'data/doc.json'), 'utf8')).toBe('{"truth":1}');
  });

  it('publishes when the destination does not exist yet', () => {
    const { written } = writeIfChanged('data/doc.json', '{"first":1}', root);
    expect(written).toBe(true);
  });
});

describe('cleanStaleTemps (age-guarded startup cleanup)', () => {
  it('removes only aged temps of THIS out; fresh and foreign files survive', () => {
    mkdirSync(join(root, 'data'), { recursive: true });
    const old = join(root, 'data/doc.json.4242.0.tmp');
    writeFileSync(old, 'stale');
    const aged = (Date.now() - STALE_TEMP_AGE_MS - 60_000) / 1000;
    utimesSync(old, aged, aged);
    writeFileSync(join(root, 'data/doc.json.4243.1.tmp'), 'fresh live temp');
    writeFileSync(join(root, 'data/other.json.1.0.tmp'), 'different out');
    writeFileSync(join(root, 'data/doc.json'), 'the document');

    const removed = cleanStaleTemps('data/doc.json', root);
    expect(removed).toEqual(['doc.json.4242.0.tmp']);
    const left = readdirSync(join(root, 'data')).sort();
    expect(left).toEqual(['doc.json', 'doc.json.4243.1.tmp', 'other.json.1.0.tmp']);
  });

  it('is a no-op when the out directory does not exist yet', () => {
    expect(cleanStaleTemps('data/doc.json', root)).toEqual([]);
  });
});

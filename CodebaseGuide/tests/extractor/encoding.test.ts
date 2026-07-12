// Valid UTF-8 is not invalid UTF-8 just because it contains U+FFFD.
//
// `buffer.toString('utf8')` SUBSTITUTES U+FFFD for every byte it cannot decode. So
// checking the decoded string for that character — `text.includes('�')` — cannot
// tell "these bytes are not UTF-8" from "this file legitimately contains the replacement
// character". A source file that mentions U+FFFD (a test for exactly this behaviour, for
// instance) is perfectly valid UTF-8, and the extractor refused to read it.
//
// Decoding in FATAL mode asks the decoder the question we actually mean.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, ExtractorError } from '../../tools/extractor/errors.ts';
import { readTextFile } from '../../tools/extractor/repo.ts';

const temps: string[] = [];
afterEach(() => {
  while (temps.length > 0) {
    const dir = temps.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'codebaseguide-encoding-'));
  temps.push(dir);
  return dir;
}

describe('readTextFile decodes UTF-8 in fatal mode', () => {
  it('READS a file that legitimately contains U+FFFD', () => {
    const root = tempDir();
    // U+FFFD, correctly encoded as EF BF BD. This is valid UTF-8.
    const content = 'const REPLACEMENT = "�";\n';
    writeFileSync(join(root, 'ok.ts'), content, 'utf8');

    expect(readTextFile(root, 'ok.ts')).toBe(content);
  });

  it('REFUSES a file whose bytes are not valid UTF-8, with the encoding exit code', () => {
    const root = tempDir();
    // 0x80 is a continuation byte with nothing to continue: not valid UTF-8 anywhere.
    writeFileSync(join(root, 'bad.ts'), Buffer.from([0x63, 0x6f, 0x6e, 0x73, 0x74, 0x20, 0x80, 0x0a]));

    try {
      readTextFile(root, 'bad.ts');
      throw new Error('expected a throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ExtractorError);
      expect((err as ExtractorError).exitCode).toBe(EXIT.invalidEncoding);
    }
  });

  it('still refuses a binary file, by its NUL bytes', () => {
    const root = tempDir();
    writeFileSync(join(root, 'bin.dat'), Buffer.from([0x00, 0x01, 0x02, 0x03]));
    try {
      readTextFile(root, 'bin.dat');
      throw new Error('expected a throw');
    } catch (err) {
      expect((err as ExtractorError).exitCode).toBe(EXIT.unreadableFile);
    }
  });

  it('reads ordinary multibyte text unharmed', () => {
    const root = tempDir();
    const content = '// 中文 · emoji 🙈 · ñ\nexport const x = 1;\n';
    writeFileSync(join(root, 'utf8.ts'), content, 'utf8');
    expect(readTextFile(root, 'utf8.ts')).toBe(content);
  });
});

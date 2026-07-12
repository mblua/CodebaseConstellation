// Adversarial path containment (§11). Every case here is a way the first cut could be
// made to read or write outside the repository it was pointed at.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, win32 } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertOutputInsideRoot,
  contains,
  normalisePathStrict,
  realContains,
  relativeEscapes,
  repoRelative,
  strictRealpath,
} from '../../tools/extractor/confine.ts';
import { EXIT, ExtractorError } from '../../tools/extractor/errors.ts';

describe('relativeEscapes — the Windows cross-drive hole', () => {
  it('rejects an ABSOLUTE result, which is what another drive looks like', () => {
    // path.win32.relative('C:\\repo', 'D:\\outside\\file.txt') === 'D:\\outside\\file.txt'
    const rel = win32.relative('C:\\repo', 'D:\\outside\\file.txt');
    expect(rel).toBe('D:\\outside\\file.txt');

    // There is no `..` anywhere in it, so a first-segment check waves it through.
    expect(rel.split(win32.sep)[0]).toBe('D:');
    expect(rel.startsWith('..')).toBe(false);

    // The shared guard catches it, on any operating system.
    expect(relativeEscapes(rel, { isAbsolute: win32.isAbsolute, sep: win32.sep })).toBe(true);
  });

  it('rejects a UNC path on another host', () => {
    const rel = win32.relative('C:\\repo', '\\\\server\\share\\x');
    expect(relativeEscapes(rel, { isAbsolute: win32.isAbsolute, sep: win32.sep })).toBe(true);
  });

  it('still rejects an ordinary .. chain, on both separators', () => {
    expect(relativeEscapes('..', { isAbsolute: win32.isAbsolute, sep: win32.sep })).toBe(true);
    expect(relativeEscapes('..\\x', { isAbsolute: win32.isAbsolute, sep: win32.sep })).toBe(true);
    expect(relativeEscapes('../x', { isAbsolute: posix.isAbsolute, sep: posix.sep })).toBe(true);
    expect(relativeEscapes('/etc/passwd', { isAbsolute: posix.isAbsolute, sep: posix.sep })).toBe(true);
  });

  it('accepts a path that is genuinely inside', () => {
    expect(relativeEscapes('src\\main.ts', { isAbsolute: win32.isAbsolute, sep: win32.sep })).toBe(false);
    expect(relativeEscapes('src/main.ts', { isAbsolute: posix.isAbsolute, sep: posix.sep })).toBe(false);
  });
});

describe('normalisePathStrict — an escape is reported, never clamped', () => {
  it('REFUSES to turn `src/../../../package.json` into `package.json`', () => {
    // This is the one that mattered. The old normaliser popped an empty stack and
    // silently handed back `package.json` — a real, git-tracked file. An asset import
    // pointing OUTSIDE the repository therefore became an edge to an unrelated file
    // INSIDE it: a relation the map asserted and could not point at.
    expect(normalisePathStrict('src/../../../package.json')).toBeNull();
    expect(normalisePathStrict('../secrets.env')).toBeNull();
    expect(normalisePathStrict('a/../..')).toBeNull();
  });

  it('still collapses the harmless cases', () => {
    expect(normalisePathStrict('src/./shared/../main.ts')).toBe('src/main.ts');
    expect(normalisePathStrict('a/b/../c')).toBe('a/c');
    expect(normalisePathStrict('./x.ts')).toBe('x.ts');
  });
});

describe('repoRelative', () => {
  it('returns null for anything outside, and a POSIX path for anything inside', () => {
    const root = process.cwd();
    expect(repoRelative(root, join(root, 'src', 'main.ts'))).toBe('src/main.ts');
    expect(repoRelative(root, join(root, '..', 'elsewhere.ts'))).toBeNull();
    expect(repoRelative(root, root)).toBeNull(); // the root is not a file inside itself
  });
});

// ---------------------------------------------------------------------------
// The disk-touching cases. A symlink inside the root that points outside it is
// invisible to every lexical check ever written.
// ---------------------------------------------------------------------------

const temps: string[] = [];
function temp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  while (temps.length > 0) {
    const dir = temps.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * Windows needs a privilege to create symlinks. Where the host will not give us one,
 * the test is SKIPPED — reported as skipped, and visible in the run.
 *
 * It is not turned into `expect(true).toBe(true)`. A test that passes without testing
 * anything is worse than a missing test: it is a missing test that claims to be there.
 */
function canSymlinkDirs(): boolean {
  const probe = mkdtempSync(join(tmpdir(), 'cbg-symlink-probe-'));
  try {
    const target = join(probe, 'target');
    mkdirSync(target);
    symlinkSync(target, join(probe, 'link'), 'junction');
    return true;
  } catch {
    return false;
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
}

function canSymlinkFiles(): boolean {
  const probe = mkdtempSync(join(tmpdir(), 'cbg-filelink-probe-'));
  try {
    writeFileSync(join(probe, 'target.txt'), 'x', 'utf8');
    symlinkSync(join(probe, 'target.txt'), join(probe, 'link.txt'), 'file');
    return true;
  } catch {
    return false;
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
}

const CAN_SYMLINK_DIRS = canSymlinkDirs();
const CAN_SYMLINK_FILES = canSymlinkFiles();

describe('strictRealpath fails CLOSED', () => {
  it('returns null for a path it cannot resolve, rather than guessing', () => {
    expect(strictRealpath(join(tmpdir(), 'codebaseguide-definitely-not-here'))).toBeNull();
    expect(strictRealpath(process.cwd())).not.toBeNull();
  });
});

describe('realContains — symlinks and junctions', () => {
  it('accepts an ordinary path inside the root', () => {
    const root = temp('cbg-root-');
    mkdirSync(join(root, 'data'));
    expect(realContains(root, join(root, 'data', 'out.json'))).toBe(true);
  });

  it('rejects a path outside the root, existing or not', () => {
    const root = temp('cbg-root-');
    const outside = temp('cbg-outside-');
    expect(realContains(root, join(outside, 'out.json'))).toBe(false);
    writeFileSync(join(outside, 'out.json'), '{}', 'utf8');
    expect(realContains(root, join(outside, 'out.json'))).toBe(false);
  });

  it.skipIf(!CAN_SYMLINK_DIRS)('rejects a target that reaches outside through a JUNCTION inside the root', () => {
    const root = temp('cbg-root-');
    const outside = temp('cbg-outside-');

    // `<root>/escape` is a junction to a directory somewhere else entirely.
    symlinkSync(outside, join(root, 'escape'), 'junction');
    expect(existsSync(join(root, 'escape'))).toBe(true);

    // Lexically, `<root>/escape/out.json` is inside the root. It is not.
    expect(contains(root, join(root, 'escape', 'out.json'))).toBe(true);
    expect(realContains(root, join(root, 'escape', 'out.json'))).toBe(false);

    // …and the same when the file already exists.
    writeFileSync(join(outside, 'out.json'), '{}', 'utf8');
    expect(realContains(root, join(root, 'escape', 'out.json'))).toBe(false);
  });
});

describe('assertOutputInsideRoot — two failures, two exit codes', () => {
  it('a path simply OUTSIDE the root is exit 8 (a mistyped argument)', () => {
    const workingRoot = temp('cbg-working-');
    const outside = temp('cbg-outside-');

    try {
      assertOutputInsideRoot(join(outside, 'out.json'), workingRoot);
      throw new Error('expected a throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ExtractorError);
      expect((err as ExtractorError).exitCode).toBe(EXIT.outOutsideRoot);
    }

    // Cross-drive is the same class of failure, and on Windows it has no `..` in it.
    try {
      assertOutputInsideRoot(win32.isAbsolute('D:\\x') ? 'D:\\stolen.json' : '/stolen.json', workingRoot);
      throw new Error('expected a throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ExtractorError);
      expect((err as ExtractorError).exitCode).toBe(EXIT.outOutsideRoot);
    }
  });

  it.skipIf(!CAN_SYMLINK_DIRS)('a path that escapes through a JUNCTION is exit 5 (worth investigating)', () => {
    const workingRoot = temp('cbg-working-');
    const outside = temp('cbg-outside-');
    symlinkSync(outside, join(workingRoot, 'escape'), 'junction');

    // Lexically it is inside the root. It is not inside the root.
    expect(contains(workingRoot, join(workingRoot, 'escape', 'stolen.json'))).toBe(true);
    try {
      assertOutputInsideRoot(join(workingRoot, 'escape', 'stolen.json'), workingRoot);
      throw new Error('expected a throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ExtractorError);
      expect((err as ExtractorError).exitCode).toBe(EXIT.symlinkEscape);
    }

    // …and an honest destination, existing or not, is still allowed.
    expect(() => assertOutputInsideRoot(join(workingRoot, 'data', 'ok.json'), workingRoot)).not.toThrow();
  });

  it.skipIf(!CAN_SYMLINK_FILES)('FAILS CLOSED on a broken symlink: a path we cannot resolve is not a path we trust', () => {
    const workingRoot = temp('cbg-working-');
    const outside = temp('cbg-outside-');

    // A link to something that does not exist. `existsSync` FOLLOWS links, so it calls
    // this absent — and the first cut then fell back to the parent directory, decided
    // the parent was inside the root, and said yes. Writing through it would have
    // created the file at the LINK'S TARGET, outside the root.
    const dangling = join(workingRoot, 'dangling.json');
    symlinkSync(join(outside, 'does-not-exist.json'), dangling, 'file');
    expect(existsSync(dangling)).toBe(false); // …and yet it is there.

    expect(realContains(workingRoot, dangling)).toBe(false);
    try {
      assertOutputInsideRoot(dangling, workingRoot);
      throw new Error('expected a throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ExtractorError);
      expect((err as ExtractorError).exitCode).toBe(EXIT.symlinkEscape);
    }
  });
});

describe('a tracked symlink escaping the repository is SKIPPED, not fatal', () => {
  it.skipIf(!CAN_SYMLINK_FILES)(
    'records it in the skipped list with a reason, and maps the rest of the repo',
    async () => {
      const { readRepo } = await import('../../tools/extractor/repo.ts');
      const root = temp('cbg-repo-');
      const outside = temp('cbg-outside-');
      writeFileSync(join(outside, 'secret.txt'), 'shh', 'utf8');
      writeFileSync(join(root, 'kept.txt'), 'ok', 'utf8');
      symlinkSync(join(outside, 'secret.txt'), join(root, 'escape.txt'), 'file');

      const git = (args: string[]): void => {
        execFileSync('git', args, { cwd: root, stdio: 'pipe', windowsHide: true });
      };
      git(['init', '--quiet']);
      git(['config', 'user.email', 'a@b.c']);
      git(['config', 'user.name', 'x']);
      git(['config', 'core.symlinks', 'true']);
      git(['add', '-A']);
      git(['commit', '--quiet', '-m', 'f']);

      const repo = readRepo(root);

      // One bad link does not stop a repository from being mapped…
      expect(repo.files).toContain('kept.txt');

      // …and it is not silently swallowed either. Git may store the link as a plain
      // file when `core.symlinks` is off, in which case there is nothing to escape —
      // but if it IS a link, it must be skipped and it must say why.
      const escaped = repo.skipped.find((s) => s.path === 'escape.txt');
      const trackedAsFile = repo.files.includes('escape.txt');
      expect(
        escaped !== undefined || trackedAsFile,
        'the link is neither skipped nor tracked, so it vanished',
      ).toBe(true);
      if (escaped !== undefined) {
        expect(escaped.reason).toContain('outside the repository root');
        expect(repo.files).not.toContain('escape.txt');
      }
    },
  );
});

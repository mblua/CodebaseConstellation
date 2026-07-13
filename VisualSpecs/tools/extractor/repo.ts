// Git-tracked files only, and never through a shell (§10.1, §11).
//
//  * `git ls-files -z` is NUL-separated, so a path containing a space, a quote or
//    a newline survives intact.
//  * Git is invoked with an ARGUMENT ARRAY (`execFileSync`), never an interpolated
//    shell string. The extractor must not be a shell-injection primitive.
//  * Before any file is read, its real path is resolved and asserted to be inside
//    the repository root. `git ls-files` can list a tracked symlink pointing
//    outside the repo; the extractor must not be a repo-escape primitive either,
//    even though AgentsCommander has no such symlink today.

import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { EXIT, ExtractorError } from './errors.ts';
import { repoRelative } from './confine.ts';

export interface RepoFiles {
  root: string;
  /** POSIX-relative, sorted. Symlinks escaping the root are excluded. */
  files: string[];
  commit: string | undefined;
  /**
   * The working tree has TRACKED files that differ from `commit`.
   *
   * This matters, and it took a mystery to notice it: the extractor lists files with
   * `git ls-files` (the index) but reads their CONTENT from the working tree. If the
   * tree is dirty, every line number in every piece of evidence describes the file on
   * disk — while `source.commit` claims the document describes a commit. That is a
   * document asserting a provenance it cannot back up, which is the one thing this
   * product exists not to do.
   *
   * It is not an error: mapping work in progress is a perfectly good thing to want. It
   * is a FACT, and the document now states it.
   */
  dirty: boolean;
  /** The tracked files that differ from the commit. */
  modifiedTrackedFiles: string[];
  /** Paths that were skipped, and why. Surfaced as `unresolved` (§11). */
  skipped: { path: string; reason: string }[];
}

function git(root: string, args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      // CAPTURE stderr rather than letting it through to the parent. `execFileSync`
      // pipes a child's stderr to our own by default, which is why running the
      // error-contract test printed `fatal: not a git repository` into the middle of
      // an otherwise green gate. A pipeline that cries wolf is a pipeline nobody
      // reads.
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { status?: number; stderr?: string };
    if (e.code === 'ENOENT') {
      throw new ExtractorError(EXIT.gitMissing, 'git is not on PATH', { needed: 'git' });
    }
    const stderr = typeof e.stderr === 'string' ? e.stderr : '';
    if (/not a git repository/i.test(stderr)) {
      throw new ExtractorError(EXIT.notAGitRepo, `not a git repository: ${root}`, { root });
    }
    throw new ExtractorError(EXIT.notAGitRepo, `git ${args.join(' ')} failed: ${stderr.trim()}`, {
      root,
    });
  }
}

export function readRepo(rootInput: string): RepoFiles {
  const root = resolve(rootInput);
  try {
    if (!statSync(root).isDirectory()) {
      throw new ExtractorError(EXIT.notAGitRepo, `not a directory: ${root}`, { root });
    }
  } catch (err) {
    if (err instanceof ExtractorError) throw err;
    throw new ExtractorError(EXIT.notAGitRepo, `cannot open ${root}`, { root });
  }

  const listed = git(root, ['ls-files', '-z']);
  const skipped: { path: string; reason: string }[] = [];
  const files: string[] = [];

  const realRoot = realpathSync(root);
  for (const raw of listed.split('\0')) {
    if (raw === '') continue;
    const posix = raw.split(sep).join('/');
    const absolute = join(root, posix);

    let real: string;
    try {
      real = realpathSync(absolute);
    } catch {
      // Tracked but not on disk (a broken symlink, a sparse checkout).
      skipped.push({ path: posix, reason: 'tracked but not readable on disk' });
      continue;
    }

    // `repoRelative` rejects a `..` chain AND an absolute result — the latter being
    // how a Windows path on another DRIVE comes back from `path.relative`, with no
    // `..` anywhere in it (see confine.ts). A tracked symlink pointing at `D:\` is an
    // escape, and the first cut did not see it.
    if (repoRelative(realRoot, real) === null) {
      skipped.push({ path: posix, reason: 'resolves outside the repository root (symlink escape)' });
      continue;
    }

    files.push(posix);
  }

  files.sort();

  let commit: string | undefined;
  try {
    commit = git(root, ['rev-parse', 'HEAD']).trim();
  } catch {
    commit = undefined; // a repository with no commits is still extractable
  }

  // Which TRACKED files differ from that commit? `-z` again, because a path can contain
  // anything. Untracked files are irrelevant: they are not in the map at all.
  const modifiedTrackedFiles: string[] = [];
  try {
    const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=no']);
    for (const entry of status.split('\0')) {
      if (entry.length < 4) continue;
      // "XY <path>" — the path starts at offset 3.
      const path = entry.slice(3).split(sep).join('/');
      if (path !== '') modifiedTrackedFiles.push(path);
    }
  } catch {
    // A repository with no commits has nothing to be dirty against.
  }
  modifiedTrackedFiles.sort();

  return {
    root,
    files,
    commit,
    dirty: modifiedTrackedFiles.length > 0,
    modifiedTrackedFiles,
    skipped,
  };
}

const NUL = 0;

/** Read a tracked text file. Binary and undecodable files are an error, not a guess. */
export function readTextFile(root: string, relPath: string): string {
  const absolute = join(root, relPath);
  let buffer: Buffer;
  try {
    buffer = readFileSync(absolute);
  } catch (err) {
    throw new ExtractorError(EXIT.unreadableFile, `cannot read ${relPath}`, {
      path: relPath,
      cause: (err as Error).message,
    });
  }
  // A NUL byte in the first 8 KiB is git's own binary heuristic, and it is good enough.
  const probe = buffer.subarray(0, Math.min(buffer.length, 8192));
  if (probe.includes(NUL)) {
    throw new ExtractorError(EXIT.unreadableFile, `${relPath} looks binary`, { path: relPath });
  }

  // DECODE IN FATAL MODE, rather than decoding leniently and then hunting for the
  // replacement character in the result.
  //
  // `buffer.toString('utf8')` silently substitutes U+FFFD for every invalid byte, so
  // the old check — `text.includes('�')` — could not tell "these bytes are not UTF-8"
  // from "this file legitimately contains the character U+FFFD". A source file that
  // mentions `'�'` (a test for this very behaviour, say) is perfectly valid
  // UTF-8, and the extractor refused to read it.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new ExtractorError(EXIT.invalidEncoding, `${relPath} is not valid UTF-8`, {
      path: relPath,
    });
  }
}

export function isTextLike(relPath: string): boolean {
  return /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json|jsonc|rs|toml|html|css|md|yml|yaml|txt)$/i.test(
    relPath,
  );
}

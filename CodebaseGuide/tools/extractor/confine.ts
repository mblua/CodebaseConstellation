// ONE containment policy, in one testable place, used by the CLI, the repository
// reader, the TypeScript resolver and the asset resolver.
//
// ── Why this file exists ─────────────────────────────────────────────────────
//
// The first cut wrote the same guard three times:
//
//     const rel = relative(root, candidate);
//     if (rel === '' || rel.split(sep)[0] === '..') reject();
//
// On Windows that guard is **wrong**, and a reviewer proved it:
//
//     path.win32.relative('C:\\repo', 'D:\\outside\\file.txt')  →  'D:\\outside\\file.txt'
//
// A path on another DRIVE has no `..` to find — `relative()` simply hands back an
// ABSOLUTE path, whose first segment is `D:`. So `--out D:\anywhere` passed the
// check, a tracked symlink pointing at another drive was not classified as an
// escape, and a TypeScript import resolved to another drive was treated as living
// inside the repository. The fix is one line — also reject an absolute result — and
// the reason it was missed three times is that it was written three times.
//
// The second hole was `normalisePath`, which silently ABSORBED a `..` that walked
// off the top of the tree: `src/../../../package.json` came back as `package.json`,
// which is a real, git-tracked file. An asset import pointing outside the repository
// therefore became an edge to an unrelated file INSIDE it — a relation the map would
// have asserted and could not have pointed at. An escape must be reported, never
// clamped.

import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { lstatSync, realpathSync } from 'node:fs';
import { EXIT, ExtractorError } from './errors.ts';

export interface PathApi {
  isAbsolute(p: string): boolean;
  sep: string;
}

const NODE_PATH: PathApi = { isAbsolute, sep };

/**
 * Does the output of `path.relative(root, candidate)` leave `root`?
 *
 * Takes the relative string rather than the two paths so that the Windows
 * cross-drive case can be tested from any operating system, by passing
 * `path.win32`'s behaviour in.
 */
export function relativeEscapes(rel: string, api: PathApi = NODE_PATH): boolean {
  if (rel === '') return false; // the root itself; the caller decides whether that is allowed
  // Windows cross-drive: `relative()` gives back an absolute path, not a `..` chain.
  if (api.isAbsolute(rel)) return true;
  if (rel === '..') return true;
  if (rel.startsWith(`..${api.sep}`)) return true;
  if (rel.startsWith('../')) return true; // POSIX separators, whatever the platform
  return false;
}

export interface ContainOptions {
  /** May the candidate BE the root? (true for a directory, false for a file target.) */
  allowRoot?: boolean;
}

/** Lexical containment. Necessary, and — for anything that touches the disk — not
 *  sufficient: see `realContains`. */
export function contains(root: string, candidate: string, options: ContainOptions = {}): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  if (rel === '') return options.allowRoot === true;
  return !relativeEscapes(rel);
}

/**
 * Containment AFTER following symlinks and junctions. FAIL CLOSED.
 *
 * Lexical containment alone is not enough, and the comment "the extractor is not a
 * write primitive" was not true while it was: a directory *inside* the working root
 * can be a junction that lands somewhere else entirely, and every lexical check ever
 * written will say the path is fine.
 *
 * The rule, and it matters that it is stated as a rule:
 *
 *   * Resolve the DEEPEST EXISTING entry on the path — using `lstat`, so a symlink
 *     counts as existing even when its target does not.
 *   * If that entry cannot be `realpath`ed — a broken or inaccessible symlink — the
 *     answer is NO. A path we cannot prove is inside is a path that is outside.
 *     (Writing through a broken symlink creates the file at the LINK'S TARGET, which
 *     is exactly the escape we are trying to prevent, so "I could not resolve it"
 *     must never mean "it is probably fine".)
 *   * Append whatever does not exist yet to the resolved prefix, lexically, and check
 *     containment of the result — because a file that will be created inherits the
 *     directory it is created in.
 */
export function realContains(root: string, candidate: string, options: ContainOptions = {}): boolean {
  const realRoot = strictRealpath(resolve(root));
  if (realRoot === null) return false; // we cannot even prove where the root is

  const absolute = resolve(candidate);

  // Walk up to the deepest entry that EXISTS — including one that exists only as a
  // dangling symlink, which `existsSync` (which follows links) would call absent.
  let existing = absolute;
  const missing: string[] = [];
  while (!entryExists(existing)) {
    const parent = dirname(existing);
    if (parent === existing) return false; // walked off the top of the filesystem
    missing.unshift(basename(existing));
    existing = parent;
  }

  const resolved = strictRealpath(existing);
  if (resolved === null) return false; // exists, cannot be resolved → refuse

  const target = missing.length === 0 ? resolved : join(resolved, ...missing);
  return contains(realRoot, target, missing.length === 0 ? options : { allowRoot: false });
}

/** `lstat`, so a DANGLING symlink counts as an entry that exists. */
function entryExists(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/** `null` when the path cannot be resolved. Security checks must fail closed. */
export function strictRealpath(p: string): string | null {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

/** The repo-relative POSIX path of `absolute`, or `null` if it is not inside `root`. */
export function repoRelative(root: string, absolute: string): string | null {
  const rel = relative(resolve(root), resolve(absolute));
  if (rel === '' || relativeEscapes(rel)) return null;
  return rel.split(sep).join('/');
}

/**
 * `--out` must stay inside the working root: an extractor is not a write primitive,
 * and the comment saying so was not true while the check was purely lexical.
 *
 * TWO failures, TWO exit codes — because they are two different problems for whoever
 * has to fix them. A path that is simply outside the root (including one on another
 * drive) is a mistyped argument: `outOutsideRoot`. A path that is lexically inside but
 * lands outside once symlinks are followed is a junction, and that is worth
 * investigating: `symlinkEscape`.
 *
 * Called BEFORE `mkdir` and AGAIN immediately before the write, because `mkdir -p`
 * follows a junction and the directory that will hold the file may not have existed
 * the first time we looked.
 */
export function assertOutputInsideRoot(out: string, workingRoot: string): string {
  const absolute = isAbsolute(out) ? out : resolve(workingRoot, out);

  if (!contains(workingRoot, absolute)) {
    throw new ExtractorError(EXIT.outOutsideRoot, `--out is outside ${workingRoot}: ${out}`, {
      out,
      workingRoot,
    });
  }
  if (!realContains(workingRoot, absolute)) {
    throw new ExtractorError(
      EXIT.symlinkEscape,
      `--out resolves outside ${workingRoot}: ${out}. A symlink or junction inside the working root does not make a path inside it.`,
      { out, workingRoot },
    );
  }
  return absolute;
}

/**
 * Is this a plain POSIX-RELATIVE path — the only kind a repository-relative
 * declaration is allowed to be?
 *
 * A manifest is untrusted input too. `package.json#bin`, Cargo's `[[bin]].path` and
 * Tauri's `frontendDist` are strings someone wrote, and before this guard existed the
 * normaliser happily turned every one of these into a path INSIDE the repository:
 *
 *     joinPath('',           '/package.json')       →  'package.json'      ← a real file
 *     joinPath('src-tauri',  '/package.json')       →  'src-tauri/package.json'
 *     joinPath('',           'C:/secret')           →  'C:/secret'
 *     joinPath('',           '\\\\server\\share')   →  '\\\\server\\share'
 *     joinPath('',           'src\\main.ts')        →  'src\\main.ts'
 *
 * The first two are the dangerous ones: an ABSOLUTE declaration was silently rewritten
 * into a relative one, and could then match a tracked file and become a relation the
 * map asserts and cannot point at. Absolute is not relative, and the honest answer to
 * "where is `/package.json` in this repository?" is "nowhere".
 */
export function isPosixRelative(path: string): boolean {
  if (path === '') return true; // the repository root itself; callers decide if that is legal
  for (let i = 0; i < path.length; i += 1) {
    const code = path.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false; // NUL and control characters
  }
  if (path.startsWith('/') || path.startsWith('\\')) return false; // absolute, or UNC
  if (/^[A-Za-z]:/.test(path)) return false; // 'C:\x', 'C:/x', and drive-RELATIVE 'C:x'
  if (path.includes('\\')) return false; // a Windows separator is not a POSIX one
  return true;
}

/**
 * Collapse `.` and `..` in a POSIX-relative path.
 *
 * Returns `null` when the input is not POSIX-relative to begin with, and when it walks
 * ABOVE the root. It does not clamp, because clamping is how
 * `src/../../../package.json` became `package.json` — a different, real, tracked file —
 * and an import that points outside the repository is not an import of something inside
 * it.
 */
export function normalisePathStrict(path: string): string | null {
  if (!isPosixRelative(path)) return null;

  const out: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (out.length === 0) return null; // escapes above the root
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join('/');
}

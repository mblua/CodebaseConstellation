// Atomic publication of extractor output (plan/9-extract-watch.md §Atomicity).
//
// The cross-artifact contract with the follow-file reader: at every observable
// instant, `out` contains one complete JSON document — the previous one or the new
// one. The path is never truncated in place and never holds a prefix of a document.
//
//  * The temp file is UNIQUELY named (`<out>.<pid>.<seq>.tmp`) and lives in the same
//    directory, so the rename is a rename, and one process can never publish another
//    process's half-written bytes.
//  * On Windows, `rename` can fail with EPERM/EACCES/EBUSY while a reader holds the
//    destination open without FILE_SHARE_DELETE. That is retried with bounded
//    backoff, and on exhaustion the OLD `out` is left intact. There is NO fallback
//    to a direct write of `out` — that fallback would be the torn-file hole this
//    module exists to close.
//  * Named contract promise: a rewrite that changes content produces a fresh
//    `lastModified`. The temp file's own write time becomes the destination's
//    timestamp; nothing here may ever preserve or copy timestamps (no `utimes`).
//  * Durability against power loss (fsync) is explicitly a non-goal: this is a
//    local dev loop, and the reader re-reads on the next change.

import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { EXIT, ExtractorError } from './errors.ts';
import { assertOutputInsideRoot } from './confine.ts';

/** How long a leftover temp file must have sat there before startup cleanup may
 *  delete it. A concurrent process's LIVE temp is milliseconds old; a crashed run's
 *  debris is not. */
export const STALE_TEMP_AGE_MS = 10 * 60_000;

export interface WriteRetryPolicy {
  /** Rename attempts before giving up (default 10). */
  attempts?: number;
  /** Pause between attempts (default 50 ms). */
  backoffMs?: number;
  /** Injectable for tests. Default: a real synchronous sleep. */
  sleep?: (ms: number) => void;
  /** Injectable for tests: simulate EPERM without needing a Windows share-lock. */
  rename?: (from: string, to: string) => void;
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

let tempSeq = 0;

const RETRYABLE = new Set(['EPERM', 'EACCES', 'EBUSY']);

/**
 * Write `text` to `out` atomically: unique temp in the same directory, then rename.
 * Containment is asserted before AND after `mkdir -p`, exactly as the one-shot CLI
 * always did, and for the temp path too. Returns the absolute destination path.
 */
export function writeFileAtomic(
  out: string,
  text: string,
  workingRoot: string,
  policy: WriteRetryPolicy = {},
): string {
  const attempts = policy.attempts ?? 10;
  const backoffMs = policy.backoffMs ?? 50;
  const sleep = policy.sleep ?? sleepSync;
  const rename = policy.rename ?? renameSync;

  const outPath = assertOutputInsideRoot(out, workingRoot);
  mkdirSync(dirname(outPath), { recursive: true });
  // Re-check with the parent directory now on disk: `mkdir -p` follows a junction,
  // so the path that "did not exist yet" a moment ago may now resolve elsewhere.
  assertOutputInsideRoot(outPath, workingRoot);

  const tmp = `${outPath}.${process.pid}.${tempSeq++}.tmp`;
  assertOutputInsideRoot(tmp, workingRoot);
  writeFileSync(tmp, text, 'utf8');

  let lastCode: string | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      rename(tmp, outPath);
      return outPath;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? '';
      if (!RETRYABLE.has(code)) {
        rmSync(tmp, { force: true });
        throw err;
      }
      lastCode = code;
      if (attempt < attempts) sleep(backoffMs);
    }
  }

  // Exhausted: the OLD document stays intact, the temp goes, the caller decides
  // whether this is fatal (one-shot) or a per-tick retry (watch mode).
  rmSync(tmp, { force: true });
  throw new ExtractorError(
    EXIT.invalidOutput,
    `cannot replace ${out}: rename kept failing with ${lastCode ?? '?'} after ${String(attempts)} attempts. ` +
      `Something is holding the destination open without FILE_SHARE_DELETE. The previous content is untouched.`,
    { out, attempts, code: lastCode },
  );
}

/**
 * Watch-mode publication: compare against the CURRENT ON-DISK bytes of `out` — not
 * a cached last-written text, so an `out` edited by hand differs and is re-asserted
 * on the next cycle. Byte-identical → no write, no rename, no mtime change.
 */
export function writeIfChanged(
  out: string,
  text: string,
  workingRoot: string,
  policy: WriteRetryPolicy = {},
): { written: boolean } {
  const outPath = assertOutputInsideRoot(out, workingRoot);
  let current: string | undefined;
  try {
    current = readFileSync(outPath, 'utf8');
  } catch {
    current = undefined; // absent or unreadable: publish
  }
  if (current === text) return { written: false };
  writeFileAtomic(out, text, workingRoot, policy);
  return { written: true };
}

/**
 * Startup cleanup: remove `<basename(out)>.*.tmp` siblings older than the age
 * guard. A fresh temp — possibly another live process's — is never touched.
 */
export function cleanStaleTemps(
  out: string,
  workingRoot: string,
  ageMs: number = STALE_TEMP_AGE_MS,
  now: number = Date.now(),
): string[] {
  const outPath = assertOutputInsideRoot(out, workingRoot);
  const dir = dirname(outPath);
  const prefix = `${basename(outPath)}.`;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return []; // the directory may not exist yet; nothing to clean
  }
  const removed: string[] = [];
  for (const entry of entries) {
    if (!entry.startsWith(prefix) || !entry.endsWith('.tmp')) continue;
    const full = join(dir, entry);
    try {
      if (statSync(full).mtimeMs > now - ageMs) continue; // live enough: keep
      rmSync(full, { force: true });
      removed.push(entry);
    } catch {
      // Raced away or unreadable: cleanup is best-effort by design.
    }
  }
  return removed;
}

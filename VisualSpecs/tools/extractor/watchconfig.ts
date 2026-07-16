// Watch configuration: option assembly shared with the flag parser, config-file
// parsing/validation, and the cross-target startup checks
// (plan/9-extract-watch.md §Config).
//
// THE single composition point for `generator.flags` (A1-F1): `assembleExtractOptions`
// is used by `cli.ts`'s flag parser AND by the config parser here, so a config entry
// and its equivalent command line produce deep-equal `ExtractOptions` — including the
// `flags` array in its exact historical composition order — and therefore the same
// `configDigest`. The equivalence is pinned by test, not just by this comment.

import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { EXIT, ExtractorError } from './errors.ts';
import { contains, repoRelative, strictRealpath } from './confine.ts';
import type { ExtractOptions } from './extract.ts';

/** The declared inputs of one extraction — one config entry, or one command line. */
export interface ExtractInputs {
  repo: string;
  out: string;
  name?: string | undefined;
  hierarchy?: 'logical' | 'physical' | undefined;
  invokeFacade?: string | undefined;
  bareInvoke?: boolean | undefined;
  snippets?: boolean | undefined;
  tsconfig?: string | undefined;
  stamp?: boolean | undefined;
}

/**
 * Defaults and `flags` composition in ONE place. The order — `--name`, then
 * `--hierarchy` and `--invoke-facade` (always declared, defaults included), then the
 * conditionals — is the historical order of `cli.ts`; `configDigest` hashes this
 * array literally, so the order is contract, not style.
 */
export function assembleExtractOptions(inputs: ExtractInputs): ExtractOptions {
  const hierarchy = inputs.hierarchy ?? 'logical';
  const invokeFacade = inputs.invokeFacade ?? 'transport.invoke';
  const allowBareInvoke = inputs.bareInvoke ?? false;
  const snippets = inputs.snippets ?? false;
  const stamp = inputs.stamp ?? false;

  const declared = [
    ...(inputs.name === undefined ? [] : ['--name', inputs.name]),
    '--hierarchy',
    hierarchy,
    '--invoke-facade',
    invokeFacade,
    ...(allowBareInvoke ? ['--bare-invoke'] : []),
    ...(snippets ? ['--snippets'] : []),
    ...(inputs.tsconfig === undefined ? [] : ['--tsconfig', inputs.tsconfig]),
  ];

  return {
    repo: inputs.repo,
    out: inputs.out,
    name: inputs.name,
    hierarchy,
    invokeFacade,
    allowBareInvoke,
    snippets,
    tsconfig: inputs.tsconfig,
    flags: declared,
    stamp,
  };
}

export interface WatchTarget {
  options: ExtractOptions;
  /** The effective display name: `name`, or the repo directory's own basename. */
  label: string;
}

export function effectiveLabel(inputs: ExtractInputs, cwd: string): string {
  return inputs.name ?? basename(resolve(cwd, inputs.repo));
}

const ENTRY_KEYS = new Set([
  'repo',
  'out',
  'name',
  'hierarchy',
  'invokeFacade',
  'bareInvoke',
  'snippets',
  'tsconfig',
  'stamp',
]);

const bad = (message: string, detail: Record<string, unknown> = {}): ExtractorError =>
  new ExtractorError(EXIT.badConfig, message, detail);

function entryString(entry: Record<string, unknown>, key: string, index: number): string | undefined {
  const value = entry[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value === '') {
    throw bad(`repos[${String(index)}].${key} must be a non-empty string`, { index, key });
  }
  return value;
}

function entryBoolean(entry: Record<string, unknown>, key: string, index: number): boolean | undefined {
  const value = entry[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw bad(`repos[${String(index)}].${key} must be a boolean`, { index, key });
  }
  return value;
}

/**
 * Canonical identity of a path for duplicate detection (A1-F2): resolve, realpath
 * the deepest EXISTING ancestor (collapsing junction/symlink aliasing), lexically
 * append what does not exist yet, and case-fold when the filesystem is
 * case-insensitive. `data/Corpus.json` and `data/corpus.json` are one NTFS file.
 */
export function canonicalPathKey(absolute: string, caseFold: boolean): string {
  let existing = absolute;
  const missing: string[] = [];
  for (;;) {
    try {
      lstatSync(existing);
      break;
    } catch {
      const parent = dirname(existing);
      if (parent === existing) break; // walked off the top; keep the lexical path
      missing.unshift(basename(existing));
      existing = parent;
    }
  }
  const resolved = strictRealpath(existing) ?? existing;
  const full = missing.length === 0 ? resolved : join(resolved, ...missing);
  return caseFold ? full.toLowerCase() : full;
}

/** Parse and validate `--config` text into watch targets. Fail fast, name the sin. */
export function parseWatchConfig(
  text: string,
  cwd: string,
  platform: NodeJS.Platform = process.platform,
): WatchTarget[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw bad(`--config is not valid JSON: ${(err as Error).message}`);
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw bad('--config must be an object of the shape { "repos": [ { repo, out, ... } ] }');
  }
  const rootKeys = Object.keys(raw as Record<string, unknown>).filter((k) => k !== 'repos');
  if (rootKeys.length > 0) {
    throw bad(`--config has unknown top-level key(s): ${rootKeys.join(', ')}`, { keys: rootKeys });
  }
  const repos = (raw as Record<string, unknown>)['repos'];
  if (!Array.isArray(repos) || repos.length === 0) {
    throw bad('--config needs a non-empty "repos" array');
  }

  const caseFoldPaths = platform === 'win32';
  const targets: WatchTarget[] = [];
  const outKeys = new Map<string, number>();
  const nameKeys = new Map<string, number>();

  for (let index = 0; index < repos.length; index += 1) {
    const entry = repos[index];
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw bad(`repos[${String(index)}] must be an object`, { index });
    }
    const record = entry as Record<string, unknown>;
    const unknown = Object.keys(record).filter((k) => !ENTRY_KEYS.has(k));
    if (unknown.length > 0) {
      throw bad(`repos[${String(index)}] has unknown key(s): ${unknown.join(', ')}`, {
        index,
        keys: unknown,
      });
    }

    const repo = entryString(record, 'repo', index);
    const out = entryString(record, 'out', index);
    if (repo === undefined) throw bad(`repos[${String(index)}].repo is required`, { index });
    if (out === undefined) throw bad(`repos[${String(index)}].out is required`, { index });

    const hierarchyRaw = entryString(record, 'hierarchy', index);
    if (hierarchyRaw !== undefined && hierarchyRaw !== 'logical' && hierarchyRaw !== 'physical') {
      throw bad(`repos[${String(index)}].hierarchy must be logical or physical, not "${hierarchyRaw}"`, {
        index,
      });
    }

    const inputs: ExtractInputs = {
      repo,
      out,
      name: entryString(record, 'name', index),
      hierarchy: hierarchyRaw as 'logical' | 'physical' | undefined,
      invokeFacade: entryString(record, 'invokeFacade', index),
      bareInvoke: entryBoolean(record, 'bareInvoke', index),
      snippets: entryBoolean(record, 'snippets', index),
      tsconfig: entryString(record, 'tsconfig', index),
      stamp: entryBoolean(record, 'stamp', index),
    };

    const label = effectiveLabel(inputs, cwd);

    const outKey = canonicalPathKey(resolve(cwd, out), caseFoldPaths);
    const prevOut = outKeys.get(outKey);
    if (prevOut !== undefined) {
      throw bad(
        `repos[${String(index)}].out and repos[${String(prevOut)}].out are the same file (${out}): two entries must not race one output`,
        { index, duplicateOf: prevOut },
      );
    }
    outKeys.set(outKey, index);

    // Two labels differing only in case are one identity downstream — on every OS.
    const nameKey = label.toLowerCase();
    const prevName = nameKeys.get(nameKey);
    if (prevName !== undefined) {
      throw bad(
        `repos[${String(index)}] and repos[${String(prevName)}] share the effective name "${label}": two projects must not share one identity`,
        { index, duplicateOf: prevName },
      );
    }
    nameKeys.set(nameKey, index);

    targets.push({ options: assembleExtractOptions(inputs), label });
  }

  return targets;
}

/** `--interval` is a validation floor, not a promised cadence: integer ≥ 100, or
 *  usage error. Reject, never clamp — a silently clamped typo hides a 10× mistake. */
export function parseIntervalMs(rawValue: string): number {
  if (!/^\d+$/.test(rawValue) || Number(rawValue) < 100) {
    throw new ExtractorError(
      EXIT.usage,
      `--interval must be an integer number of milliseconds ≥ 100, not "${rawValue}"`,
    );
  }
  return Number(rawValue);
}

/** exit 0 → ignored; anything else → not provably ignored (fail closed). */
export function gitCheckIgnore(repoRoot: string, relPath: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', relPath], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * A1-P1-3: an `out` inside a watched repo's working tree feeds the watcher its own
 * output — a permanent extract loop with `--stamp`, a benign-but-wasteful double
 * cycle without. Rejected at startup unless the path is git-ignored inside that
 * repo, which removes the feedback edge entirely (the fingerprint never sees
 * ignored files). Applies to flag mode exactly as to config mode.
 */
export function assertOutsOutsideWatchedRepos(
  targets: readonly WatchTarget[],
  cwd: string,
  checkIgnore: (repoRoot: string, relPath: string) => boolean = gitCheckIgnore,
): void {
  const roots = targets.map((t) => {
    const root = isAbsolute(t.options.repo) ? t.options.repo : resolve(cwd, t.options.repo);
    return { label: t.label, root, realRoot: strictRealpath(root) ?? root };
  });
  for (const target of targets) {
    const outAbs = resolve(cwd, target.options.out);
    const outReal = canonicalPathKey(outAbs, false);
    for (const { label, root, realRoot } of roots) {
      if (!contains(realRoot, outReal, { allowRoot: false })) continue;
      const rel = repoRelative(realRoot, outReal);
      if (rel !== null && checkIgnore(root, rel)) continue; // ignored there: no feedback edge
      throw new ExtractorError(
        EXIT.badConfig,
        `out "${target.options.out}" is inside the watched repo "${label}" and is not git-ignored there. ` +
          `The watcher would feed on its own output. Point it at a git-ignored path (e.g. under .local/).`,
        { out: target.options.out, repo: label },
      );
    }
  }
}

// ── CLI argument parsing (pure; cli.ts stays wiring) ─────────────────────────

export type CliCommand =
  | { kind: 'help' }
  | {
      kind: 'run';
      inputs: ExtractInputs | undefined;
      configPath: string | undefined;
      watch: boolean;
      intervalMs: number | undefined;
    };

/** Flag scanning without side effects, so the equivalence test can compare the
 *  flag path against the config path directly (§Verification 1a). */
export function parseCliArgs(argv: readonly string[]): CliCommand {
  let repo: string | undefined;
  let out: string | undefined;
  let name: string | undefined;
  let hierarchy: 'logical' | 'physical' | undefined;
  let invokeFacade: string | undefined;
  let bareInvoke: boolean | undefined;
  let snippets: boolean | undefined;
  let stamp: boolean | undefined;
  let tsconfig: string | undefined;
  let configPath: string | undefined;
  let watch = false;
  let intervalMs: number | undefined;
  const perRepoFlagsSeen: string[] = [];

  const need = (flagName: string, value: string | undefined): string => {
    if (value === undefined) throw new ExtractorError(EXIT.usage, `${flagName} needs a value`);
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    switch (arg) {
      case '-h':
      case '--help':
        return { kind: 'help' };
      case '--repo':
        repo = need('--repo', argv[++i]);
        perRepoFlagsSeen.push(arg);
        break;
      case '--out':
        out = need('--out', argv[++i]);
        perRepoFlagsSeen.push(arg);
        break;
      case '--name':
        name = need('--name', argv[++i]);
        perRepoFlagsSeen.push(arg);
        break;
      case '--hierarchy': {
        const value = need('--hierarchy', argv[++i]);
        if (value !== 'logical' && value !== 'physical') {
          throw new ExtractorError(EXIT.usage, `--hierarchy must be logical or physical, not "${value}"`);
        }
        hierarchy = value;
        perRepoFlagsSeen.push(arg);
        break;
      }
      case '--invoke-facade':
        invokeFacade = need('--invoke-facade', argv[++i]);
        perRepoFlagsSeen.push(arg);
        break;
      case '--bare-invoke':
        bareInvoke = true;
        perRepoFlagsSeen.push(arg);
        break;
      case '--tsconfig':
        tsconfig = need('--tsconfig', argv[++i]);
        perRepoFlagsSeen.push(arg);
        break;
      case '--snippets':
        snippets = true;
        perRepoFlagsSeen.push(arg);
        break;
      case '--stamp':
        stamp = true;
        perRepoFlagsSeen.push(arg);
        break;
      case '--watch':
        watch = true;
        break;
      case '--config':
        configPath = need('--config', argv[++i]);
        break;
      case '--interval':
        intervalMs = parseIntervalMs(need('--interval', argv[++i]));
        break;
      default:
        throw new ExtractorError(EXIT.usage, `unknown option: ${arg}`);
    }
  }

  if (configPath !== undefined && perRepoFlagsSeen.length > 0) {
    throw new ExtractorError(
      EXIT.usage,
      `--config is mutually exclusive with per-repo flags; drop ${[...new Set(perRepoFlagsSeen)].join(', ')} or the config file`,
    );
  }
  if (intervalMs !== undefined && !watch) {
    throw new ExtractorError(EXIT.usage, '--interval only makes sense with --watch');
  }
  if (configPath === undefined) {
    if (repo === undefined) throw new ExtractorError(EXIT.usage, '--repo is required');
    if (out === undefined) throw new ExtractorError(EXIT.usage, '--out is required');
  }

  const inputs: ExtractInputs | undefined =
    configPath === undefined
      ? { repo: repo as string, out: out as string, name, hierarchy, invokeFacade, bareInvoke, snippets, tsconfig, stamp }
      : undefined;

  return { kind: 'run', inputs, configPath, watch, intervalMs };
}

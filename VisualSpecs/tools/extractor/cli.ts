// npm run extract -- --repo <path> --out data/agentscommander.json
// npm run extract -- --watch --config .local/extract-watch.json
//
// Every failure is deterministic, carries a distinct non-zero exit code, and says
// what to do about it (§10.6). This file is WIRING: option assembly lives in
// watchconfig.ts (shared with the config parser — one composition point for
// `generator.flags`), atomic publication in output.ts, the loop in watch.ts.

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { EXIT, ExtractorError } from './errors.ts';
import { assertOutputInsideRoot } from './confine.ts';
import { extract, type ExtractResult } from './extract.ts';
import {
  assembleExtractOptions,
  assertOutsOutsideWatchedRepos,
  effectiveLabel,
  parseCliArgs,
  parseWatchConfig,
  type ExtractInputs,
  type WatchTarget,
} from './watchconfig.ts';
import { cleanStaleTemps, writeFileAtomic, writeIfChanged } from './output.ts';
import {
  createWatcher,
  fingerprintRepo,
  operationInProgress,
  resolveGitDir,
  type CycleTiming,
  type WatchIo,
} from './watch.ts';

const USAGE = `visual-specs-extract

  npm run extract -- --repo <path-to-repo> --out <path-to-json> [options]
  npm run extract -- --watch --config <path-to-config> [--interval <ms>]

Options
  --repo <path>            the repository to map. Must be a git repository.
  --out <path>             where to write the document. Must stay inside VisualSpecs/.
  --name <label>           what to call the repository (default: its directory name)
  --hierarchy <mode>       logical (default) | physical
  --invoke-facade <expr>   the call whose first argument is a command name
                           (default: transport.invoke)
  --bare-invoke            also treat invoke("name") as a command call
  --tsconfig <path>        the tsconfig that governs module resolution
                           (default: the repository's own tsconfig.json)
  --snippets               copy verbatim source lines into evidence. OFF by default:
                           it may copy a secret out of the repository into a
                           document you are about to commit.
  --stamp                  record generator.generatedAt (excluded from the
                           deterministic payload)
  --watch                  stay alive and re-extract when a watched repo changes.
                           Output writes are atomic (temp + rename); identical
                           output is not rewritten.
  --config <path>          extract several repos, from a JSON file of the shape
                           { "repos": [ { "repo", "out", ...same as flags } ] }.
                           Without --watch: extract every entry once, in order.
                           Mutually exclusive with the per-repo flags above.
  --interval <ms>          watch polling interval (default 1000, minimum 100).
                           A floor on the configured value, not a promised cadence:
                           ticks never overlap, so the real cadence is
                           max(interval, tick duration).
  -h, --help               this text
`;

const GENERATOR_LINE = 'visual-specs-extract';

function timeOfDay(): string {
  return new Date().toTimeString().slice(0, 8);
}

function printSummary(
  result: ExtractResult,
  outPath: string,
  workingRoot: string,
  extra: { label?: string; timing?: CycleTiming; written?: boolean } = {},
): void {
  const { doc, warnings } = result;
  for (const w of warnings) process.stderr.write(`warning: ${w}\n`);

  const stats = doc.stats ?? {};
  const head =
    extra.label === undefined
      ? `${GENERATOR_LINE}\n`
      : `[${timeOfDay()}] ${GENERATOR_LINE} — ${extra.label}\n`;
  let tail = `  written      ${relative(workingRoot, outPath)}\n`;
  if (extra.written === false) tail = `  written      (unchanged — no write)\n`;
  if (extra.timing !== undefined) {
    const total = extra.timing.extractMs + extra.timing.writeMs;
    tail += `  cycle        extract ${String(extra.timing.extractMs)} ms, write ${String(extra.timing.writeMs)} ms, total ${String(total)} ms\n`;
  }
  process.stdout.write(
    head +
      `  repo         ${doc.source?.root ?? '?'} @ ${doc.source?.commit?.slice(0, 7) ?? 'no commit'}` +
      `${doc.source?.dirty === true ? ' (DIRTY working tree)' : ''}\n` +
      `  tracked      ${String(stats['trackedFiles'] ?? 0)} files\n` +
      `  nodes        ${String(doc.nodes.length)}  ${JSON.stringify(stats['nodesByKind'] ?? {})}\n` +
      `  edges        ${String(doc.edges.length)}  ${JSON.stringify(stats['edgesByKind'] ?? {})}\n` +
      `  unresolved   ${String(doc.unresolved?.length ?? 0)}\n` +
      `  digest       ${doc.generator?.configDigest ?? '?'}\n` +
      tail,
  );
}

/** One-shot extraction of one target. ALWAYS writes (atomically): skip-identical is
 *  watch-only, so mtime keeps bumping and `written` keeps telling the truth (A1-F3). */
function runOnce(target: WatchTarget, workingRoot: string): void {
  const result = extract(target.options);
  const outPath = writeFileAtomic(target.options.out, result.text, workingRoot);
  printSummary(result, outPath, workingRoot);
}

/** `--config` without `--watch`: every entry, in array order, all attempted; exit
 *  code is the FIRST failing entry's code (0 if none fail). */
function runBatch(targets: readonly WatchTarget[], workingRoot: string): never {
  let firstFailure: number | undefined;
  for (const target of targets) {
    try {
      runOnce(target, workingRoot);
    } catch (err) {
      if (err instanceof ExtractorError) {
        process.stderr.write(`${JSON.stringify({ repo: target.label, ...err.toJSON() })}\n`);
        firstFailure ??= err.exitCode;
      } else {
        process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
        firstFailure ??= 1;
      }
    }
  }
  process.exit(firstFailure ?? EXIT.ok);
}

function runWatch(targets: readonly WatchTarget[], intervalMs: number, workingRoot: string): void {
  assertOutsOutsideWatchedRepos(targets, workingRoot);

  if (targets.some((t) => t.options.stamp)) {
    process.stderr.write(
      'warning: --stamp under --watch makes every document differ (generatedAt), so identical ' +
        'content is rewritten every cycle and the follow-file reader reloads for nothing.\n',
    );
  }

  for (const target of targets) {
    const removed = cleanStaleTemps(target.options.out, workingRoot);
    for (const temp of removed) process.stderr.write(`warning: removed stale temp ${temp}\n`);
  }

  // Git dirs resolved ONCE and cached: linked worktrees keep their markers under
  // the main repository's .git/worktrees/<name>/ (final pass 2).
  const gitDirs = new Map<string, string | null>();
  const markerFor = (root: string): string | null => {
    if (!gitDirs.has(root)) gitDirs.set(root, resolveGitDir(root));
    const gitDir = gitDirs.get(root) ?? null;
    return gitDir === null ? null : operationInProgress(gitDir);
  };

  const io: WatchIo = {
    fingerprint: fingerprintRepo,
    opMarker: markerFor,
    extract,
    publish: (target, text) => writeIfChanged(target.options.out, text, workingRoot),
    onExtracted: (target, result, timing, written, startup) => {
      const outPath = assertOutputInsideRoot(target.options.out, workingRoot);
      printSummary(result, outPath, workingRoot, {
        label: `${target.label}${startup ? ' (startup pass)' : ''}`,
        timing,
        written,
      });
    },
    onError: (target, error, phase) => {
      const payload =
        error instanceof ExtractorError
          ? { repo: target.label, phase, ...error.toJSON() }
          : {
              repo: target.label,
              phase,
              error: error instanceof Error ? error.message : String(error),
            };
      process.stderr.write(`${JSON.stringify(payload)}\n`);
    },
    info: (line) => {
      const stream = line.startsWith('warning:') ? process.stderr : process.stdout;
      stream.write(`[${timeOfDay()}] ${line}\n`);
    },
    now: Date.now,
    schedule: (fn, ms) => {
      const handle = setTimeout(fn, ms);
      return { cancel: () => clearTimeout(handle) };
    },
  };

  const watcher = createWatcher(targets, intervalMs, workingRoot, io);

  const shutdown = (): void => {
    watcher.stop();
    process.exit(EXIT.ok);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  process.stdout.write(
    `[${timeOfDay()}] watching ${String(targets.length)} repo(s) every ${String(intervalMs)} ms — Ctrl+C to stop\n`,
  );
  watcher.start();
}

function main(): void {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (parsed.kind === 'help') {
    process.stdout.write(USAGE);
    process.exit(EXIT.ok);
  }
  const command = parsed;
  const workingRoot = process.cwd();

  let targets: WatchTarget[];
  if (command.configPath === undefined) {
    const inputs = command.inputs as ExtractInputs;
    targets = [{ options: assembleExtractOptions(inputs), label: effectiveLabel(inputs, workingRoot) }];
  } else {
    let text: string;
    try {
      text = readFileSync(command.configPath, 'utf8');
    } catch (err) {
      throw new ExtractorError(EXIT.badConfig, `cannot read --config ${command.configPath}`, {
        cause: (err as Error).message,
      });
    }
    targets = parseWatchConfig(text, workingRoot);
  }

  // Lexical containment (including the Windows cross-drive case) → exit 8;
  // containment after following symlinks and junctions → exit 5. For EVERY target,
  // at startup, before anything runs. See confine.ts.
  for (const target of targets) assertOutputInsideRoot(target.options.out, workingRoot);

  if (command.watch) {
    runWatch(targets, command.intervalMs ?? 1000, workingRoot);
    return; // the scheduled loop keeps the process alive
  }
  if (command.configPath !== undefined) runBatch(targets, workingRoot);
  runOnce(targets[0] as WatchTarget, workingRoot);
}

try {
  main();
} catch (err) {
  if (err instanceof ExtractorError) {
    process.stderr.write(`${JSON.stringify(err.toJSON())}\n`);
    process.exit(err.exitCode);
  }
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
}

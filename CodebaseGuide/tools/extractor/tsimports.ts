// Discovery and resolution are two different problems (§10.2).
//
//  * DISCOVERY: `ts.preProcessFile(text, true, true)` returns every import
//    specifier with its position, without a type-check. It is a fast scanner — it
//    takes text and flags, and it does NOT receive a filename or CompilerOptions.
//    It cannot, by itself, apply moduleResolution, `paths`, `extends`, or extension
//    rules, and an earlier draft that thought it could was wrong.
//  * RESOLUTION: load the project's tsconfig with `ts.readConfigFile` +
//    `ts.parseJsonConfigFileContent`, then resolve each specifier with
//    `ts.resolveModuleName(...)`. AgentsCommander declares `moduleResolution:
//    "bundler"` and `paths` for @shared/*, @sidebar/*, @terminal/* — the resolver
//    honours them because it IS the compiler's resolver.
//
// Anything the resolver cannot place inside the tracked tree goes to `unresolved`
// with evidence. Never a guess.

import ts from 'typescript';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { existsSync } from 'node:fs';
import type { Evidence, GuideEdge, Unresolved } from '../../src/contract/types.ts';
import { EXIT, ExtractorError } from './errors.ts';
import { fileNodeId } from './ownership.ts';
import { dirOf, joinPath, lineOfIndex } from './manifests.ts';
import { normalisePathStrict, realContains, repoRelative } from './confine.ts';
import { readTextFile } from './repo.ts';

export interface TsImportsResult {
  edges: GuideEdge[];
  unresolved: Unresolved[];
  externalSpecifiers: string[];
  /** Which tsconfig governed which package, for provenance. */
  tsconfigs: string[];
  aliasHits: number;
}

const TS_EXT = /\.(ts|tsx|mts|cts)$/i;

export function extractTsImports(
  root: string,
  files: readonly string[],
  tsconfigOverride: string | undefined,
): TsImportsResult {
  const tracked = new Set(files);
  const edges: GuideEdge[] = [];
  const unresolved: Unresolved[] = [];
  const external = new Set<string>();
  let aliasHits = 0;

  const configPath = tsconfigOverride ?? files.find((f) => f === 'tsconfig.json');
  if (configPath === undefined) {
    // No tsconfig: TypeScript resolution is unavailable, and the coverage record
    // will say so. It is not an error — a repository need not be a TS project.
    return { edges, unresolved, externalSpecifiers: [], tsconfigs: [], aliasHits: 0 };
  }

  // `--tsconfig` is user input. An absolute path, or one climbing out with `..`, would
  // turn the extractor into a reader of arbitrary files on the machine.
  if (isAbsolute(configPath) || normalisePathStrict(configPath) === null) {
    throw new ExtractorError(
      EXIT.badTsconfig,
      `--tsconfig must be a path inside the repository: ${configPath}`,
      { tsconfig: configPath },
    );
  }

  // The TypeScript API asserts that the paths it is handed are NORMALISED — which
  // on Windows means forward slashes. Handing it `C:\…\tsconfig.json` makes it
  // throw a raw `Debug Failure`, which is not an error contract, it is a crash.
  const absoluteConfig = toTsPath(join(root, configPath));
  if (!realContains(root, absoluteConfig)) {
    throw new ExtractorError(
      EXIT.badTsconfig,
      `--tsconfig resolves outside the repository: ${configPath}`,
      { tsconfig: configPath },
    );
  }
  if (!existsSync(absoluteConfig)) {
    throw new ExtractorError(EXIT.badTsconfig, `tsconfig not found: ${configPath}`, {
      tsconfig: configPath,
    });
  }

  // A CONFINED read host. `extends` is resolved by TypeScript, relative to the config
  // it appears in — so `"extends": "../../../../secrets/tsconfig.json"` would make
  // the compiler read a file outside the repository on our behalf, and a tool whose
  // job is to map ONE repository has no business reading anything else. Refusing to
  // read outside the root turns that into an ordinary tsconfig error, which the error
  // contract already knows how to report.
  const confinedReadFile = (p: string): string | undefined =>
    realContains(root, p) ? ts.sys.readFile(p) : undefined;
  const confinedFileExists = (p: string): boolean => realContains(root, p) && ts.sys.fileExists(p);

  const read = ts.readConfigFile(absoluteConfig, confinedReadFile);
  if (read.error !== undefined) {
    throw new ExtractorError(
      EXIT.badTsconfig,
      `tsconfig is invalid: ${ts.flattenDiagnosticMessageText(read.error.messageText, ' ')}`,
      { tsconfig: configPath },
    );
  }
  if (read.config === undefined) {
    throw new ExtractorError(EXIT.badTsconfig, `tsconfig is invalid: ${configPath}`, {
      tsconfig: configPath,
    });
  }

  const parseHost: ts.ParseConfigHost = {
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    readDirectory: (dir, extensions, excludes, includes, depth) =>
      realContains(root, dir, { allowRoot: true })
        ? ts.sys.readDirectory(dir, extensions, excludes, includes, depth)
        : [],
    fileExists: confinedFileExists,
    readFile: confinedReadFile,
  };
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    parseHost,
    toTsPath(dirname(absoluteConfig)),
  );
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0] as ts.Diagnostic;
    throw new ExtractorError(
      EXIT.badTsconfig,
      `tsconfig is invalid: ${ts.flattenDiagnosticMessageText(first.messageText, ' ')}`,
      { tsconfig: configPath },
    );
  }

  const options = parsed.options;
  const aliasPrefixes = Object.keys(options.paths ?? {}).map((k) => k.replace(/\*$/, ''));
  // The module-resolution host is confined too: anything the resolver reaches for
  // outside the repository simply does not exist, so it becomes an EXTERNAL
  // specifier — counted, never a node, and never a file this tool opened.
  const host: ts.ModuleResolutionHost = {
    fileExists: confinedFileExists,
    readFile: confinedReadFile,
    directoryExists: (p) => realContains(root, p, { allowRoot: true }) && ts.sys.directoryExists(p),
    realpath: ts.sys.realpath,
    getCurrentDirectory: () => toTsPath(root),
    getDirectories: (p) =>
      realContains(root, p, { allowRoot: true }) ? ts.sys.getDirectories(p) : [],
  };
  const cache = ts.createModuleResolutionCache(toTsPath(root), (s) => s, options);

  for (const file of files) {
    if (!TS_EXT.test(file)) continue;
    const text = readTextFile(root, file);
    const pre = ts.preProcessFile(text, true, true);
    const containing = toTsPath(join(root, file));

    for (const ref of pre.importedFiles) {
      const specifier = ref.fileName;
      const line = lineOfIndex(text, ref.pos);
      const evidence: Evidence[] = [{ path: file, line }];

      const isRelative = specifier.startsWith('.');
      const isAlias = aliasPrefixes.some((p) => p !== '' && specifier.startsWith(p));
      if (isAlias) aliasHits += 1;

      const resolved = ts.resolveModuleName(specifier, containing, options, host, cache);
      const target = resolved.resolvedModule?.resolvedFileName;

      if (target !== undefined) {
        const rel = toRepoRelative(root, target);
        if (rel !== null && tracked.has(rel)) {
          if (rel === file) continue; // a self-import is not a relation worth drawing
          edges.push({
            id: `imports:${fileNodeId(file)}->${fileNodeId(rel)}`,
            kind: 'imports',
            sourceId: fileNodeId(file),
            targetId: fileNodeId(rel),
            confidence: 'resolved',
            evidence,
            metadata: { specifier },
          });
          continue;
        }
        // Resolved, but outside the tracked tree: a dependency, not a node in v1.
        external.add(specifier);
        continue;
      }

      if (isRelative) {
        // TypeScript's resolver only resolves MODULES. `import './styles/app.css'`
        // and `import icon from '../assets/icon-16.png'` are asset imports: the
        // bundler resolves them, `tsc` does not. They are still real relations —
        // the target is a git-tracked file that provably exists — so joining the
        // specifier to the containing directory and checking the tracked set
        // RESOLVES them. That is proof, not a guess, and dropping them into
        // `unresolved` (as the first cut did) silently lost 20 real edges.
        const direct = resolveAgainstTrackedTree(file, specifier, tracked);
        if (direct !== null && direct !== file) {
          edges.push({
            id: `imports:${fileNodeId(file)}->${fileNodeId(direct)}`,
            kind: 'imports',
            sourceId: fileNodeId(file),
            targetId: fileNodeId(direct),
            confidence: 'resolved',
            evidence,
            metadata: { specifier, via: 'asset' },
          });
          continue;
        }
      }

      if (!isRelative && !isAlias) {
        // A bare specifier this build cannot see (node_modules may not even be
        // installed). External by definition; counted, not invented.
        external.add(specifier);
        continue;
      }

      unresolved.push({
        kind: 'imports',
        reason: isAlias
          ? 'a path alias did not resolve to a git-tracked file'
          : 'a relative import did not resolve to a git-tracked file',
        evidence,
        detail: { specifier, from: file },
      });
    }
  }

  dedupeEdges(edges);
  edges.sort((a, b) => (a.id < b.id ? -1 : 1));
  unresolved.sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));

  return {
    edges,
    unresolved,
    externalSpecifiers: [...external].sort(),
    tsconfigs: [configPath],
    aliasHits,
  };
}

/** Two imports of the same module from the same file are ONE relation. The extra
 *  evidence lines are kept on it, so nothing is lost. */
function dedupeEdges(edges: GuideEdge[]): void {
  const byId = new Map<string, GuideEdge>();
  for (const edge of edges) {
    const seen = byId.get(edge.id);
    if (seen === undefined) {
      byId.set(edge.id, edge);
      continue;
    }
    for (const ev of edge.evidence ?? []) {
      if (!(seen.evidence ?? []).some((e) => e.path === ev.path && e.line === ev.line)) {
        (seen.evidence ??= []).push(ev);
      }
    }
  }
  edges.length = 0;
  for (const edge of byId.values()) {
    edge.evidence?.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
    edges.push(edge);
  }
}

/** TypeScript normalises to forward slashes and asserts on anything else. */
function toTsPath(p: string): string {
  return p.split(sep).join('/');
}

const FALLBACK_EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.cts', '.d.ts', '.js', '.jsx', '.json'];

/**
 * Join a relative specifier to its containing directory and check the git-tracked
 * set. Exact-match first, then the usual extension and `index` candidates.
 *
 * A specifier that climbs ABOVE the repository root resolves to `null` — it is not
 * clamped to the root. Clamping is how `src/shared` + `../../../package.json` used to
 * come back as `package.json`, a real tracked file, and the map would then have drawn
 * a relation to a file the import never touched.
 */
function resolveAgainstTrackedTree(
  from: string,
  specifier: string,
  tracked: ReadonlySet<string>,
): string | null {
  const base = joinPath(dirOf(from), specifier);
  if (base === null || base === '') return null;
  for (const ext of FALLBACK_EXTENSIONS) {
    const candidate = `${base}${ext}`;
    if (tracked.has(candidate)) return candidate;
  }
  for (const ext of FALLBACK_EXTENSIONS) {
    if (ext === '') continue;
    const candidate = `${base}/index${ext}`;
    if (tracked.has(candidate)) return candidate;
  }
  return null;
}

/** Shared containment: rejects a `..` chain AND an absolute result, which is what a
 *  Windows path on another drive looks like coming out of `path.relative`. */
function toRepoRelative(root: string, absolutePath: string): string | null {
  const abs = isAbsolute(absolutePath) ? absolutePath : resolve(root, absolutePath);
  return repoRelative(root, abs);
}

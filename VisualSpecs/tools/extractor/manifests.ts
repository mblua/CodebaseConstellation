// Manifests are anchors (§5.2, §10.1).
//
// A root `Cargo.toml` carrying `[workspace]` and no `[package]` is a WORKSPACE,
// not a package — so it anchors nothing. A `package.json` with no `workspaces` key
// is a single package. Both cases occur in AgentsCommander, and both are covered
// by fixtures.

import { parseToml } from './toml.ts';
import { readTextFile } from './repo.ts';
import { isPosixRelative, normalisePathStrict } from './confine.ts';

export interface CargoBin {
  name: string;
  /** Repo-relative path to the binary's source file, when it can be named. */
  path?: string;
}

export interface Manifest {
  ecosystem: 'npm' | 'cargo';
  /** Repo-relative path of the manifest file itself. */
  manifestPath: string;
  /** Repo-relative directory the manifest anchors. '' is the repository root. */
  dir: string;
  name: string;
  version?: string;
  /** A pure `[workspace]` Cargo.toml declares no package and anchors nothing. */
  isPackage: boolean;
  isWorkspace: boolean;
  /** 1-based line of the `name` declaration, for evidence. */
  nameLine: number;
  libName?: string;
  cargoBins: CargoBin[];
  /** npm `bin` field: name → script path (repo-relative). */
  npmBins: { name: string; path: string; line: number }[];
  hasWorkspacesKey: boolean;
}

export function isManifestPath(path: string): boolean {
  return path.endsWith('package.json') || path.endsWith('Cargo.toml');
}

export function readManifests(root: string, files: readonly string[]): Manifest[] {
  const out: Manifest[] = [];
  for (const path of files) {
    const base = basename(path);
    if (base === 'package.json') {
      const m = readNpm(root, path);
      if (m !== null) out.push(m);
    } else if (base === 'Cargo.toml') {
      const m = readCargo(root, path);
      if (m !== null) out.push(m);
    }
  }
  out.sort((a, b) => (a.manifestPath < b.manifestPath ? -1 : 1));
  return out;
}

function readNpm(root: string, manifestPath: string): Manifest | null {
  const text = readTextFile(root, manifestPath);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null; // an unparseable package.json anchors nothing; it is still a file node
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null;
  const obj = json as Record<string, unknown>;

  const dir = dirOf(manifestPath);
  const name = typeof obj['name'] === 'string' ? obj['name'] : dir === '' ? 'package' : basename(dir);
  const npmBins: { name: string; path: string; line: number }[] = [];
  const binLine = lineOf(text, /"bin"\s*:/);
  const bin = obj['bin'];
  const addBin = (binName: string, target: string): void => {
    // A `bin` pointing outside the package is not a binary this repository ships.
    const resolved = joinPath(dir, target);
    if (resolved === null) return;
    npmBins.push({ name: binName, path: resolved, line: binLine });
  };
  if (typeof bin === 'string') {
    addBin(name, bin);
  } else if (typeof bin === 'object' && bin !== null && !Array.isArray(bin)) {
    for (const [binName, target] of Object.entries(bin as Record<string, unknown>)) {
      if (typeof target !== 'string') continue;
      addBin(binName, target);
    }
    npmBins.sort((a, b) => (a.name < b.name ? -1 : 1));
  }

  return {
    ecosystem: 'npm',
    manifestPath,
    dir,
    name,
    version: typeof obj['version'] === 'string' ? obj['version'] : undefined,
    isPackage: true,
    isWorkspace: obj['workspaces'] !== undefined,
    nameLine: lineOf(text, /"name"\s*:/),
    cargoBins: [],
    npmBins,
    hasWorkspacesKey: obj['workspaces'] !== undefined,
  };
}

function readCargo(root: string, manifestPath: string): Manifest | null {
  const text = readTextFile(root, manifestPath);
  const toml = parseToml(text);
  const pkg = toml.table('package');
  const isWorkspace = toml.has('workspace');
  const dir = dirOf(manifestPath);

  if (pkg === undefined || typeof pkg['name'] !== 'string') {
    if (!isWorkspace) return null;
    // A workspace root: real, but it anchors nothing.
    return {
      ecosystem: 'cargo',
      manifestPath,
      dir,
      name: dir === '' ? 'workspace' : basename(dir),
      isPackage: false,
      isWorkspace: true,
      nameLine: 1,
      cargoBins: [],
      npmBins: [],
      hasWorkspacesKey: false,
    };
  }

  const lib = toml.table('lib');
  const cargoBins: CargoBin[] = [];
  for (const bin of toml.array('bin')) {
    const name = bin['name'];
    if (typeof name !== 'string') continue;
    const declared = bin['path'];
    // A `[[bin]] path` pointing outside the crate is not a binary this crate builds.
    const resolved = typeof declared === 'string' ? joinPath(dir, declared) : null;
    cargoBins.push({ name, ...(resolved === null ? {} : { path: resolved }) });
  }

  return {
    ecosystem: 'cargo',
    manifestPath,
    dir,
    name: pkg['name'],
    version: typeof pkg['version'] === 'string' ? pkg['version'] : undefined,
    isPackage: true,
    isWorkspace,
    nameLine: lineOf(text, /^\s*name\s*=/m),
    libName: lib !== undefined && typeof lib['name'] === 'string' ? lib['name'] : undefined,
    cargoBins,
    npmBins: [],
    hasWorkspacesKey: false,
  };
}

export function lineOf(text: string, pattern: RegExp): number {
  const m = pattern.exec(text);
  if (m === null) return 1;
  return text.slice(0, m.index).split('\n').length;
}

export function lineOfIndex(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

export function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

export function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

/**
 * Join a repo-relative directory and a relative specifier.
 *
 * Returns `null` when the specifier is not POSIX-RELATIVE (absolute, UNC, a drive
 * letter, a backslash) or when the result walks ABOVE the repository root. It never
 * clamps: clamping is exactly how `/package.json` became `package.json`, and how
 * `src/shared` + `../../../package.json` became `package.json` — a real, tracked file
 * — so a declaration pointing OUTSIDE the repository became a relation to a file
 * INSIDE it. See `confine.ts`.
 *
 * The specifier is checked BEFORE the join, because joining first hides the problem:
 * `'src-tauri' + '/package.json'` is `'src-tauri//package.json'`, whose empty segment
 * the collapser would quietly drop.
 */
export function joinPath(dir: string, rel: string): string | null {
  if (!isPosixRelative(rel)) return null;
  const cleaned = rel.replace(/^\.\//, '');
  const joined = dir === '' ? cleaned : `${dir}/${cleaned}`;
  return normalisePathStrict(joined);
}

export { isPosixRelative, normalisePathStrict } from './confine.ts';

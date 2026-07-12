// The ownership tree: "nearest manifest wins" (§5.2). Mechanical, no inference.
//
//  1. Git-tracked files only.
//  2. Every package.json / Cargo.toml that declares a package is an ANCHOR at its
//     own directory.
//  3. Every path belongs to its NEAREST ENCLOSING ANCHOR — which is how npm and
//     Cargo themselves resolve ownership. So `src-tauri/**` belongs to the
//     `agentscommander-new` crate, not to the root npm package that physically
//     encloses it.
//  4. Anchors are children of the repository (HOISTED) under `--hierarchy logical`;
//     under `--hierarchy physical` they nest by path. Node ids are IDENTICAL in
//     both modes, which is what lets `view.positions` survive the switch.
//  5. Directory nodes exist only on the path from an anchor to a file it owns, so
//     a pure pass-through directory like `crates/` never becomes a box.

import type { GuideNode } from '../../src/contract/types.ts';
import { basename, dirOf, type Manifest } from './manifests.ts';

export type Hierarchy = 'logical' | 'physical';

export interface Ownership {
  nodes: GuideNode[];
  /** file path → id of the package node that owns it. */
  ownerOf: Map<string, string>;
  /** anchor dir → package node id. */
  packageIdOf: Map<string, string>;
  repoId: string;
  anchors: Manifest[];
  fileIdOf: Map<string, string>;
}

export function repoNodeId(repoName: string): string {
  return `repo:${repoName}`;
}

export function packageNodeId(m: Manifest): string {
  return `pkg:${m.ecosystem}:${m.manifestPath}`;
}

export function dirNodeId(path: string): string {
  return `dir:${path}`;
}

export function fileNodeId(path: string): string {
  return `file:${path}`;
}

const TEST_PATTERN = /(^|\/)(tests?|__tests__|__mocks__)(\/)|\.(test|spec)\.[cm]?[jt]sx?$|_test\.rs$/i;

export function looksLikeTest(path: string): boolean {
  return TEST_PATTERN.test(path);
}

function languageOf(path: string): string | undefined {
  if (/\.(ts|mts|cts)$/i.test(path)) return 'typescript';
  if (/\.tsx$/i.test(path)) return 'typescript-jsx';
  if (/\.(js|mjs|cjs)$/i.test(path)) return 'javascript';
  if (/\.jsx$/i.test(path)) return 'javascript-jsx';
  if (/\.rs$/i.test(path)) return 'rust';
  if (/\.toml$/i.test(path)) return 'toml';
  if (/\.json$/i.test(path)) return 'json';
  if (/\.(md|markdown)$/i.test(path)) return 'markdown';
  if (/\.(css|scss)$/i.test(path)) return 'css';
  if (/\.html?$/i.test(path)) return 'html';
  if (/\.(ya?ml)$/i.test(path)) return 'yaml';
  return undefined;
}

/** The nearest enclosing anchor for `path`, by longest matching directory prefix. */
export function nearestAnchor(anchors: readonly Manifest[], path: string): Manifest | null {
  let best: Manifest | null = null;
  let bestLength = -1;
  for (const anchor of anchors) {
    if (anchor.dir === '') {
      if (bestLength < 0) {
        best = anchor;
        bestLength = 0;
      }
      continue;
    }
    const prefix = `${anchor.dir}/`;
    if (!path.startsWith(prefix)) continue;
    if (anchor.dir.length > bestLength) {
      best = anchor;
      bestLength = anchor.dir.length;
    }
  }
  return best;
}

export function buildOwnership(
  repoName: string,
  files: readonly string[],
  manifests: readonly Manifest[],
  hierarchy: Hierarchy,
): Ownership {
  const anchors = manifests.filter((m) => m.isPackage);
  const repoId = repoNodeId(repoName);

  const nodes: GuideNode[] = [
    {
      id: repoId,
      kind: 'repository',
      label: repoName,
      parentId: null,
      path: '',
      metadata: { hierarchy },
    },
  ];

  const packageIdOf = new Map<string, string>();
  for (const anchor of anchors) packageIdOf.set(anchor.dir, packageNodeId(anchor));

  // --- package nodes -------------------------------------------------------
  for (const anchor of anchors) {
    const id = packageNodeId(anchor);
    // Under `physical`, a package nests inside whatever anchor encloses its own
    // directory; under `logical` it is hoisted to the repository. Either way the
    // id is the same, so a stored position survives the switch.
    let parentId = repoId;
    if (hierarchy === 'physical' && anchor.dir !== '') {
      const enclosing = nearestAnchor(
        anchors.filter((a) => a.dir !== anchor.dir),
        `${anchor.dir}/`,
      );
      if (enclosing !== null) parentId = packageNodeId(enclosing);
    }

    const metadata: Record<string, unknown> = {
      ecosystem: anchor.ecosystem,
      hasWorkspacesKey: anchor.hasWorkspacesKey,
    };
    if (anchor.version !== undefined) metadata['version'] = anchor.version;
    if (anchor.libName !== undefined) metadata['libName'] = anchor.libName;
    // The empty path means "the repository root directory". A node may only carry
    // it when it declares WHY it is allowed to — see contract/types.ts.
    if (anchor.dir === '') metadata['rootAnchor'] = true;

    nodes.push({
      // A Rust CRATE is its own kind. Two of AgentsCommander's four anchors are
      // crates, and calling them "packages with ecosystem: cargo" made the reader do
      // the translation the map exists to do for them. The ID is unchanged
      // (`pkg:cargo:…`), so a saved layout survives the distinction.
      id,
      kind: anchor.ecosystem === 'cargo' ? 'crate' : 'package',
      label: anchor.name,
      parentId,
      path: anchor.dir,
      metadata,
      evidence: [{ path: anchor.manifestPath, line: anchor.nameLine }],
    });
  }

  // --- file and directory nodes --------------------------------------------
  const ownerOf = new Map<string, string>();
  const fileIdOf = new Map<string, string>();
  const dirNeeded = new Set<string>();
  const dirOwner = new Map<string, Manifest>();

  for (const file of files) {
    const anchor = nearestAnchor(anchors, file);
    if (anchor === null) continue; // no package anchors it: not represented in v1
    ownerOf.set(file, packageNodeId(anchor));

    // Every directory between the anchor and the file becomes a box; nothing above
    // the anchor does, so `crates/` is never created.
    let dir = dirOf(file);
    while (dir !== '' && dir !== anchor.dir && dir.startsWith(anchor.dir === '' ? '' : `${anchor.dir}/`)) {
      if (dirNeeded.has(dir)) break; // its ancestors are already registered
      dirNeeded.add(dir);
      dirOwner.set(dir, anchor);
      dir = dirOf(dir);
    }
  }

  const sortedDirs = [...dirNeeded].sort();
  for (const dir of sortedDirs) {
    const anchor = dirOwner.get(dir);
    if (anchor === undefined) continue;
    const parentDir = dirOf(dir);
    const parentId =
      parentDir === anchor.dir || parentDir === '' || !dirNeeded.has(parentDir)
        ? packageNodeId(anchor)
        : dirNodeId(parentDir);
    nodes.push({
      id: dirNodeId(dir),
      kind: 'directory',
      label: basename(dir),
      parentId,
      path: dir,
    });
  }

  for (const file of files) {
    const ownerId = ownerOf.get(file);
    if (ownerId === undefined) continue;
    const parentDir = dirOf(file);
    const parentId = parentDir !== '' && dirNeeded.has(parentDir) ? dirNodeId(parentDir) : ownerId;

    const metadata: Record<string, unknown> = { isTest: looksLikeTest(file) };
    const language = languageOf(file);
    if (language !== undefined) metadata['language'] = language;

    const id = fileNodeId(file);
    fileIdOf.set(file, id);
    nodes.push({
      id,
      kind: 'file',
      label: basename(file),
      parentId,
      path: file,
      metadata,
    });
  }

  return { nodes, ownerOf, packageIdOf, repoId, anchors, fileIdOf };
}

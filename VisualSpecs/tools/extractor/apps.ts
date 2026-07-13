// Applications are RELATED to code, not containers of it (§5.3).
//
// An application is something that RUNS. It is detected only from citable signals,
// and every application node carries the evidence that justified it. Its link to
// code is a typed relation — `bundles`, `entrypoint` — never a containment level,
// because the repository forces it: the Tauri desktop app spans TWO UNITS OF CODE — an
// npm package and a Rust crate — and the session-bridge crate ships TWO BINARIES.
// Applications and the units they bundle are N:M, and a single-parent tree cannot
// express N:M.
//
// ── One judgement call, stated out loud ──────────────────────────────────────
// `src-tauri/src/main.rs` IS a cargo bin target. Emitting it as its own
// `application` would assert that two separate things run, when in fact it is the
// Tauri desktop app's own binary. So: a cargo bin whose crate directory also
// contains a `tauri.conf.json` does NOT become a second application; it becomes
// the `entrypoint` of the Tauri one. The rule is mechanical, the suppression is
// counted in `stats.suppressedTauriOwnedBins`, and nothing is silently dropped.

import type { VisualSpecsEdge, VisualSpecsNode } from '../../src/contract/types.ts';
import { basename, dirOf, lineOf, joinPath, type Manifest } from './manifests.ts';
import { fileNodeId, packageNodeId, type Ownership } from './ownership.ts';
import { readTextFile } from './repo.ts';

export interface AppsResult {
  nodes: VisualSpecsNode[];
  edges: VisualSpecsEdge[];
  suppressedTauriOwnedBins: string[];
  webEntry: string | undefined;
}

/**
 * The npm anchor that OWNS `dir` — the longest matching directory prefix, exactly the
 * way npm resolves ownership itself (§5.2).
 *
 * The first cut took the first `anchors.find()` that matched, which made the answer
 * depend on the order the manifests happened to be read in: with a root `package.json`
 * and a nested `web/package.json`, the root always won, because `''` is a prefix of
 * everything and it sorts first. That is not "nearest manifest wins", it is "whichever
 * manifest I looked at first wins".
 */
export function nearestNpmAnchor(anchors: readonly Manifest[], dir: string): Manifest | undefined {
  let best: Manifest | undefined;
  let bestLength = -1;

  for (const anchor of anchors) {
    if (anchor.ecosystem !== 'npm') continue;
    if (anchor.dir === '') {
      // The root owns everything, but only as a last resort.
      if (bestLength < 0) {
        best = anchor;
        bestLength = 0;
      }
      continue;
    }
    if (dir !== anchor.dir && !dir.startsWith(`${anchor.dir}/`)) continue;
    if (anchor.dir.length > bestLength) {
      best = anchor;
      bestLength = anchor.dir.length;
    }
  }
  return best;
}

export function detectApps(
  root: string,
  files: readonly string[],
  manifests: readonly Manifest[],
  ownership: Ownership,
): AppsResult {
  const nodes: VisualSpecsNode[] = [];
  const edges: VisualSpecsEdge[] = [];
  const suppressedTauriOwnedBins: string[] = [];
  const fileSet = new Set(files);
  const anchors = manifests.filter((m) => m.isPackage);
  let webEntry: string | undefined;

  const addEdge = (edge: VisualSpecsEdge): void => {
    edges.push(edge);
  };

  // --- 1. Tauri desktop apps -----------------------------------------------
  const tauriConfigs = files.filter((f) => basename(f) === 'tauri.conf.json');
  const tauriCrateDirs = new Set<string>();

  for (const conf of tauriConfigs) {
    const text = readTextFile(root, conf);
    let json: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed === 'object' && parsed !== null) json = parsed as Record<string, unknown>;
    } catch {
      continue;
    }
    const confDir = dirOf(conf);
    tauriCrateDirs.add(confDir);

    const productName = typeof json['productName'] === 'string' ? json['productName'] : 'desktop app';
    const appId = `app:tauri:${conf}`;
    nodes.push({
      id: appId,
      kind: 'application',
      label: `${productName} (desktop)`,
      parentId: ownership.repoId,
      metadata: { flavor: 'desktop' },
      evidence: [{ path: conf, line: lineOf(text, /"productName"\s*:/) }],
    });

    // The crate whose manifest directory holds the Tauri config.
    const crate = anchors.find((a) => a.dir === confDir && a.ecosystem === 'cargo');
    if (crate !== undefined) {
      addEdge({
        id: `bundles:${appId}->${packageNodeId(crate)}`,
        kind: 'bundles',
        sourceId: appId,
        targetId: packageNodeId(crate),
        confidence: 'declared',
        evidence: [
          { path: conf, note: "the Tauri config sits in the crate's own manifest directory" },
        ],
      });
    }

    // …and the npm package whose build output it embeds. One npm package, one crate,
    // one app — which is why `application` is not a containment level (§5.3).
    //
    // `frontendDist` IS THE ANCHOR. The first cut fired on `beforeBuildCommand ||
    // frontendDist` and, when only the command was present, defaulted `distDir` to `''`
    // and pinned the bundle on the ROOT npm package — inferring what an app ships from
    // the fact that it runs *some* command. `npm run build` tells you a build happens.
    // It does not tell you where the output lands, and guessing is exactly what this
    // product refuses to do. No `frontendDist` that resolves inside the repository ⇒ no
    // npm bundle edge.
    const build = json['build'];
    if (typeof build === 'object' && build !== null) {
      const b = build as Record<string, unknown>;
      const beforeBuild = b['beforeBuildCommand'];
      const frontendDist = b['frontendDist'];

      // Relative to the CONFIG's directory: `../dist` from `src-tauri/` is `dist/`.
      // An absolute or escaping declaration resolves to null and bundles nothing.
      const distDir = typeof frontendDist === 'string' ? joinPath(confDir, frontendDist) : null;
      const npmPkg = distDir === null ? undefined : nearestNpmAnchor(anchors, distDir);

      if (npmPkg !== undefined && typeof frontendDist === 'string') {
        const evidence = [
          {
            path: conf,
            line: lineOf(text, /"frontendDist"\s*:/),
            note: `frontendDist: ${frontendDist} → ${distDir === '' ? '(repository root)' : distDir}`,
          },
        ];
        if (typeof beforeBuild === 'string') {
          evidence.push({
            path: conf,
            line: lineOf(text, /"beforeBuildCommand"\s*:/),
            note: `beforeBuildCommand: ${beforeBuild}`,
          });
        }
        addEdge({
          id: `bundles:${appId}->${packageNodeId(npmPkg)}`,
          kind: 'bundles',
          sourceId: appId,
          targetId: packageNodeId(npmPkg),
          // Inferred from the build configuration, not declared as a dependency.
          confidence: 'heuristic',
          evidence,
        });
      }
    }
  }

  // --- 2. Web apps: an index.html at a package root, next to a Vite config ---
  for (const anchor of anchors) {
    if (anchor.ecosystem !== 'npm') continue;
    const indexPath = anchor.dir === '' ? 'index.html' : `${anchor.dir}/index.html`;
    if (!fileSet.has(indexPath)) continue;
    const hasVite = files.some(
      (f) => dirOf(f) === anchor.dir && /^vite\.config\.[cm]?[jt]s$/.test(basename(f)),
    );
    if (!hasVite) continue;

    const html = readTextFile(root, indexPath);
    const scriptMatch = /<script[^>]*\ssrc=["']([^"']+)["']/i.exec(html);
    const title = /<title>([^<]*)<\/title>/i.exec(html);
    const appId = `app:web:${indexPath}`;
    const label = title !== null ? `${(title[1] as string).trim()} (web)` : 'web app';

    nodes.push({
      id: appId,
      kind: 'application',
      label,
      parentId: ownership.repoId,
      metadata: { flavor: 'web' },
      evidence: [
        {
          path: indexPath,
          line: lineOf(html, /<script[^>]*\ssrc=/i),
          note: 'the document that boots the frontend',
        },
      ],
    });

    addEdge({
      id: `bundles:${appId}->${packageNodeId(anchor)}`,
      kind: 'bundles',
      sourceId: appId,
      targetId: packageNodeId(anchor),
      confidence: 'declared',
      evidence: [{ path: indexPath, note: 'served by the package that owns this index.html' }],
    });

    if (scriptMatch !== null) {
      // THE ONE DELIBERATE EXCEPTION to "no leading slash" (§B1).
      //
      // `<script src="/src/main.tsx">` in an HTML document is rooted at the SERVED
      // root — which for a Vite app is the package directory — not at the filesystem
      // root. So exactly one leading slash is stripped here, at the caller, where the
      // meaning of the slash is known. `joinPath` still refuses everything else:
      // `//evil.com/x.js` keeps a leading slash after the strip and is rejected, and
      // `C:/x.js` never had one.
      const raw = scriptMatch[1] as string;
      const src = raw.startsWith('/') ? raw.slice(1) : raw;
      const entry = joinPath(anchor.dir, src);
      if (entry !== null && fileSet.has(entry)) {
        webEntry = entry;
        addEdge({
          id: `entrypoint:${appId}->${fileNodeId(entry)}`,
          kind: 'entrypoint',
          sourceId: appId,
          targetId: fileNodeId(entry),
          confidence: 'resolved',
          evidence: [
            {
              path: indexPath,
              line: lineOf(html, /<script[^>]*\ssrc=/i),
              note: `<script src="${scriptMatch[1] as string}">`,
            },
          ],
        });
      }
    }
  }

  // --- 3. Cargo binaries ---------------------------------------------------
  for (const anchor of anchors) {
    if (anchor.ecosystem !== 'cargo') continue;

    const candidates: { name: string; path: string; why: string }[] = [];
    const mainRs = anchor.dir === '' ? 'src/main.rs' : `${anchor.dir}/src/main.rs`;
    if (fileSet.has(mainRs)) {
      candidates.push({ name: anchor.name, path: mainRs, why: 'cargo bin target (src/main.rs)' });
    }
    const binDir = anchor.dir === '' ? 'src/bin/' : `${anchor.dir}/src/bin/`;
    for (const f of files) {
      if (!f.startsWith(binDir) || !f.endsWith('.rs')) continue;
      if (f.slice(binDir.length).includes('/')) continue;
      candidates.push({
        name: basename(f).replace(/\.rs$/, ''),
        path: f,
        why: 'cargo bin target (src/bin/*.rs)',
      });
    }
    for (const bin of anchor.cargoBins) {
      if (bin.path === undefined || !fileSet.has(bin.path)) continue;
      if (candidates.some((c) => c.path === bin.path)) continue;
      candidates.push({ name: bin.name, path: bin.path, why: 'cargo [[bin]] target' });
    }

    for (const candidate of candidates) {
      // The Tauri-owned binary is the desktop app's own; it is an entrypoint, not
      // a second application.
      if (tauriCrateDirs.has(anchor.dir)) {
        suppressedTauriOwnedBins.push(candidate.path);
        const conf = `${anchor.dir === '' ? '' : `${anchor.dir}/`}tauri.conf.json`;
        const appId = `app:tauri:${conf}`;
        addEdge({
          id: `entrypoint:${appId}->${fileNodeId(candidate.path)}`,
          kind: 'entrypoint',
          sourceId: appId,
          targetId: fileNodeId(candidate.path),
          confidence: 'resolved',
          evidence: [
            {
              path: candidate.path,
              note: `${candidate.why}, in the crate the Tauri config anchors — this is the desktop app's own binary`,
            },
          ],
        });
        continue;
      }

      const appId = `app:cargo-bin:${candidate.path}`;
      nodes.push({
        id: appId,
        kind: 'application',
        label: candidate.name,
        parentId: ownership.repoId,
        metadata: { flavor: 'bin' },
        evidence: [{ path: candidate.path, note: candidate.why }],
      });
      addEdge({
        id: `bundles:${appId}->${packageNodeId(anchor)}`,
        kind: 'bundles',
        sourceId: appId,
        targetId: packageNodeId(anchor),
        confidence: 'declared',
        evidence: [{ path: anchor.manifestPath, note: 'the crate that builds this binary' }],
      });
      addEdge({
        id: `entrypoint:${appId}->${fileNodeId(candidate.path)}`,
        kind: 'entrypoint',
        sourceId: appId,
        targetId: fileNodeId(candidate.path),
        confidence: 'declared',
        evidence: [{ path: candidate.path, note: candidate.why }],
      });
    }
  }

  // --- 4. npm bins ---------------------------------------------------------
  for (const anchor of anchors) {
    if (anchor.ecosystem !== 'npm') continue;
    for (const bin of anchor.npmBins) {
      const appId = `app:npm-bin:${anchor.manifestPath}#${bin.name}`;
      nodes.push({
        id: appId,
        kind: 'application',
        label: `${anchor.name} (cli)`,
        parentId: ownership.repoId,
        metadata: { flavor: 'cli', command: bin.name },
        evidence: [{ path: anchor.manifestPath, line: bin.line, note: `package.json#bin.${bin.name}` }],
      });
      addEdge({
        id: `bundles:${appId}->${packageNodeId(anchor)}`,
        kind: 'bundles',
        sourceId: appId,
        targetId: packageNodeId(anchor),
        confidence: 'declared',
        evidence: [{ path: anchor.manifestPath, line: bin.line }],
      });
      if (fileSet.has(bin.path)) {
        addEdge({
          id: `entrypoint:${appId}->${fileNodeId(bin.path)}`,
          kind: 'entrypoint',
          sourceId: appId,
          targetId: fileNodeId(bin.path),
          confidence: 'declared',
          evidence: [{ path: anchor.manifestPath, line: bin.line, note: `bin.${bin.name} → ${bin.path}` }],
        });
      }
    }
  }

  nodes.sort((a, b) => (a.id < b.id ? -1 : 1));
  edges.sort((a, b) => (a.id < b.id ? -1 : 1));
  suppressedTauriOwnedBins.sort();

  return { nodes, edges, suppressedTauriOwnedBins, webEntry };
}

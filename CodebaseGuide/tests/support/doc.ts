import type { GuideEdge, GuideNode, JsonObject } from '../../src/contract/types.ts';

export function node(
  id: string,
  kind: string,
  parentId: string | null,
  over: Partial<GuideNode> = {},
): GuideNode {
  return { id, kind, label: id, parentId, ...over };
}

export function edge(
  id: string,
  kind: string,
  sourceId: string,
  targetId: string,
  over: Partial<GuideEdge> = {},
): GuideEdge {
  return { id, kind, sourceId, targetId, confidence: 'resolved', ...over };
}

export function docText(
  nodes: readonly GuideNode[],
  edges: readonly GuideEdge[],
  extra: JsonObject = {},
): string {
  return JSON.stringify({
    formatVersion: '1.0',
    nodes,
    edges,
    ...extra,
  });
}

/**
 * A small tree that is enough to state every projection law on:
 *
 *   repo
 *   ├── pkg-a
 *   │   ├── dir-a       ── file-a1, file-a2
 *   └── pkg-b
 *       └── dir-b       ── file-b1
 *
 * with file→file edges that cross packages, cross directories, and stay inside one
 * directory — so collapsing produces visible edges AND internal buckets.
 */
export function sampleDoc(): string {
  const nodes: GuideNode[] = [
    node('repo', 'repository', null, { path: '' }),
    node('pkg-a', 'package', 'repo', { path: 'a' }),
    node('pkg-b', 'package', 'repo', { path: 'b' }),
    node('dir-a', 'directory', 'pkg-a', { path: 'a/src' }),
    node('dir-b', 'directory', 'pkg-b', { path: 'b/src' }),
    node('file-a1', 'file', 'dir-a', { path: 'a/src/one.ts' }),
    node('file-a2', 'file', 'dir-a', { path: 'a/src/two.ts' }),
    node('file-b1', 'file', 'dir-b', { path: 'b/src/one.ts' }),
  ];
  const edges: GuideEdge[] = [
    // crosses packages
    edge('e1', 'imports', 'file-a1', 'file-b1'),
    edge('e2', 'imports', 'file-a2', 'file-b1'),
    // stays inside dir-a → an internal bucket once dir-a collapses
    edge('e3', 'imports', 'file-a1', 'file-a2'),
    // a different kind between the same pair: must NOT merge with e1/e2
    edge('e4', 'bundles', 'file-a1', 'file-b1', { confidence: 'declared' }),
  ];
  return docText(nodes, edges);
}

/** Deterministic PRNG. A property test that cannot be replayed is not a test. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

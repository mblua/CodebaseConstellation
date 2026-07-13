// Projection (§6). The two hard semantics, provable headless.

import { describe, expect, it } from 'vitest';
import { importDoc } from '../../src/contract/load.ts';
import { OwnershipOutline } from '../../src/domain/outline.ts';
import { checkPartition, project } from '../../src/projection/project.ts';
import { docText, edge, node, sampleDoc } from '../support/doc.ts';

function load(text: string) {
  const loaded = importDoc(text);
  return { model: loaded.model, outline: new OwnershipOutline(loaded.model) };
}

describe('nearest visible ancestor', () => {
  it('a file→file relation projects to container→container when the containers collapse', () => {
    const { model, outline } = load(sampleDoc());

    // Only the repository is expanded: everything below collapses into pkg-a / pkg-b.
    const collapsed = project(model, outline, new Set(['repo']));
    expect(collapsed.visibleNodes).toEqual(['repo', 'pkg-a', 'pkg-b']);

    const imports = collapsed.visibleEdges.filter((e) => e.kind === 'imports');
    expect(imports).toHaveLength(1);
    const merged = imports[0];
    expect(merged?.sourceId).toBe('pkg-a');
    expect(merged?.targetId).toBe('pkg-b');
    // Both file→file imports are behind that ONE line, and it carries their ids.
    expect(merged?.count).toBe(2);
    expect([...(merged?.sourceEdgeIds ?? [])]).toEqual(['e1', 'e2']);
  });

  it('expanding restores the SPECIFIC endpoints', () => {
    const { model, outline } = load(sampleDoc());
    const expanded = project(model, outline, new Set(['repo', 'pkg-a', 'pkg-b', 'dir-a', 'dir-b']));

    const imports = expanded.visibleEdges.filter((e) => e.kind === 'imports');
    const pairs = imports.map((e) => `${e.sourceId}->${e.targetId}`).sort();
    expect(pairs).toEqual(['file-a1->file-a2', 'file-a1->file-b1', 'file-a2->file-b1']);
    // Every one of them is now a single logical relation again.
    for (const e of imports) expect(e.count).toBe(1);
  });

  it('a relation with both endpoints inside a collapsed box becomes an INTERNAL BUCKET that keeps its ids', () => {
    const { model, outline } = load(sampleDoc());
    const collapsed = project(model, outline, new Set(['repo']));

    const buckets = collapsed.internalBucketsByNode.get('pkg-a') ?? [];
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.kind).toBe('imports');
    expect(buckets[0]?.count).toBe(1);
    // A counter would have preserved the QUANTITY and destroyed the INFORMATION.
    expect([...(buckets[0]?.sourceEdgeIds ?? [])]).toEqual(['e3']);
  });

  it('KIND is part of the bucket identity: bundles and imports never merge into a meaningless ×2', () => {
    const { model, outline } = load(sampleDoc());
    const collapsed = project(model, outline, new Set(['repo']));
    const kinds = collapsed.visibleEdges
      .filter((e) => e.sourceId === 'pkg-a' && e.targetId === 'pkg-b')
      .map((e) => e.kind)
      .sort();
    expect(kinds).toEqual(['bundles', 'imports']);
  });

  it('expansion inside a hidden subtree is remembered but inert', () => {
    const { model, outline } = load(sampleDoc());
    // dir-a is expanded, but pkg-a is not — so dir-a is not even visible.
    const graph = project(model, outline, new Set(['repo', 'dir-a']));
    expect(graph.visibleNodes).toEqual(['repo', 'pkg-a', 'pkg-b']);

    // Re-expanding pkg-a restores exactly the view we left, dir-a still open.
    const back = project(model, outline, new Set(['repo', 'pkg-a', 'dir-a']));
    expect(back.visibleNodes).toContain('file-a1');
  });
});

describe('no string keys anywhere (§6.3)', () => {
  it('survives adversarial ids that would collide under a concatenated key', () => {
    // (kind="k|a", src="b") and (kind="k", src="a|b") produce the identical key
    // "k|a|b" under any delimiter scheme. Nested Maps cannot be fooled.
    const nodes = [
      node('r', 'repository', null),
      node('b', 'k|a', 'r'),
      node('a|b', 'file', 'r'),
      node('c', 'file', 'r'),
      node('->', 'file', 'r'),
      node('#', 'file', 'r'),
      node('🙈', 'file', 'r'),
      node('‮rtl', 'file', 'r'),
    ];
    const edges = [
      edge('x1', 'k|a', 'b', 'c'),
      edge('x2', 'k', 'a|b', 'c'),
      edge('x3', 'k', '->', '#'),
      edge('x4', 'k', '🙈', '‮rtl'),
      edge('a->b', 'k', 'c', 'b'),
    ];
    const { model, outline } = load(docText(nodes, edges));
    const graph = project(model, outline, new Set(['r']));

    // Five distinct logical edges, five distinct visible edges — none merged.
    expect(graph.visibleEdges).toHaveLength(5);
    const ids = graph.visibleEdges.flatMap((e) => [...e.sourceEdgeIds]).sort();
    expect(ids).toEqual(['a->b', 'x1', 'x2', 'x3', 'x4']);
    expect(checkPartition(model, outline, graph)).toEqual([]);
  });

  it('assigns visible ids that are not logical ids', () => {
    const { model, outline } = load(sampleDoc());
    const graph = project(model, outline, new Set(['repo']));
    for (const e of graph.visibleEdges) {
      expect(model.edgeById.has(e.id)).toBe(false);
      expect(e.id).toMatch(/^v\d+$/);
    }
    for (const b of graph.internalBuckets) expect(b.id).toMatch(/^i\d+$/);
  });
});

describe('determinism (§6.6)', () => {
  it('a shuffled input document produces an identical VisibleGraph', () => {
    const parsed = JSON.parse(sampleDoc()) as { nodes: unknown[]; edges: unknown[] };
    const shuffled = JSON.stringify({
      ...parsed,
      nodes: [...parsed.nodes].reverse(),
      edges: [...parsed.edges].reverse(),
    });

    const a = load(sampleDoc());
    const b = load(shuffled);
    const ga = project(a.model, a.outline, new Set(['repo']));
    const gb = project(b.model, b.outline, new Set(['repo']));

    expect(gb.visibleNodes).toEqual(ga.visibleNodes);
    expect(gb.visibleEdges).toEqual(ga.visibleEdges);
    expect(gb.internalBuckets).toEqual(ga.internalBuckets);
  });
});

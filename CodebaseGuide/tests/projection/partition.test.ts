// I9 — THE PARTITION LAW, as a property over seeded pseudo-random expand/collapse
// sequences (§6.5, §12).
//
// > Let B be the multiset union of `sourceEdgeIds` over all visibleEdges and all
// > internalBuckets. Then B is EXACTLY the set of logical edge ids — same
// > cardinality, no duplicates, no omissions. Furthermore, for every logical edge e,
// > the bucket containing e.id MATCHES (rep(source), rep(target), kind).
//
// The second sentence is what makes it a real law. A sum of counters can be right
// while omitting one id and double-counting another, so this test checks PLACEMENT,
// not just totals.

import { describe, expect, it } from 'vitest';
import { importDoc } from '../../src/contract/load.ts';
import type { GuideEdge, GuideNode } from '../../src/contract/types.ts';
import { OwnershipOutline, assertInjective } from '../../src/domain/outline.ts';
import { allOutlineNodes } from '../../src/domain/commands.ts';
import { checkPartition, project } from '../../src/projection/project.ts';
import type { VisibleEdge, VisibleGraph } from '../../src/projection/types.ts';
import { buildScene } from '../../src/app/scene.ts';
import { stateFromLoaded } from '../../src/app/state.ts';
import { computeGeometry } from '../../src/domain/layoutEngine.ts';
import { docText, mulberry32 } from '../support/doc.ts';

/** A deep, wide, seeded tree with edges at every level — the shape a real repository
 *  has, generated so that thousands of expand/collapse states can be checked. */
function randomDoc(seed: number): string {
  const rnd = mulberry32(seed);
  const nodes: GuideNode[] = [{ id: 'root', kind: 'repository', label: 'root', parentId: null }];
  const leaves: string[] = [];
  const containers: string[] = ['root'];

  const kinds = ['package', 'directory', 'directory', 'file'];
  for (let i = 0; i < 60; i += 1) {
    const parent = containers[Math.floor(rnd() * containers.length)] as string;
    const kind = kinds[Math.floor(rnd() * kinds.length)] as string;
    const id = `n${i}`;
    nodes.push({ id, kind, label: id, parentId: parent });
    if (kind === 'file') leaves.push(id);
    else containers.push(id);
  }
  const all = nodes.map((n) => n.id);

  const edgeKinds = ['imports', 'bundles', 'tauri-command', 'imports'];
  const edges: GuideEdge[] = [];
  for (let i = 0; i < 140; i += 1) {
    const s = all[Math.floor(rnd() * all.length)] as string;
    const t = all[Math.floor(rnd() * all.length)] as string;
    const kind = edgeKinds[Math.floor(rnd() * edgeKinds.length)] as string;
    edges.push({ id: `e${i}`, kind, sourceId: s, targetId: t, confidence: 'resolved' });
  }
  void leaves;
  return docText(nodes, edges);
}

describe('the partition law (I9)', () => {
  it('holds over hundreds of seeded pseudo-random expand/collapse sequences', () => {
    let checked = 0;

    for (let seed = 1; seed <= 12; seed += 1) {
      const loaded = importDoc(randomDoc(seed));
      const outline = new OwnershipOutline(loaded.model);
      assertInjective(outline, loaded.model);

      const every = allOutlineNodes(outline);
      const rnd = mulberry32(seed * 7919);
      const expanded = new Set<string>();

      for (let step = 0; step < 40; step += 1) {
        const pick = every[Math.floor(rnd() * every.length)] as string;
        if (expanded.has(pick)) expanded.delete(pick);
        else expanded.add(pick);

        const graph = project(loaded.model, outline, expanded);
        const violations = checkPartition(loaded.model, outline, graph);
        expect(violations, `seed ${seed} step ${step}: ${JSON.stringify(violations.slice(0, 3))}`).toEqual([]);

        // Cardinality, as a second, independent statement of the same law.
        const total =
          graph.visibleEdges.reduce((n, e) => n + e.sourceEdgeIds.length, 0) +
          graph.internalBuckets.reduce((n, b) => n + b.sourceEdgeIds.length, 0);
        expect(total).toBe(loaded.model.edges.length);
        checked += 1;
      }
    }

    expect(checked).toBe(12 * 40);
  });

  it('catches an id that is in A bucket but not the RIGHT one', () => {
    // Proving the checker is not vacuous: corrupt a projection and it must complain.
    const loaded = importDoc(randomDoc(3));
    const outline = new OwnershipOutline(loaded.model);
    const graph = project(loaded.model, outline, new Set(['root']));

    const first = graph.visibleEdges[0];
    const second = graph.visibleEdges[1];
    if (first === undefined || second === undefined) throw new Error('fixture needs two visible edges');

    // Move second's ids onto first: the TOTAL is still right, and a checker that
    // only summed counters would happily pass this. The placement check must not.
    const visibleEdges: VisibleEdge[] = [
      { ...first, sourceEdgeIds: [...first.sourceEdgeIds, ...second.sourceEdgeIds] },
      { ...second, sourceEdgeIds: [], count: 0 },
      ...graph.visibleEdges.slice(2),
    ];
    const corrupted: VisibleGraph = { ...graph, visibleEdges };
    const violations = checkPartition(loaded.model, outline, corrupted);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.kind === 'wrong-bucket' || v.kind === 'duplicate')).toBe(true);
  });
});

describe('filters are a MASK, not a re-projection (§6.5)', () => {
  it('applying any filter leaves NVA and the partition law unchanged', () => {
    const loaded = importDoc(randomDoc(5));
    const state = stateFromLoaded(loaded);
    const expanded = new Set(['root']);

    const graph = project(state.model, state.outline, expanded);
    const before = checkPartition(state.model, state.outline, graph);
    expect(before).toEqual([]);

    // Hide a node kind and an edge kind.
    const filtered = {
      ...state,
      view: { ...state.view, expanded },
      filters: {
        nodeKinds: new Set(['repository', 'package']),
        edgeKinds: new Set(['imports']),
        hideTests: true,
      },
    };
    const geometry = computeGeometry(state.model, state.outline, expanded, state.view.positions);
    const masked = buildScene(filtered, geometry, graph);

    // A filter never reaches projection: re-projecting the SAME expansion gives a
    // bit-for-bit identical NVA and an identical partition. Nothing is hidden from
    // the law by hiding it from the eye.
    const after = project(state.model, state.outline, expanded);
    expect([...after.nva.entries()]).toEqual([...graph.nva.entries()]);
    expect(after.visibleEdges).toEqual(graph.visibleEdges);
    expect(checkPartition(state.model, state.outline, after)).toEqual([]);
    expect(masked.hiddenByFilter.nodes + masked.hiddenByFilter.edges).toBeGreaterThan(0);
    // Hidden things are still IN the scene, flagged — so an edge can never name a
    // node the renderer does not have.
    const sceneNodeIds = new Set(masked.scene.nodes.map((n) => n.id));
    for (const e of masked.scene.edges) {
      expect(sceneNodeIds.has(e.sourceId)).toBe(true);
      expect(sceneNodeIds.has(e.targetId)).toBe(true);
    }
  });
});

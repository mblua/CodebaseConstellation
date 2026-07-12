// The FRONTIER (§5.4), and the coordinator's FIRST DISSENT.
//
// The same projection, the same aggregation and the same partition law run against a
// SECOND, fixture-only outline over the same entities. The frontier is therefore a
// passing test, not a paragraph.
//
// What is asserted here is what is TRUE of v1:
//
//   * an outline is INJECTIVE (I10), and `assertInjective` proves it rather than
//     assuming it;
//   * NO MEMBERSHIP IS LOST under either outline — the N:M `bundles` edges are all
//     still there, each exactly once, because a secondary membership stays an EDGE
//     rather than being faked as containment;
//   * no `sourceEdgeId` is duplicated under either outline.
//
// What is NOT asserted, because v1 cannot do it: that one unit appears under
// BOTH applications that bundle it. That needs multi-placement, which is named,
// specified, and deliberately not shipped.

import { describe, expect, it } from 'vitest';
import { importDoc } from '../../src/contract/load.ts';
import { OwnershipOutline, assertInjective } from '../../src/domain/outline.ts';
import { allOutlineNodes } from '../../src/domain/commands.ts';
import { checkPartition, project } from '../../src/projection/project.ts';
import { AppCentricOutline, nmDocText } from '../support/appCentricOutline.ts';
import { mulberry32 } from '../support/doc.ts';

describe('the N:M fixture — one app bundling a package AND a crate, one crate bundled by two apps', () => {
  const loaded = importDoc(nmDocText());

  it('is genuinely N:M', () => {
    const bundles = loaded.model.edges.filter((e) => e.kind === 'bundles');
    const byApp = new Map<string, string[]>();
    const byPkg = new Map<string, string[]>();
    for (const e of bundles) {
      byApp.set(e.sourceId, [...(byApp.get(e.sourceId) ?? []), e.targetId]);
      byPkg.set(e.targetId, [...(byPkg.get(e.targetId) ?? []), e.sourceId]);
    }
    expect(byApp.get('app-desktop')).toHaveLength(2); // one app, two units (a package and a crate)
    expect(byPkg.get('pkg-core')).toHaveLength(2); // one crate, two apps
  });

  it('both outlines are injective (I10) — NVA is undefined if an entity sits in two places', () => {
    const ownership = new OwnershipOutline(loaded.model);
    const appCentric = new AppCentricOutline(loaded.model);
    expect(() => assertInjective(ownership, loaded.model)).not.toThrow();
    expect(() => assertInjective(appCentric, loaded.model)).not.toThrow();
  });

  it('the app-centric outline really does re-parent the packages under the applications', () => {
    const appCentric = new AppCentricOutline(loaded.model);

    // pkg-core is bundled by BOTH apps. The primary placement is deterministic —
    // the lowest app id — so it lands under `app-cli`, not under the app you might
    // have guessed. Determinism beats intuition; the rule is stated and it is fixed.
    expect(appCentric.childrenOf('app-cli')).toEqual(['pkg-core']);
    // pkg-ui is bundled only by app-desktop, so it lands there.
    expect(appCentric.childrenOf('app-desktop')).toEqual(['pkg-ui']);

    // The membership containment could NOT express is recorded, not lost…
    expect(appCentric.secondaryMemberships).toEqual([{ app: 'app-desktop', pkg: 'pkg-core' }]);
  });

  it('NO MEMBERSHIP IS LOST: the secondary membership survives as an edge and is projected', () => {
    const appCentric = new AppCentricOutline(loaded.model);
    // Collapse everything except the root: app-cli and app-desktop are visible.
    const graph = project(loaded.model, appCentric, new Set(['repo']));

    const allBundleIds = graph.visibleEdges
      .concat()
      .filter((e) => e.kind === 'bundles')
      .flatMap((e) => [...e.sourceEdgeIds])
      .concat(
        graph.internalBuckets.filter((b) => b.kind === 'bundles').flatMap((b) => [...b.sourceEdgeIds]),
      )
      .sort();

    // b1, b2 (app-desktop → its package and its crate) and b3 (app-cli → pkg-core, the
    // membership that containment could not express). All three, exactly once.
    expect(allBundleIds).toEqual(['b1', 'b2', 'b3']);
  });

  it('the SAME partition law holds under BOTH outlines, over random expand/collapse', () => {
    const outlines = [new OwnershipOutline(loaded.model), new AppCentricOutline(loaded.model)];

    for (const outline of outlines) {
      const every = allOutlineNodes(outline);
      const rnd = mulberry32(4242);
      const expanded = new Set<string>();

      for (let step = 0; step < 60; step += 1) {
        const pick = every[Math.floor(rnd() * every.length)] as string;
        if (expanded.has(pick)) expanded.delete(pick);
        else expanded.add(pick);

        const graph = project(loaded.model, outline, expanded);
        expect(
          checkPartition(loaded.model, outline, graph),
          `${outline.id} step ${step}`,
        ).toEqual([]);

        // No sourceEdgeId is duplicated, under either outline.
        const ids = graph.visibleEdges
          .flatMap((e) => [...e.sourceEdgeIds])
          .concat(graph.internalBuckets.flatMap((b) => [...b.sourceEdgeIds]));
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.length).toBe(loaded.model.edges.length);
      }
    }
  });
});

describe('I10 is enforced, not assumed', () => {
  it('assertInjective REJECTS an outline that places one entity twice', () => {
    const loaded = importDoc(nmDocText());
    const broken = {
      id: 'broken',
      roots: () => ['repo'],
      childrenOf: (n: string) =>
        n === 'repo' ? ['app-desktop', 'app-cli'] : n === 'app-desktop' || n === 'app-cli' ? ['pkg-core'] : [],
      entityOf: (n: string) => n,
      placementOf: (e: string) => e,
    };
    expect(() => assertInjective(broken, loaded.model)).toThrow(/I10|reachable twice/);
  });
});

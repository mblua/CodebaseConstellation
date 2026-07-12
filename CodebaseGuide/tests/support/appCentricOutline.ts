// The SECOND outline (§5.4) — fixture-only, shipped with the test suite, never
// wired into the app. It exists so that the frontier between the ownership tree and
// a presentation outline is a PASSING TEST, not a paragraph.
//
// ── What this outline actually does, and what it does not ────────────────────
//
// It places every package under an APPLICATION that bundles it, rather than under
// the repository. Membership is genuinely N:M — one app bundles two units, one
// package is bundled by two apps — and an injective outline (I10) cannot put the
// same package under both apps.
//
// So it uses PRIMARY PLACEMENT: each package is placed under exactly one app,
// chosen deterministically (the lowest app id that bundles it). The OTHER
// memberships are not lost and are not faked as containment — they remain `bundles`
// EDGES, and they project through NVA like every other relation.
//
// The test therefore asserts what is TRUE — *no membership is lost, and no
// `sourceEdgeId` is duplicated, under either outline* — and does NOT assert the
// thing v1 cannot do, which is show one unit under two parents at once. That
// would need multi-placement, and v1 does not implement it.

import type { GuideEdge, NodeId } from '../../src/contract/types.ts';
import type { GraphModel } from '../../src/contract/model.ts';
import type { Outline, OutlineNodeId } from '../../src/domain/outline.ts';

export class AppCentricOutline implements Outline {
  readonly id = 'app-centric';

  private readonly rootIds: OutlineNodeId[] = [];
  private readonly children = new Map<OutlineNodeId, OutlineNodeId[]>();
  private readonly placement = new Map<NodeId, OutlineNodeId>();

  /** Packages placed under an app that is NOT their only bundler. Recorded so the
   *  test can assert the secondary memberships survive as edges. */
  readonly secondaryMemberships: { app: NodeId; pkg: NodeId }[] = [];

  constructor(model: GraphModel) {
    const apps = model.nodes.filter((n) => n.kind === 'application').map((n) => n.id).sort();
    // A UNIT of code is an npm `package` or a Rust `crate`. Both are bundled by
    // applications, and both are what an app-centric outline would want to re-parent.
    const units = model.nodes
      .filter((n) => n.kind === 'package' || n.kind === 'crate')
      .map((n) => n.id)
      .sort();
    const repo = model.nodes.find((n) => n.parentId === null);
    if (repo === undefined) throw new Error('the fixture needs a root');

    // Who bundles what.
    const bundlersOf = new Map<NodeId, NodeId[]>();
    for (const e of model.edges as readonly GuideEdge[]) {
      if (e.kind !== 'bundles') continue;
      const list = bundlersOf.get(e.targetId) ?? [];
      list.push(e.sourceId);
      bundlersOf.set(e.targetId, list);
    }

    this.rootIds.push(repo.id);
    this.placement.set(repo.id, repo.id);
    const repoChildren: OutlineNodeId[] = [...apps];
    for (const app of apps) {
      this.placement.set(app, app);
      this.children.set(app, []);
    }

    for (const unit of units) {
      const bundlers = (bundlersOf.get(unit) ?? []).slice().sort();
      const primary = bundlers[0];
      if (primary === undefined) {
        // Bundled by no application: it stays under the repository, so that every
        // entity is placed and NO edge is silently dropped as out of scope.
        repoChildren.push(unit);
        this.placement.set(unit, unit);
        continue;
      }
      (this.children.get(primary) as OutlineNodeId[]).push(unit);
      this.placement.set(unit, unit);
      for (const other of bundlers.slice(1)) {
        this.secondaryMemberships.push({ app: other, pkg: unit });
      }
    }

    // Everything below a unit keeps the ownership shape.
    for (const n of model.nodes) {
      if (
        n.kind === 'application' ||
        n.kind === 'package' ||
        n.kind === 'crate' ||
        n.parentId === null
      ) {
        continue;
      }
      this.placement.set(n.id, n.id);
      const siblings = this.children.get(n.parentId) ?? [];
      siblings.push(n.id);
      this.children.set(n.parentId, siblings);
    }

    this.children.set(repo.id, repoChildren);
    for (const [, list] of this.children) list.sort();
  }

  roots(): readonly OutlineNodeId[] {
    return this.rootIds;
  }

  childrenOf(n: OutlineNodeId): readonly OutlineNodeId[] {
    return this.children.get(n) ?? [];
  }

  entityOf(n: OutlineNodeId): NodeId {
    return n;
  }

  placementOf(e: NodeId): OutlineNodeId | null {
    return this.placement.get(e) ?? null;
  }
}

/**
 * The required N:M fixture (§5.4): ONE application bundling TWO UNITS — an npm `package`
 * and a Rust `crate` — and ONE UNIT bundled by TWO applications. That is the exact shape
 * verified in AgentsCommander: the Tauri app spans the root npm package and the
 * `src-tauri` crate, and the `session-bridge` crate ships two binaries.
 *
 * The fixture uses BOTH kinds on purpose. `crate` is a first-class kind (§16.10), and a
 * fixture that only knows about `package` would not notice if the outline, the
 * projection or the partition law started treating one of the two as invisible.
 */
export function nmDocText(): string {
  return JSON.stringify({
    formatVersion: '1.0',
    nodes: [
      { id: 'repo', kind: 'repository', label: 'repo', parentId: null, path: '' },
      { id: 'app-desktop', kind: 'application', label: 'desktop', parentId: 'repo' },
      { id: 'app-cli', kind: 'application', label: 'cli', parentId: 'repo' },
      { id: 'pkg-ui', kind: 'package', label: 'ui', parentId: 'repo', path: 'ui' },
      { id: 'pkg-core', kind: 'crate', label: 'core', parentId: 'repo', path: 'core' },
      { id: 'file-ui', kind: 'file', label: 'ui.ts', parentId: 'pkg-ui', path: 'ui/ui.ts' },
      { id: 'file-core', kind: 'file', label: 'core.rs', parentId: 'pkg-core', path: 'core/core.rs' },
    ],
    edges: [
      // One app bundling TWO units: an npm package and a Rust crate.
      { id: 'b1', kind: 'bundles', sourceId: 'app-desktop', targetId: 'pkg-ui', confidence: 'declared' },
      { id: 'b2', kind: 'bundles', sourceId: 'app-desktop', targetId: 'pkg-core', confidence: 'declared' },
      // One crate bundled by TWO apps — this is the membership an injective outline
      // cannot express as containment, and which therefore stays an edge.
      { id: 'b3', kind: 'bundles', sourceId: 'app-cli', targetId: 'pkg-core', confidence: 'declared' },
      { id: 'i1', kind: 'imports', sourceId: 'file-ui', targetId: 'file-core', confidence: 'resolved' },
    ],
  });
}

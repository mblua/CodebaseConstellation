# ADR 0002 — The v1 adapter is a hand-rolled Canvas 2D renderer

**Status.** Accepted, and shipped in v1.
**Context.** `docs/ARCHITECTURE.md` §8.2 and §13 step 4.

## What the architecture said

§8.2 corrected an earlier draft that had claimed Cytoscape's compound nodes would render
containers "for free" while the domain stayed authoritative for `position` and `size`. That
claim was false: a Cytoscape compound parent has **no independent position or dimensions** —
they are inferred from its descendants — and reparenting is not an ordinary `data` update.
Since expand/collapse reparents on every double-click, the port's central promise (the domain
owns geometry) would have been false in practice.

§8.2 therefore proposed **Cytoscape *without* compound nodes**, and framed it as a **gate, not
an assumption**: the adapter must pass the conformance suite *and* the browser smoke, "and if
it does not, it is replaced by a hand-rolled Canvas 2D adapter".

## The decision

**The gate was decided against Cytoscape, before writing it.** v1 ships
`src/adapters/canvas2d/Canvas2DRenderer.ts`.

The reasoning, stated plainly so it can be argued with:

* With compound nodes ruled out, what Cytoscape still sells is **canvas drawing, pan/zoom,
  hit-testing, event plumbing and edge routing**. Every one of those is something this product
  has to own anyway, because the domain owns geometry: positions and sizes are computed in
  `domain/layoutEngine.ts`, `layout: { name: 'preset' }` would be the only layout ever used,
  container drag is a domain command, and edge routing turned out to be a *contract* (see
  below) rather than a rendering detail.
* What is left after that is ~400 lines of Canvas 2D and **zero runtime dependencies** — which
  the architecture test now enforces as a hard invariant: `src/` has **no bare imports at all**.
  "The graphics library is a detail" is not a claim in this codebase; it is a fact, because
  there is no graphics library.
* The bundle carries no third-party graphics code, no third-party licence, and no upgrade
  treadmill, for a product whose whole point is to be a local, self-contained, auditable file.

**This is a deviation from §13's plan** — the spike was decided on its requirements rather than
run to failure. That is recorded here rather than quietly skipped, and the *exit criterion* was
honoured in full: the adapter had to pass the shared conformance suite and the browser smoke,
and it does.

## How the seam stays real

The decision is only defensible because swapping back is cheap, and that is enforced, not
promised:

* `src/ports/renderer.ts` contains **no graphics type**. Colours are hex strings, sizes are
  numbers, shapes are string literals.
* The architecture test fails the build if anything outside `adapters/` and a composition root
  imports an adapter, and if `src/` gains a bare import.
* `src/ports/renderer.conformance.ts` is **one shared suite with no test framework in it**, so
  the *same code* runs under vitest against `FakeRenderer` and inside a real browser against
  `Canvas2DRenderer`. Cases that need real input (one `dragend` per drag; click and dblclick
  disambiguated; hit-testing) are **reported as skipped** by `FakeRenderer` rather than faked,
  and the browser run asserts `skipped === 0` — a DOM adapter is not allowed to skip them.
* Adding a `CytoscapeRenderer.ts` later — or any other adapter — means: write the adapter, run
  the same suite against it, change one line in `src/main.ts`. Nothing in the contract, the
  domain or the projection moves. **Today the shipped adapter is `Canvas2DRenderer`, and it is
  what the conformance suite and every reference in `docs/ARCHITECTURE.md` now name.**

## What the browser gate actually proved

`npm run smoke:adapter` loads `conformance.html`, runs the shared suite against the real
adapter with **real** `PointerEvent`s, and fails on any failing case. It needs no dataset and
no UI, which is what makes it usable as an early gate — the third dissent's point.

It caught two real defects that no headless test could have:

1. **An expanded container swallowed clicks on the lines crossing it.** The aggregated
   `tauri-command` edge is drawn across the repository's background; with a naive
   node-before-edge hit test it was unselectable — i.e. the single most important click in the
   product did not work. An expanded container is now a *backdrop*: a line within tolerance
   wins over it, and never over a leaf or a collapsed box.
2. **Parallel relations were drawn on top of one another.** Four typed relations join the root
   npm package and the Tauri crate (`bundles`, `imports`, `tauri-command`, `web-command`).
   §6.3 insists they must stay distinct facts — but keeping them distinct in the model and
   coincident on screen tells the same lie in pixels. **Edge routing therefore moved into the
   port** (`routeEdges`, `EDGE_FAN_SPACING`): every adapter fans them out identically, each is
   individually visible and individually clickable, and a *test* can compute where a line is
   without duplicating an adapter's internals.

Both are now cases in the shared conformance suite, so any future adapter inherits them.

## Consequences

* The renderer decision is settled by **evidence**, and the evidence is a test that runs on
  every `npm run verify`.
* Edge routing became part of the port. That is a real expansion of the contract's surface —
  and the right one: *where a relation is drawn* is domain geometry, not decoration.
* If a future need (very large graphs, WebGL, a layered layout) argues for a library, the seam
  is ready and the conformance suite is the acceptance test.

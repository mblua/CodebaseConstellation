# ADR 0001 — An outline places each entity once, and the other memberships stay edges

**Status.** Accepted, and shipped in v1.
**Context.** `docs/ARCHITECTURE.md` §5.4, and the first of the three dissents recorded against
the 2–1 architecture vote.

## The problem

Architecture §5.4 introduces an `Outline` port and states that projection consumes it rather
than `parentId`. The port is:

```ts
placementOf(e: NodeId): OutlineNodeId | null;   // "Injective in v1 (I10)"
```

and §5.4 then says the test suite ships an `AppCentricOutline` "that places packages under the
applications that bundle them".

**Those two sentences cannot both be true.** Membership is genuinely N:M, and this repository
is what proves it:

* the Tauri desktop app **spans two units of code** — the `src-tauri` **crate** and the root
  **npm package** whose Vite output it embeds;
* `crates/session-bridge` **ships two binaries** — two applications, one crate.

An injective `placementOf` returns *one* placement. It cannot put `pkg-core` under both
`app-desktop` and `app-cli`. Writing a fixture that claims it does would be writing a test
that cannot pass, or — worse — one that passes because it never checked.

## The decision

**v1 uses primary placement, and says so.**

* An outline places every entity **exactly once**, under a **deterministically chosen** primary
  parent. `AppCentricOutline` chooses the lowest application id among the applications that
  bundle the package. Determinism beats intuition: the rule is fixed and stated, so the answer
  never depends on iteration order.
* The **other memberships are neither discarded nor faked as containment.** They remain
  `bundles` **edges** — and an edge is a first-class citizen here. It projects through NVA, it
  aggregates, it carries its evidence, and it is subject to the partition law like everything
  else.
* **I10 is enforced, not assumed.** `assertInjective(outline, model)` walks the outline and
  throws if an entity is reachable at two placements, if the outline is not a tree, or if
  `placementOf` disagrees with where the walk found the entity. Both the shipped
  `OwnershipOutline` and the fixture `AppCentricOutline` are run through it, and
  `tests/outline/outline.test.ts` proves the checker rejects a deliberately broken outline.

## What the test therefore proves — and what it does not

It proves **no membership is lost**: under both outlines, over random expand/collapse
sequences, the `bundles` edge ids `b1`, `b2`, `b3` — including `b3`, the app-cli → pkg-core
membership that containment could not express — appear in the partition **exactly once each**,
and no `sourceEdgeId` is duplicated.

It does **not** prove that a package appears under every application that bundles it. That
needs multi-placement, and **v1 does not implement it**. Claiming otherwise in a fixture would
be exactly the kind of thing this whole product exists to stop.

## What would have to change to relax I10

Written down so that arriving there is a decision, not an accident:

1. `placementOf(e): OutlineNodeId | null` becomes `placementsOf(e): readonly OutlineNodeId[]`.
2. The partition law (I9) generalises from `logicalEdgeId` to
   `(logicalEdgeId × placementPair)`, and the contract must declare an explicit fan-out
   policy — `all-pairs` or `primary-placement`.
3. `ViewState.positions` becomes keyed by `OutlineNodeId` rather than `NodeId`. Today they
   coincide, which is precisely what lets a stored position survive a hierarchy switch (§5.2).
4. `GuideDoc.outlines` — reserved, unused in v1 — carries the declared outlines, and a reader
   that does not implement them must declare that through `requires[]` and open read-only.

The note lives in code, at `src/domain/outline.ts`, next to the port it constrains.

## Consequences

* The app-centric view a future reader might want is **not free**, and the architecture no
  longer implies that it is.
* The ownership tree stays the single factual, canonical placement. Nothing about the shipped
  product changes.
* An honest limit is recorded in the README and in §15 rather than discovered later by someone
  who trusted a paragraph.

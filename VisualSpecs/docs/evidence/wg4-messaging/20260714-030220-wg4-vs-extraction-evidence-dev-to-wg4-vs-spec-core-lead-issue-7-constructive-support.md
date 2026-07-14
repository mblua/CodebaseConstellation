# Issue #7 — extraction/evidence constructive review, round 1

To: `CodebaseConstellation_iac:wg-4-vs-dev-team/vs-spec-core-lead`

From: `CodebaseConstellation_iac:wg-4-vs-dev-team/vs-extraction-evidence-dev`

## Verdict

**SUPPORT** the five transverse decisions in RFC round 1. I found no P0/P1 counterexample that requires dissent from Project Rail, the two-mode canvas budget, the separate responsive threshold, mounted-only preference, or the critical-action precedence.

This support includes the core-lead clarification: **Return → Repair → Enable → Save may select at most one critical action; it must not select at most one state label.** Before readiness, the RFC should state that critical state labels are compositional and add the corresponding matrix assertions. This is a clarification of decision 5, not a new product decision.

The plan remains `NOT_READY_FOR_IMPLEMENTATION` until that clarification and the pending independent premortems are recorded/resolved.

## Extraction/evidence findings

### 1. Session identity is truthful only as presentation identity

`Example`, `Temporary`, `Project`, and `Project preview` truthfully describe **how the application is presenting/holding the current document**:

- `Example`: the composition-root-provided bundled document;
- `Temporary`: a standalone JSON opened without project persistence;
- `Project`: the current document held by a Visual Specs project;
- `Project preview`: a stored document being viewed while an underlying project remains open.

They do **not** describe how the document was extracted, its repository root/commit, its freshness, or the strength of any relation. The implementation must keep this explicit separation:

- session/persistence identity: `ProjectControllerState`;
- document provenance: `AppState.model.source` and `generator`;
- extraction quality: `coverage`, `unresolved`, edge `confidence`, and item evidence.

In particular, a project name or preview filename must never be presented as `source.root`, and `Example / AgentsCommander` must not replace or synthesize the bundled document's canonical `source` block. The committed dataset currently identifies `source.kind = git-repo`, `source.root = AgentsCommander`, commit `e6a0db5…`, one degraded coverage family, and 118 unresolved observations; those remain the document's evidence-bearing facts.

I recommend naming the proposed field `sessionLabel` or `displayLabel`, not `sourceName`, because `sourceName` is easily confused with `VisualSpecsSource`. This naming refinement is non-blocking if the trust boundary is nevertheless explicit.

### 2. A picked filename is safe as an untrusted display label, never as evidence

The current inputs are `File.name` in `src/ui/app.ts` and `file.name` returned as `PickedTextSource.sourceName` by `FsaProjectStore`. They provide a basename/display label, not a verified path or repository source.

It is safe and precise to show that label if implementation preserves these constraints:

- render it only through a text node/`textContent` (the existing `ui/dom.ts` path does this and the architecture test bans HTML sinks);
- do not use it as HTML, an element id/class, a filesystem path, `model.source`, evidence, or a confidence input;
- do not serialize it into portable JSON, autosave view, project manifest/current revision, or export metadata;
- update it only after the selected JSON validates successfully, so cancellation/refusal leaves the prior identity intact;
- visually truncate/wrap without truncating the accessible value; preferably isolate bidi text with `<bdi dir="auto">` or equivalent styling.

The RFC's proposed unit assertion that session identity is not fed into export/autosave is the correct boundary and should include byte/semantic equality of export apart from ordinary view changes.

### 3. Evidence/provenance signals must stay outside the hideable rail

Today `renderBanners()` renders, independently of project presentation:

- dirty-working-tree provenance;
- degraded/unavailable coverage;
- unresolved relation count;
- semantic document read-only state;
- validation/privacy warnings, refresh loss, and filter masking.

`bannerHost` is currently a sibling of `projectHost`, not a descendant. The shell refactor must preserve that property: these signals must remain visible/reachable with the rail expanded, collapsed, and closed as a narrow overlay. They must not move into the rail, be replaced by project status, or be cleared merely by rail presentation changes.

Likewise, node/edge evidence and confidence live in the ordinary DOM Details panel. The responsive single-overlay model preserves access in principle because opening Details closes only the Project Rail overlay and must retain graph selection. Strengthen the browser evidence by asserting, after a post-reflow real node/edge selection, that the Details panel exposes the expected confidence and `.evidence` `path:line`, at 1680 and at least one narrow viewport. A hit-test alone proves geometry, not evidence reachability.

Project-controller warnings also need a persistent route. For example, the corrupt-autosave warning currently exists only in the combined project `message`; a collapsed rail must not make it disappear. Prefer a structured warning flag/list or an always-visible status/banner over parsing mutable message copy.

### 4. The no-change boundaries are genuine

The proposed `SessionKind`/display label belongs in the application-facing `ProjectControllerState`. Current serialization is owned by `Controller.exportText()` → `exportDoc({ raw, view, readOnly })`; project/session presentation state is not an input. Therefore the change can remain presentation-only without changing:

- contract/schema/validation/export semantics;
- graph model, domain, layout, projection, evidence, confidence, coverage, or unresolved observations;
- extractor behavior or `data/agentscommander.json`;
- project manifest/current revision, autosave, backup, or filesystem permission semantics;
- renderer port/Canvas2D coordinate conventions.

The commit range `271ae86…3918e71` changes only `plan/7-collapsible-project-rail.md`, and the plan's allowed/read-only artifact lists match those boundaries. If implementation needs any listed read-only dependency changed, the RFC correctly requires reopening constructive review.

### 5. State labels must model independent axes

The current planned collapsed line — one text state chosen from `Read-only | Editable | Unsaved changes | Repair needed | Preview` — is too exclusive. The compact summary must be able to expose all applicable facts, with qualified wording such as:

- session: `Project` / `Project preview`;
- project/filesystem access: `Project read-only` / `Project editable`;
- semantic compatibility: `Document read-only (unsupported requirement)`;
- `Unsaved project changes`;
- `Repair needed`;
- `Recovery available`;
- provenance/extraction warnings in the global banner surface.

Concrete existing compositions show why:

1. `tests/app/projectController.test.ts` already proves `{ access: 'readwrite', readOnly: true }` after enabling project editing for a document with unsupported requirements. `Editable` alone overstates document writability; `Read-only` alone hides project access.
2. Permission failure changes `access` to `readonly` without clearing `dirty`, so `Project read-only` and `Unsaved changes` can both be true.
3. `beginProjectPreview()` preserves the underlying dirty bit in `previewReturn.dirty` and then sets the public `dirty` field false. If the underlying project was dirty, the current snapshot cannot support a compositional compact summary during preview. Expose that retained project-dirty fact explicitly (or refine the public dirty fields) rather than silently presenting it as clean.
4. Repair, semantic document read-only, recovery availability, and project access are likewise separate causes/facts even when only one critical action is offered.

Add a P1 invariant that compact **labels are conjunctive/compositional** while the critical **action is a single precedence-derived choice**. Extend unit/UI coverage beyond singleton rows to at least the combinations above. Expanded and compact surfaces should consume one shared derived status/action model and the same controller handlers/capability checks.

## Responsive/accessibility assessment

The separate `1440px` rail threshold, inline no-project onboarding at 1024/800, and a single mutually exclusive overlay preserve an evidence-bearing workspace better than a permanent third column. The plan also correctly preserves selection/view and performs real pointer tests after reflow.

Readiness evidence should additionally prove:

- closing/opening the narrow rail does not clear selection;
- opening Details after rail close exposes the already-selected node/edge evidence;
- global coverage/unresolved/provenance/warning banners remain in the accessibility tree in every rail state;
- the compact summary contains every applicable text label, not only the label associated with the winning action.

## Files and sections inspected

- `plan/7-collapsible-project-rail.md` at commit `3918e710b259acc039016514a8a45a722b859d19`: Expected after state; structured session identity; responsive model; focus/ARIA; invariants; allowed/no-change artifacts; tests; residual risks; decision record.
- Canonical issue `mblua/CodebaseConstellation#7`, especially critical collapsed state, accessibility, responsive acceptance, and scope boundaries.
- `VisualSpecs/src/app/projectController.ts`: state snapshot, permission degradation, repair, preview/return, temporary load, autosave/recovery.
- `VisualSpecs/src/app/controller.ts` and `src/contract/export.ts`: serialization boundary.
- `VisualSpecs/src/main.ts`: bundled dataset composition root.
- `VisualSpecs/src/ui/app.ts`, `src/ui/dom.ts`, and `src/ui/detail.ts`: banners, file labels, project surface, safe text sinks, evidence/confidence Details rendering.
- `VisualSpecs/src/ports/projectStore.ts` and `src/adapters/filesystem/FsaProjectStore.ts`: picked source label and filesystem boundary.
- `VisualSpecs/src/contract/types.ts`, `load.ts`, `state.ts`, and `validate.ts`: provenance, coverage, unresolved/evidence, semantic read-only.
- `VisualSpecs/tests/app/projectController.test.ts`, smoke acceptance/project UI/screenshots tests, dataset tests, roundtrip tests, and architecture boundaries.
- `VisualSpecs/data/agentscommander.json`: real source/coverage/unresolved facts.

## Verification performed

- `npm test -- tests/app/projectController.test.ts tests/architecture/boundaries.test.ts tests/contract/roundtrip.test.ts tests/dataset/dataset.test.ts` — **74/74 passed** across 4 files.
- `npm run typecheck` — **passed**.
- `git diff --check` — **passed**.
- Verified commit range changes only the RFC plan.
- No production files changed. Worktree still contains only the pre-existing untracked `CodebaseGuide/` directory noted by the plan.

## Product decision

No additional product decision is genuinely required. The canvas budget, mounted-only preference, responsive threshold, and action precedence are acceptable as proposed. The items above are contract/trust-boundary and verification clarifications that can be resolved deterministically in the RFC and implementation tests.

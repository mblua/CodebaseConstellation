# Issue #7 — Project Rail RFC/plan complete

The round-1 shared RFC/implementation plan is complete. No production UI/runtime code was implemented.

## Artifact

- Path: `plan/7-collapsible-project-rail.md`
- Branch: `feature/7-collapsible-project-rail`
- Commit: `3918e710b259acc039016514a8a45a722b859d19` (`docs(visual-specs): plan collapsible project rail (#7)`)
- Files changed: only `plan/7-collapsible-project-rail.md` (487 inserted lines)
- Readiness recorded in the plan: `NOT_READY_FOR_IMPLEMENTATION`, pending constructive validation and both independent premortems.

The pre-existing untracked `CodebaseGuide/` cache was preserved untouched and was not staged.

## Key decisions and tradeoffs proposed for constructive review

1. Keep Project Rail and graph Explorer as separate named regions with independent desktop preferences; only their narrow overlay presentations are mutually exclusive.
2. Keep rail preference as mounted UI state and reset expanded after reload. Do not write it into view/project/document/autosave/IndexedDB/localStorage; `sessionStorage` is explicitly deferred.
3. Add structured application-presentation session identity (`example | temporary | project | project-preview`) to `ProjectControllerState`, initialized for the bundled AgentsCommander example. It does not enter contract, schema, domain, projection, extractor output, or persisted JSON.
4. Preserve viewport values, selection, expansion, pinned/dragged positions, filters, and dirty state exactly across collapse/reopen. The UI performs DOM reflow, then calls the existing `controller.resize()` on the next animation frame; Canvas2D's existing `ResizeObserver` remains defense in depth. No renderer-port or adapter change is planned.
5. Start with no width animation, avoiding backing-size/pointer races and unmeasured redraw work.
6. Proposed 1680x1000 budget: unobscured canvas `>=800px` with the selected rail expanded and `>900px` after collapse. This explicitly accepts the prototype-B width tradeoff instead of automatically undocking Details.
7. Proposed responsive model: rail docking threshold near 1440px; no-project onboarding inline at 1024x768 and 800x800; selected-project rail becomes one mutually exclusive edge overlay there.
8. Collapsed critical-action precedence: Return, Repair, Enable editing, then Save; recovery is indicated compactly and its choices remain in the reopened rail.
9. Focus/ARIA contract requires native toggles with `aria-controls`/`aria-expanded`, hidden rail descendants removed from focus/a11y tree, deterministic focus transfer on collapse/reopen/Escape, full accessible project identity, and text state rather than color/icon-only meaning.

Items 3, 6, 7, 2, and 8 are recorded as transverse decisions requiring explicit constructive 2-of-3 support.

## Coverage and no-change boundaries

The plan covers before/requested/after states; exact owned files; UI-state lifetime; focus and ARIA; renderer resize sequencing; state-preservation invariants; responsive behavior at 1680x1000, 1024x768, and 800x800; focused unit/browser tests; Playwright and visual evidence; timing/width measurements; rollback; and residual risks.

It explicitly excludes changes to portable contracts/schema, canonical domain/model/layout/projection/evidence semantics, renderer-port shape, Canvas2D coordinate convention, filesystem adapter/permissions/conflict/backup/repair protocol, extractor/dataset, and persisted formats.

## Verification

- Inspected the current UI composition, `ProjectControllerState`, controller/renderer resize path, Canvas2D host observer and pointer mapping, project tests, responsive acceptance tests, and repository plan conventions.
- `git diff --check`: passed before staging and after commit.
- Cached diff check before commit: passed.
- Commit scope verified with `git diff-tree`: one added plan file only.
- Final `git status -sb`: branch clean for tracked files; only the preserved `?? CodebaseGuide/` remains.
- No unit, Playwright, build, or screenshot suite was run because this commit is Markdown-only and production implementation is deliberately gated.
- The previously requested persistent Visual Specs dev server had exited independently; I restored it at `http://127.0.0.1:5175/` and verified HTTP 200 (PID 18408). It was not used to claim RFC verification.

## Gates / blockers

No unresolved question requires additional product input before RFC review. Production implementation remains intentionally blocked until:

1. a second constructive owner explicitly supports the transverse decisions (or blocking counterexamples are resolved); and
2. semantic and resilience premortems report no unresolved P0/P1 finding.

Please treat this artifact as round-1 material for those reviews, not as implementation-ready approval.

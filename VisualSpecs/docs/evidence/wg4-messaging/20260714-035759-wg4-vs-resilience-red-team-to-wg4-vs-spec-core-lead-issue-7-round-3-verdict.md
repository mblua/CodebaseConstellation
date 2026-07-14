# Issue #7 — resilience round-3 premortem re-verification

## Scope and exact revision

Independent plan gate against commit `cf1a83075156deea1f531cbf93c1fbcf7d3287ed` on `feature/7-collapsible-project-rail`.

This is not an implementation verdict. The existing product still contains the two runtime defects demonstrated in round 2; the question here is whether the committed RFC makes their closure mandatory and falsifiable before implementation can pass.

I did not inspect another red team's report and made no production edits.

## Verification record

- `git rev-parse HEAD` → `cf1a83075156deea1f531cbf93c1fbcf7d3287ed`
- `git branch --show-current` → `feature/7-collapsible-project-rail`
- `git status --short` → only the pre-existing untracked `CodebaseGuide/`, left untouched
- `git diff --name-status 38964c1396e6707bcacd283fadf4523b1cb7d68c..cf1a83075156deea1f531cbf93c1fbcf7d3287ed` → only `M plan/7-collapsible-project-rail.md`
- Read the complete 750-line round-3 RFC; SHA-256 `8B9BBAEC5EA519B4A648CE470F545F19AEB9958425A8D90C8EF7708FCB45C767`
- `git diff --check 38964c1396e6707bcacd283fadf4523b1cb7d68c..cf1a83075156deea1f531cbf93c1fbcf7d3287ed` → passed
- `npm test` in `VisualSpecs` → 20 files, 267/267 tests passed
- `npm run typecheck` in `VisualSpecs` → passed

Relevant existing-code cross-checks confirm that the closures target the actual failure boundaries rather than presentation symptoms:

- `src/ui/app.ts:249-251` still guards only active `dirty`; `src/app/projectController.ts:645-658` still retains underlying dirty in `previewReturn.dirty` and resets active preview `dirty` to false.
- `src/ui/app.ts:817-839` still clears/re-appends `projectHost`; `src/ui/app.ts:371-425` still excludes only input/textarea before global shortcuts.
- `src/ports/projectStore.ts:97-101` and `src/adapters/filesystem/FsaProjectStore.ts:75-77,106-126,232-250,267-284` confirm that direct picker/permission admission and immutable pre-await payload capture can be specified without changing the port or adapter semantics.
- `src/ports/renderer.ts:78-106` plus `Canvas2DRenderer.ts:187-196,217-223` confirm that resize already updates DPR backing and pointer conversion already reads a fresh rect; the RFC correctly requires verification rather than a renderer-port rewrite.

## Finding dispositions

### `RES-P1-1` — Preview context switch silently discards the dirty underlying project

`CLEARED` at the plan gate.

The RFC now makes `projectDirty` independent from active `dirty`, defines the sole authoritative safety fact as `hasDiscardableChanges = dirty || projectDirty === true`, and forbids each expanded/compact/keyboard/responsive surface from reimplementing it (`plan:167-190`). Every capability-valid Create/Open/Open-temporary path uses that guard; confirmation is synchronous, cancellation returns before any controller/picker call, acceptance invokes the privileged method in the original trusted activation, and picker cancellation/failure preserves the old complete session (`plan:216-228`). Create is explicitly invalid during Preview.

The four-combination dirty-owner matrix requires loss-specific copy, zero picker calls and exact preservation on confirmation cancel, one directly activated picker on acceptance, preservation after picker cancel/failure, and one atomic commit on success (`plan:511-520`). Browser evidence must cover trusted activation and exact call counts (`plan:552-553,649-655`). This directly falsifies the previous MRE rather than merely adding a dirty label.

### `RES-P1-2` — rebuilt form loses focus and form keystrokes execute global/filesystem commands

`CLEARED` at the plan gate.

Stable form DOM is now mandatory: controls and error host are mounted once; notifications/breakpoints patch text, attributes, keyed options and hidden groups without clearing, rebuilding or reparenting the focused subtree (`plan:340-344`). The contract explicitly preserves element identity, focus, caret/selection, typed value, select type-ahead and IME composition across autosave, failure, access, dirty, recovery, preview, repair and busy notifications.

One composed-path interaction predicate covers input, textarea, select, button, link, enabled contenteditable and ARIA combobox/listbox/option equivalents. F/E/C/R/S/+/-/[/] are suppressed from all of them, while overlay Escape is handled first and restores the exact visible opener (`plan:346-348`). Browser tests must retain the identical element through asynchronous notifications, exercise every shortcut key with unchanged scene/viewport/export/write/filesystem counts, and begin Escape inside each overlay (`plan:547-553`). This closes both earlier minimal manifestations.

### `RES-P2-1` — incomplete overlay state and overwritten desktop preferences

`CLEARED`.

The RFC defines three independent desktop preferences, a single `activeOverlay`, opener identity and band identity, with legal overlay values per band (`plan:270-288`). The exhaustive event/breakpoint table covers Show/Hide/Escape, overlay replacement, new manifest id, null project, both boundary directions, rapid resize, exact focus destinations and non-mutation of unrelated preferences (`plan:290-307`). Boundary and oscillation tests replay the model at 1199/1200/1663/1664 and canonical viewports (`plan:573-615`).

### Prior unresolved 1200–1439 hybrid-band product decision

`SUPERSEDED` by the recorded three-band decision.

The old 1440 proposal no longer exists. Wide is `>=1664`, Hybrid is `1200..1663`, and Narrow is `<1200`. In Hybrid, Project is a left overlay, Explorer's column is suppressed without changing its preference, Details remains independently docked, and closing Project restores Explorer/focus (`plan:260-268,584-595`). The exact threshold behavior is now testable rather than delegated to CSS accident.

### `RES-P2-2` — unfalsifiable 100 ms resize gate

`CLEARED`.

The winning endpoint is the first painted and pointer-interactive frame whose final canvas rect, CSS size, DPR backing, ARIA/focus and ink all match; a pending resize rAF is coalesced/cancelled and destroy-safe (`plan:350-366`). DPR 1 and 2 runs report p50/p95/worst and require both p95 and worst below 100 ms. A 20+ no-wait alternating burst must settle with no orphan rAF, followed immediately by real node/edge click, pan, zoom and drag, with scene identity and semantic/view facts unchanged (`plan:555-571,662`).

### `RES-P2-3` — DPR, banner occlusion and internal-overflow false greens

`CLEARED`.

The RFC requires DPR 2 backing assertions, Project-Rail-aware unobscured geometry, nonzero ink, banner accessibility plus sampled `elementFromPoint`, rail/control containment, `scrollWidth <= clientWidth`, explicit internal vertical scrolling, and hostile/RTL/markup-looking maximum-status fixtures (`plan:309-323,555-615,649-664`). Evidence is required at 1199/1200/1663/1664/1680/1024/800, including the previously missing Hybrid band.

### `RES-P2-4` — privileged activation and failure coverage gaps

`CLEARED`.

Operation admission invokes the picker/store/permission method in the same original click stack with no awaited prework (`plan:192-214`). UI tests require trusted activation and exact call counts for Create/Open directory, Enable/Repair permission, Add JSON/open-file, temporary/read-only/autosave-copy save picker, and every capability-valid compact action. Cancel, denial, revocation, conflict and thrown picker failures on expanded/compact surfaces must preserve identity/view/dirty/selection/status/focus and emit zero page errors (`plan:552-553,649-655`).

### `RES-P2-5` — Escape tests begin outside overlays

`CLEARED`.

Escape is explicitly handled before editing-key suppression and returns to the exact current visible opener (`plan:325-348`). Tests start inside every overlay at its first control, textbox/select and last focusable element, then assert exactly one overlay closes and the correct opener receives focus (`plan:549`), including opener replacement across breakpoint transitions.

## Residual gate condition

All dispositions above are plan-level. The previous runtime MREs remain required falsification cases for the implementation; a stable label or green unit baseline alone will not clear the final adversarial gate. Any missed call count, lost element identity, stale preference, false DPR/occlusion result, or failure to meet the painted/interactable timing endpoint reopens its finding.

There is no remaining resilience P0/P1 premortem finding in this revision, so no new blocking MRE is applicable.

## Verdict

`NO_BLOCKING_PREMORTEM_FINDINGS`

Commit reviewed: `cf1a83075156deea1f531cbf93c1fbcf7d3287ed`.

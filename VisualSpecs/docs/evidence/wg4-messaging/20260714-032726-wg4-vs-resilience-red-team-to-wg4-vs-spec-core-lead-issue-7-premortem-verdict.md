# Issue #7 — resilience / operational / cognitive premortem

## Initial verdict

`BLOCKING_PREMORTEM_FINDINGS`

The frozen round-2 plan is **not ready for production implementation**. I found two reproducible P1 safety failures that the selected rail would carry forward unless the plan is amended. Neither is a visual preference.

I did not seek, read, or adopt the semantic red team's report. This verdict is independent.

## Baseline and inspected artifacts

- Branch: `feature/7-collapsible-project-rail`
- HEAD and frozen commit: `38964c1396e6707bcacd283fadf4523b1cb7d68c`
- `git diff 38964c1..HEAD`: empty
- Tracked worktree: clean; pre-existing untracked `CodebaseGuide/` left untouched
- Read completely: `plan/7-collapsible-project-rail.md` (565 lines)
- Canonical issue: <https://github.com/mblua/CodebaseConstellation/issues/7>
- Inspected: `VisualSpecs/src/ui/app.ts`, `src/styles.css`, `src/app/projectController.ts`, `src/app/controller.ts`, `src/adapters/canvas2d/Canvas2DRenderer.ts`, `tests/smoke/projectUi.spec.ts`, `tests/smoke/acceptance.spec.ts`, and `playwright.config.ts`
- Live probes: fresh Chromium/OPFS contexts against `http://127.0.0.1:5175/` at 1680×1000, 1024×768, and 800×800; DPR 1 and 2 where noted
- Read-only regression baseline: `npm test` = 267/267 passed; `npm run typecheck` passed
- No production edits made

## Blocking P1-1 — a context switch from Preview silently discards the dirty underlying project

### Minimal reproducible case

1. In a fresh FSA/OPFS context, create an editable project.
2. `Export JSON` once and refresh export copies so there is a clean copy to preview.
3. Click `Zoom in`, creating an unsaved project-view change.
4. Immediately click `Open export copy`, before the 350 ms autosave can commit. The active preview is clean but `previewReturn.dirty` is true.
5. From Preview, click enabled `Open Project` and select the same project.

### Evidence

- Clean viewport: `{x:-52.179775, y:-187.167416, zoom:1.149870801}`
- Dirty underlying viewport after Zoom: `{x:35.656180, y:-121.507865, zoom:1.437338501}`
- Preview viewport: the clean viewport
- `Return to project` was visible and `Open Project` was enabled
- Confirm dialogs observed: `[]`
- Directory picker calls: `2`; trusted activation was `true` for both
- After Open, viewport reverted to the clean value; the dirty value and Return path were gone
- Page/console errors: none

The loss is silent, not a crash. The pending autosave callback returns once Preview is active, so this run leaves no compatible recovery artifact.

### Why it happens

- `src/ui/app.ts:249-251` gates context switches only on `currentProjectState.dirty`.
- `src/app/projectController.ts:645-658` stores the underlying dirty value in `previewReturn`, then deliberately sets active `dirty = false` for the preview.
- `src/app/projectController.ts:661-675` clears `project`, `previewReturn`, and dirty when entering a temporary context; Open likewise replaces the project session.
- The frozen plan correctly proposes `projectDirty = previewReturn?.dirty ?? dirty`, but uses it only as presentation/status state. It explicitly retains context-switch actions and the “existing dirty confirmation”. That leaves the loss path intact.

### Violated invariant / approved criterion

- Prevention of data loss and safe context switching.
- Plan `Context changes`: cancellation/failure must leave presentation unchanged and a dirty project must not appear clean during Preview.
- Plan/issue promise that existing dirty guards and filesystem behavior remain safe while secondary Create/Open/Open-temporary actions stay reachable.

### Impact and severity

Unsaved expansion/layout/viewport work in the real project can be irreversibly discarded from Preview with no warning and no error. **P1 blocking.**

### Required plan change

1. Make destructive context switching consume the underlying dirty fact, not only active-preview dirty. The guard needs an explicit structured predicate equivalent to `dirty || projectDirty === true`.
2. In Preview, confirmation copy must name that the underlying project's unsaved view will be discarded.
3. Cover `Open Project`, `Open JSON temporarily`, and every Create path that is capability-valid in Preview.
4. On cancel: do not invoke a picker; preserve Preview, `previewReturn`, project identity, view, rail preference/focus, and all dirty facts.
5. On accept: invoke the picker directly within the same trusted activation task. Existing synchronous `confirm()` can preserve this; prove it with the harness.
6. Add both application-state and real UI/FSA tests. A presentation label alone is not the fix.

No product decision is required: the approved safety intent already chooses preservation/explicit discard.

## Blocking P1-2 — project-form focus is not stable, and subsequent text becomes global commands/filesystem writes

This has two independent minimal manifestations in the exact UI code the rail will refactor.

### MRE A — background autosave notification ejects focus mid-rename

1. Create an editable project.
2. Click `Zoom in` so an autosave is scheduled for 350 ms.
3. Focus `Project name` and type `Draft cognitive rename`.
4. Wait 700 ms for `Autosaved view.`.
5. Continue typing the next character `c`.

Evidence:

- Before autosave: active element = `Project name`; Drawn = 14.
- After autosave notification: active element = `BODY`; the partial value remains but the caret/focus is gone.
- Typing `c` then executes the global Collapse command: Drawn changes 14 → 0 and Folded away 1419 → 1609.
- No page error warns the user.

Cause: `src/ui/app.ts:817-839` clears and reconstructs the project host on every project notification. `flushAutosave()` emits such a notification at `projectController.ts:717-719`. The frozen plan only says stable elements are “preferred”; that is insufficient for a P1 focus invariant.

### MRE B — normal select type-ahead invokes `S` and writes a real export

1. Create a project, export once, refresh exports, and focus the enabled `Project export copies` `<select>`.
2. Press lowercase `s`, a normal select/type-ahead key.

Evidence:

- Export files before: 1.
- Export files after pressing `s`: 2.
- UI message: `Exported ... Select-Shortcut-2.json to .visual-specs/exports.`
- Focus then falls to `BODY` because the export notification reconstructs the controls.

Cause: `src/ui/app.ts:371-425` suppresses shortcuts for `input` and `textarea`, but not `select`, `contenteditable`, combobox-like controls, or a focus that has just been lost. `S` therefore executes `doExport()` from inside a project form.

A related baseline probe at 800×800 shows the same handler shape is unsafe for Escape: with focus in Explorer search, Escape does not close the overlay because the input early-return runs first; with focus in an inner option, closing can fall back to `BODY` rather than the opener.

### Violated invariant / approved criterion

- Plan P1: collapse/reopen and responsive transitions never lose focus; hidden controls are absent from focus.
- Focus/ARIA contract: Escape closes an overlay and returns to its opener; project context remains keyboard safe.
- Existing toolbar shortcuts must remain intact without consuming form input.
- Filesystem actions require an intentional activation, not an ordinary character used inside a select.

### Impact and severity

A user editing a project identity can be interrupted by an asynchronous status update; subsequent text silently mutates graph state. A user operating a selector can create filesystem exports by typing. This is an operational integrity failure in a critical form, not cosmetic focus polish. **P1 blocking.**

### Required plan change

1. Upgrade stable Project Rail DOM from “preferred” to **mandatory**. Mount form controls once and patch state/conditional groups without removing the active control. Do not `clear()` and re-append a focused subtree on controller/project notifications.
2. Preserve element identity, focus, selection range, typed value, and IME composition through autosave success/failure, permission changes, dirty updates, recovery/repair/preview updates, and breakpoint recomputation.
3. Define one editing-target predicate covering `input`, `textarea`, `select`, `contenteditable`, and combobox equivalents. Suppress F/E/C/R/S/+/-/[/] commands from those targets.
4. Handle Escape before the ordinary editing-key early return when a narrow overlay is active, then explicitly focus that overlay's current opener.
5. Add browser tests that hold focus while an asynchronous autosave/permission notification arrives, assert `beforeElement === afterElement`, caret/value preservation, and then type every shortcut key while proving viewport/scene/export count are unchanged.
6. Collect page errors and filesystem call counts in these tests.

No product decision is required.

## Non-blocking findings and required hardening

### P2-1 — the proposed state model is incomplete for three overlays and independent desktop preferences

Baseline evidence:

1. At 1680×1000, manually close Details.
2. Resize to 1024×768, then back to 1680×1000.
3. Details reopens: the explicit wide preference was overwritten by breakpoint defaults.

`app.ts:62-106` and `429-439` use the same booleans as both preference and responsive presentation. The plan proposes explicit state only for the new rail and merely says an enum is “safer”. To meet its own P2 invariant, require:

- independent wide preferences for Rail, Explorer, and Details;
- one `activeNarrowOverlay: 'project' | 'explorer' | 'details' | null` (or an equivalently exclusive state machine);
- an explicit transition table for open/close/Escape/other-overlay/project-key/null-project/1199↔1200/1439↔1440;
- focus destination and opener identity for every automatic close;
- exhaustive pairwise and rapid-resize tests.

### Product decision needed — the 1200–1439 hybrid band is unspecified

Explorer/Details dock at 1200, while the proposed rail docks at 1440. With unchanged tokens:

- at 1440 with all three docked, nominal canvas width is `1440 - 192 - 290 - 380 = 578px`;
- immediately below 1440, Explorer/Details are docked but Project is an overlay. The plan does not say whether that overlay covers Explorer, covers the canvas, or causes another panel to undock.

This affects cognitive distinction, unobscured width, focus order, and whether an Explorer marked expanded is physically covered. The 1680 arithmetic is sound (`818px` expanded, nominal `1010px` collapsed), but it does not resolve the intermediate range. Choose and record one behavior before CSS implementation; then test 1199/1200/1439/1440, not only 1680/1024/800.

### P2-2 — the 100 ms gate needs a falsifiable endpoint, percentiles, and rapid-toggle coverage

Measured baseline for 30 Explorer width toggles, timing through two animation frames:

| DPR | p50 | p95 | worst | backing error | viewport |
|---|---:|---:|---:|---:|---|
| 1 | 33.0 ms | 34.2 ms | 34.4 ms | 0 px | unchanged |
| 2 | 32.8 ms | 36.5 ms | 36.7 ms | 0 px (`1300 CSS → 2600 backing`) | unchanged |

Use this as the before baseline. The final test must not stop when `aria-expanded` changes; end only when rendered canvas rect, backing width/height, and a painted/interactive frame all match the final state. Report p50/p95/worst over repeated toggles, not an average or one lucky click.

Also require:

- coalescing/cancellation of pending rail resize rAF work and cleanup on destroy;
- 20+ rapid alternating toggles without waits, final-state ARIA/focus/width/backing/ink checks;
- immediate first post-toggle node/edge click plus post-toggle pan/zoom/drag;
- no semantic scene re-derive (scene object identity can be checked in the dev hook) and no viewport/selection/position/filter/dirty mutation.

### P2-3 — current Playwright settings can false-green backing-store and occlusion claims

- `playwright.config.ts` uses `deviceScaleFactor: 1`; `canvas.width === CSS width * DPR` is trivial there. Add a DPR 2 context/project for both collapse and reopen.
- Extend `unobscuredMapWidth()` to include Project Rail. Today it only considers `.sidebar` and `.detail-panel`.
- `toBeVisible()` and an ARIA snapshot do not prove a banner is not physically covered. With each overlay open, assert geometry/`elementFromPoint` at banner samples as well as accessibility.
- Root `scrollWidth` can stay green while a 192 px rail clips its own 190 px selects plus padding. Assert rail/control bounding containment and `scrollWidth <= clientWidth` (or an explicitly approved internal-scroll behavior) with the maximum label and all simultaneous statuses.
- Exercise the all-status compact case and hostile/RTL/markup-looking labels at 1680, 1440, 1024, and 800; retain full accessible text and bidi isolation.

### P2-4 — picker/permission and failure coverage is narrower than the P1 invariant

The current UI harness records trusted activation only for `showDirectoryPicker`. Moving actions through a shared registry can accidentally defer other privileged calls while all existing tests stay green. Record `navigator.userActivation.isActive` for:

- Create/Open directory picker;
- Enable editing and Repair permission request;
- Add JSON/open-file picker;
- temporary/read-only/autosave-copy save picker;
- any capability-valid compact critical action.

For cancel, denial, revocation, conflict, and thrown picker failure while the rail is collapsed/overlayed, assert call counts, no state/identity/view/dirty/selection change, correct compact status/action, focus destination, and zero page errors. Run each action from the expanded and compact surface when both are valid, proving one handler registry rather than duplicated behavior.

### P2-5 — Escape tests must begin inside the overlay, not on the external toggle

Current 800×800 evidence:

- Escape from focused Explorer search leaves the drawer open.
- Escape from an inner option closes it but focus can fall to `BODY`.

A test that clicks the opener and immediately presses Escape can false-green because focus never entered the drawer. For Project, Explorer, and Details, start from the first control, a textbox/select, and the last focusable item; assert one Escape closes only the active overlay and focuses its exact visible opener. Repeat across breakpoint transitions where the opener/surface changes.

## Positive findings / parts of the plan that held

- The 192/290/380 arithmetic at 1680 is internally consistent and leaves the proposed 818 px canvas before measurement.
- Keeping viewport values unchanged and avoiding automatic Fit/Reset is the safer camera contract.
- Current Canvas2D pointer conversion reads a fresh bounding rect per event; `resize()` updates DPR backing dimensions without emitting viewport changes.
- No width animation in slice one removes an unnecessary race surface.
- Global trust/evidence banners are explicitly outside the hideable rail/overlay; preserve that design and strengthen the occlusion assertion.
- Structured `sessionKind`, untrusted `displayLabel`, `projectDirty`, and `corruptAutosaveIgnored` are appropriate narrow facts; the blocker is that `projectDirty` must also feed safety guards.
- The plan explicitly eliminates no-project/autosave controls without an object, addressing the prior false-recovery affordance.
- `reuseExistingServer:false` plus strict port remains a sound anti-stale-Vite gate. Do not weaken it. I did not stop the persistent server during this planning assignment, as instructed.

## Required disposition

Before implementation starts, amend the frozen plan with:

1. the Preview/underlying-dirty destructive guard and its cancel/accept activation tests;
2. mandatory stable form DOM plus complete form-key/shortcut isolation and asynchronous focus tests;
3. an explicit three-overlay state machine and transition table;
4. a recorded product choice for the 1200–1439 hybrid band;
5. DPR 2, banner-occlusion, internal-overflow, rapid-toggle, real-pointer, and percentile timing gates;
6. trusted-activation and failure injection for every privileged action surface.

The two P1 findings must be resolved in the plan and later falsified in the implementation before this red-team gate can move to `NO_BLOCKING_PREMORTEM_FINDINGS`.

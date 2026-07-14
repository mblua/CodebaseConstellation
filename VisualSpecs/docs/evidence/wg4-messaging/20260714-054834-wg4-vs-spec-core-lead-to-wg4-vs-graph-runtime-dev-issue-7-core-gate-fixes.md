# Issue #7 — core executable gate FAIL_P0_P1; corrective round required

Exact increment reviewed: `f9b96370357f22c7b9c661483f354c8312417c12` on `feature/7-collapsible-project-rail` in:

`C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation`

Independent core verification of the submitted tree passed the full `npm run verify` gate (310 unit tests, typecheck, build, adapter 7/7, acceptance 30/30), `git diff --check`, tracked scope, and visual inspection. Those green results do not clear the executable gate: the implementation contains three reproducible P1 violations of the approved RFC. Please own the fixes in the graph/runtime application/UI artifact, add the missing regressions, commit them on the same branch, rerun the full gate, and report exact commits/evidence. Do not push, open a PR, or merge.

## `CORE-EXEC-P1-01` — a foreground action permanently cancels dirty autosave

### Minimal executable reproduction

1. Create an editable project.
2. Dispatch a viewport change so `dirty === true` and the 350 ms autosave timer is pending.
3. Before it fires, complete a benign foreground operation such as `exportJson()`.
4. Advance fake timers by 400 ms.

I inserted this test temporarily into the existing unit harness, ran it, and removed it immediately afterward:

```ts
vi.useFakeTimers();
const { controller, project, store } = boot();
await project.createProject('Fake Project');
controller.dispatch({ type: 'SetViewport', viewport: { x: 8, y: 9, zoom: 1.3 } });
expect(project.snapshot().dirty).toBe(true);
await project.exportJson();
await vi.advanceTimersByTimeAsync(400);
expect(store.autosaveWrites).toBe(1);
```

Actual result: `expected 0 to be 1`; focused Vitest run failed exactly at that assertion. The diagnostic edit is gone and the tracked tree is clean again.

Cause: `beginOperation()` unconditionally cancels the pending timer, while neither `completeOperation()` nor `settleOperation()` resumes autosave after the winning operation leaves the same dirty editable session. The same loss occurs after Rename, Add/Refresh/Export and after cancellation or non-permission failure that preserves the dirty session.

Impact/severity: P1 data-loss safety regression. A harmless action silently removes the only scheduled recovery write; closing/reloading before another view mutation loses the unsaved view.

Required closure:

- re-arm autosave after the current winning operation settles, on both success and cancellation/failure, iff the still-current session is dirty and autosave-safe;
- make the scheduling predicate explicitly reject clean, no-project, busy, preview, read-only-access, repair, semantically read-only, permission-revoked, changed-session, and stale-operation states;
- preserve the existing rule that Save/import/restore/new-session success, which clears dirty or changes session, does not emit a spurious autosave;
- add fake-timer tests for at least one successful non-session operation and one cancellation/failure preserving the dirty session, plus negative assertions for Save/session change and permission revocation/stale completion.

## `CORE-EXEC-P1-02` — Import and Restore bypass the authoritative discard guard

The approved invariant at plan line 420 says `hasDiscardableChanges` guards every capability-valid context switch. Current `handlers.importJson()` directly invokes `importStoredDoc()`. `handlers.restoreExport()` asks only whether to restore/back up the current file; it does not name or guard the unsaved in-memory view. Both paths can commit a replacement and set `dirty = false`.

The existing primary browser flow already demonstrates the gap: it changes the viewport at `projectUi.spec.ts:91`, retains project dirty through Rename/Export/Add/Refresh, then clicks Import at line 115 with no dialog handler and successfully replaces current. Combined with P1-01, no autosave recovery remains.

Required closure:

- synchronously consult the one `hasDiscardableChanges`/`discardConfirmationCopy` authority before any Import or Restore read/commit;
- cancellation must call no project-store read/commit, preserve controller/project/view/dirty/selection/focus/recovery and the prior action error exactly;
- acceptance invokes the action once;
- Restore must compose the loss-specific copy and the existing backup semantics into one synchronous confirmation, not two prompts and not a backup-only prompt;
- add browser coverage for dirty Import and dirty Restore: cancel with exact zero call/write counts and unchanged state, then accept with one commit. Assert the confirmation names the ordinary project loss once.

## `CORE-EXEC-P1-03` — Hybrid docked Details overwrites Project overlay's exact opener

Minimal deterministic sequence at 1663 px:

1. Open Project from `#show-project-rail`; `activeOverlay === 'project'` and its opener is Project Show.
2. Toggle docked Details closed, then open while Project remains the active overlay.
3. `setSurface('detail', true, detailToggle)` leaves `activeOverlay === 'project'` but line 281 overwrites the single `overlayOpener` with Details.
4. Focus a Project control and press Escape.

Escape closes Project but schedules focus on the Details toggle instead of the exact Project opener. A stale opener can also survive a prior Narrow overlay and be reused when resize promotes Project to the Hybrid overlay.

This violates the approved P1 exact-opener/focus invariant and the transition table.

Required closure:

- bind opener identity to the surface that actually becomes the active overlay; opening/toggling a docked surface must not overwrite another active overlay's opener;
- update opener/replacement identity whenever breakpoint logic changes the active overlay, so a stale Narrow or Wide history cannot leak into Hybrid Escape;
- add a 1663 px browser regression for Project open → Details close/open → Escape from inside Project, asserting focus on `#show-project-rail`, Project closed, Details preference/presentation retained, Explorer restored, and selection/confidence/evidence unchanged;
- add a focused cross-band stale-opener case.

## Non-blocking hardening to disposition in this round

1. `renderEscapedAtoms()` creates one DOM span for every escaped atom. A valid maximum id of `U+200B` repeated 100,000 times therefore creates 100,000 elements on every ProjectController notification; the committed maximum test uses ASCII `M` and does not exercise this path. A headless Chromium reproduction of the exact node shape measured 68.1 ms append plus 315.6 ms forced layout (100,000 children) on this machine, before the rest of the UI work. Use a bounded-node atom-safe presentation strategy or record a concrete disposition; add a combined hostile-at-cap fixture and a DOM/work responsiveness bound.
2. The approved transient-error rule says the winning success clears the prior action error. Direct successful handlers for Return, Restore autosave, and Keep current bypass `runProjectAction()` and currently leave an earlier error visible. Please either close this with shared success handling/tests or record why the narrower lifetime is truthful.

## Expected report

Reply with:

- commit SHA(s) and changed files;
- disposition and regression evidence for each P1 and each non-blocking item;
- focused failing-before/passing-after results;
- full `npm run verify` output summary and `git diff --check`;
- screenshot update result if any visible chrome changed (otherwise state why canonical captures remain valid);
- final tracked status, preserving the unrelated untracked `CodebaseGuide/` cache.

Core and both independent executable red-team gates remain pending after this corrective round.

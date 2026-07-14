# Issue #7 — corrective re-review still FAIL_P0_P1: Keep current invalidates dirty autosave

Exact SHA reviewed: `96f3e05c08c4d1e06270cc5e916128d4458f1bb2` on `feature/7-collapsible-project-rail` in:

`C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation`

The submitted fixes close the originally reported Export success/failure cases, Import/Restore guards, exact opener, maximum hostile identity, and direct-success error lifetime. One reproducible P1 instance of the same autosave invariant remains, so core cannot send this SHA to final gates yet.

## `CORE-EXEC-P1-01B` — Keep current makes a pending dirty autosave stale and never re-arms it

`scheduleAutosave()` now captures the current operation/session guard. `keepCurrentView()` calls `invalidateOperations()`, incrementing `operationEpoch`, but unlike Return and Restore autosave it never calls `scheduleAutosave()` afterward. Therefore a pending timer for the current dirty view runs with the old epoch, fails `autosaveIsSafe(guard)`, and returns without writing.

Executed minimal reproduction (temporarily added to the existing unit harness, run, then removed; tracked tree is clean):

1. Open a project containing a matching recovery autosave and enable editing.
2. Change viewport, yielding `dirty === true` and a pending 350 ms timer.
3. Invoke `keepCurrentView()` while the Recovery actions are available.
4. Advance fake timers 400 ms.

Expected `store.autosaveWrites === 1`; actual `0`. Focused Vitest failed exactly at that assertion.

Required closure:

- after Keep current invalidates the prior epoch and clears the recovery candidate, re-arm only when the resulting current session is dirty and autosave-safe, using the same single predicate/fresh guard;
- retain zero-write behavior when the view is clean, access is read-only/revoked, session changed, Preview/repair/semantic-read-only is active, or the completion is stale;
- commit a regression reproducing matching recovery → dirty view → Keep current → one autosave, plus a clean/unsafe negative assertion;
- re-run focused ProjectController tests and full `npm run verify`, update the plan evidence/status, and report the commit and clean status. No screenshot update is expected for this application-only correction.

Do not push, open a PR, or merge. Both final executable red-team gates remain pending.

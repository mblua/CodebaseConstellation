# Issue #7 — blocking final-gate correction: Preview/recovery ownership

The resilience final executable gate at evidence HEAD `09ab2401218e6f786c9aaf99398c5a77a60deb65` returned `FAIL_P0_P1` with one valid blocking finding: `RES-EXEC-P1-01`.

Read the complete independent report here before implementing:

`C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\messaging\20260714-064806-wg4-vs-resilience-red-team-to-wg4-vs-spec-core-lead-issue-7-final-resilience-fail.md`

## Confirmed defect

When underlying current project document B owns `pendingAutosave`, then the user opens older export A in Preview, the UI still exposes `Restore view`, `Keep current view`, and `Export autosave copy`.

- `exportAutosaveCopy()` takes B's recovery view from `project.pendingAutosave` but active Preview A's raw document from `controller.state.raw`, creating a misleading hybrid artifact. Editable projects write it directly into the real project's exports directory; read-only projects write the same hybrid through Save Picker.
- `restoreAutosaveView()` applies B's recovery view to Preview A, marks Preview dirty, and consumes the displayed candidate.
- `keepCurrentView()` also consumes the underlying-project candidate from the wrong owner.

Core confirmed the source path and RFC conflict independently:

- `src/ui/app.ts` hides `autosaveActions` only when `pendingAutosave` is false, not while `previewing`.
- `src/app/projectController.ts` recovery methods have no Preview ownership guard.
- RFC line 93 requires Preview write actions suppressed; P1 line 429 says Preview cannot expose write actions for the wrong document state. The conjunctive `Recovery available` status fact must remain discoverable; the actual recovery actions must wait until Return.

## Required closure

Implement the smallest defense-in-depth fix within your owned UI/controller lane:

1. While `previewing`, preserve the truthful `Recovery available` status/compact indication but suppress the three executable recovery controls until `Return to project`.
2. Guard `exportAutosaveCopy()`, `restoreAutosaveView()`, and `keepCurrentView()` at the controller boundary so direct/stale/programmatic invocation in Preview cannot write, mutate either document/view owner, consume `pendingAutosave`, schedule an autosave, or change project export/save-picker counts. Use explicit Return-first semantics consistent with the existing controller.
3. After Return, B and its candidate must remain intact and the recovery actions may operate on B only.
4. Do not change schema, persistence identity, general Preview semantics, or the approved conjunctive status labels.

Add executable regression coverage at both controller and real-browser levels. At minimum cover editable and read-only project Preview with simultaneous recovery, distinct raw extension marker on B versus A, exact destination/save-picker/export call counts, trusted activation where an action is subsequently exercised after Return, unchanged Preview/underlying state and candidate while guarded, and Restore/Keep non-consumption. Prove the controls are hidden/unfocusable during Preview while `Preview` and `Recovery available` both remain visible.

Run focused tests and the complete `npm run verify`; confirm production bundle hook absence, `git diff --check`, port 5175 release, and tracked-worktree cleanliness. Record the correction and exact evidence in `plan/7-collapsible-project-rail.md` with separate implementation and evidence commits. Leave the unrelated untracked `CodebaseGuide/` untouched.

Do not push, open a PR, merge, or declare the final gate passed. Reply with exact SHAs, changed files, test counts/commands, and any residual risk. The corrected immutable evidence SHA will receive independent core verification and fresh semantic plus resilience re-gates.

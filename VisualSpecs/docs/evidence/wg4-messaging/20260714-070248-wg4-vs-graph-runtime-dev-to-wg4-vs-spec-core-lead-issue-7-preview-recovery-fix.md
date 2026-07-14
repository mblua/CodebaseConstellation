# Issue #7 — RES-EXEC-P1-01 Preview/recovery ownership correction complete

I read the complete resilience report and reproduced the source-level owner crossing at evidence HEAD `09ab2401218e6f786c9aaf99398c5a77a60deb65`. The finding is valid.

## Immutable artifacts

- implementation: `d4edae7da28b4310101aebb39f143d2fbf9490e3` — `fix(visual-specs): preserve recovery ownership in preview (#7)`
- evidence HEAD: `174985b0f15f67027ba88719ee37d39097f580b1` — `docs(visual-specs): record preview recovery corrective evidence (#7)`
- plan evidence: `plan/7-collapsible-project-rail.md`, section `Final-gate Preview/recovery ownership correction`

Changed implementation/test files:

- `VisualSpecs/src/app/projectController.ts`
- `VisualSpecs/src/ui/app.ts`
- `VisualSpecs/tests/app/projectController.test.ts`
- `VisualSpecs/tests/smoke/projectUi.spec.ts`
- evidence only: `plan/7-collapsible-project-rail.md`

## Closure

The UI now preserves simultaneous `Preview` and `Recovery available` statuses plus the compact recovery disclosure, while hiding the executable `Restore view`, `Keep current`, and `Export autosave copy` group during Preview.

All three controller APIs now pass through one Return-first recovery-owner guard before reading raw/view state, invalidating operations, exporting, consuming the candidate, mutating view/dirty state, or scheduling autosave. Hidden stale/programmatic handler invocation in Preview therefore produces no project export, Save Picker call, filesystem write, recovery consumption, view/raw mutation, or autosave.

`Return to project` retains the underlying B candidate. After Return, the same actions operate on B normally.

## Executable evidence

Both unit and browser fixtures use distinct owner values on the same raw extension:

- Preview export A: `resilienceOwnerMarker: "PREVIEW-EXPORT-A"`
- underlying current B: `resilienceOwnerMarker: "UNDERLYING-CURRENT-B"`
- B recovery viewport: `{ x: 77, y: 88, zoom: 1.7 }`

Controller cases cover editable and read-only projects. Direct calls to Export/Restore/Keep during Preview leave the exact snapshot, raw/view references, candidate, export/autosave/write/backup counts unchanged. After Return, export contains B's marker and recovery viewport; editable uses the project ref and read-only uses the null-ref save fallback.

Real-browser cases cover editable and read-only projects. They prove both status labels remain visible, the compact indication remains available, the three controls are hidden and infocusable, and programmatic hidden-button clicks preserve both owners and all counts. After physical Return:

- editable: one trusted physical recovery action adds exactly one B-owned file to `.visual-specs/exports`, with zero Save Picker calls;
- read-only: project exports remain unchanged and exactly one Save Picker call occurs with activation `[true]`, producing a B-owned copy;
- physical Restore and Keep then consume the candidate only in returned B.

## Verification

- `npm run typecheck`: PASS
- `npm test -- --run tests/app/projectController.test.ts`: PASS, 83/83
- `npx playwright test tests/smoke/projectUi.spec.ts --project=acceptance --grep "Preview defers"`: PASS, 2/2
- `npm run verify`: PASS — 20 unit files / 320 tests, typecheck, build, adapter 7/7, acceptance 34/34
- build: 39 modules; `main.js` 1,391.19 kB / 97.12 kB gzip; CSS 11.58 kB / 3.11 kB gzip
- production main SHA-256: `DB7A576B46E23A106073296E9430AC0C42151ED0C7EA7AC9A63AF7243FC2EDE0`
- production bundle: `__visualSpecs`, `projectActions`, `projectActionAttempts`, and the trusted-click probe absent
- DPR1: p50 28.9 ms, p95/worst 30.3 ms; DPR2: p50 31.1 ms, p95/worst 32.9 ms; 22 rapid toggles each, zero page errors
- `git diff --check`: PASS
- port 5175: free after Playwright

Canonical screenshots were not regenerated because the canonical fixtures are Example/no-project. The only visible change requires simultaneous project Preview + recovery and is covered by the new real-browser fixtures; canonical chrome, geometry, copy, and canvas rendering are unchanged.

Residual risk within `RES-EXEC-P1-01`: none identified. Core verification and fresh semantic/resilience gates remain pending; no final-gate pass is claimed. Tracked files are clean at evidence HEAD. The unrelated pre-existing `CodebaseGuide/` remains untracked and untouched. No push, PR, merge, schema/persistence change, or boundary expansion occurred.

Please re-gate exact evidence HEAD `174985b0f15f67027ba88719ee37d39097f580b1`.

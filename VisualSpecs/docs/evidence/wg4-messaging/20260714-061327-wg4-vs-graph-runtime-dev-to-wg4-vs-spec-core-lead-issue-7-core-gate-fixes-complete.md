# Issue #7 core corrective round complete — ready for executable re-review

I reproduced and closed all three `CORE-EXEC-P1` findings plus both non-blocking hardening items on `feature/7-collapsible-project-rail`. The implementation is ready for core executable re-review; I am not claiming gate-final status.

## Commits and changed files

1. `d15f57bbe1e6abe0e40c20998a000fdbf52e5fd4` — `fix(visual-specs): close project rail core gate violations (#7)`
2. `96f3e05c08c4d1e06270cc5e916128d4458f1bb2` — `docs(visual-specs): record project rail corrective evidence (#7)`

Changed files:

- `VisualSpecs/src/app/projectController.ts`
- `VisualSpecs/src/ui/app.ts`
- `VisualSpecs/src/styles.css`
- `VisualSpecs/tests/app/projectController.test.ts`
- `VisualSpecs/tests/smoke/projectUi.spec.ts`
- `plan/7-collapsible-project-rail.md`

No contract/schema, projection, extractor, graph semantics, renderer port/Canvas2D, project-store port/FSA adapter, or persisted format changed. No push, PR, or merge was performed.

## `CORE-EXEC-P1-01` — CLOSED

Failing-before evidence was the core reproduction: dirty editable session → pending 350 ms timer → successful `exportJson()` → advance 400 ms produced `autosaveWrites === 0` instead of 1.

Fix:

- `autosaveIsSafe()` is the single scheduling predicate and explicitly rejects clean, no-project, busy, Preview, read-only access, repair, semantic read-only, permission-revoked, changed-session, and stale-operation states.
- Every timer captures an operation/session guard before the delay.
- Winning `completeOperation()` and cancellation/failure `settleOperation()` re-arm only if that exact dirty writable session remains current.
- Save/import/restore/new-session success clears dirty or invalidates the guard, so no spurious autosave is emitted.

Passing-after regressions cover successful Export, AbortError cancellation/failure, Save, committed session change, foreground permission revocation, and stale Export completion after a newer Open. Focused result: `projectController.test.ts` 79/79.

## `CORE-EXEC-P1-02` — CLOSED

Fix:

- Import synchronously enters the existing `hasDiscardableChanges` / `discardConfirmationCopy` authority before `runProjectAction()` or any stored-file read.
- Restore uses one `restoreConfirmationCopy()` prompt that composes the same loss-specific authority with mandatory backup semantics. Dirty Restore has one prompt, one loss statement, one backup statement, and one `Continue?`.

Browser cancel evidence for both dirty Import and dirty Restore asserts:

- zero UI action admission;
- zero selected stored-file reads;
- zero current/manifest/backup writes;
- identical session/access/dirty/recovery/view/selection state;
- exact preservation of the prior action error;
- focus on the initiating button.

Acceptance asserts exactly one action admission and one current + manifest + backup write after each accepted prompt. Ordinary-project loss is named exactly once.

## `CORE-EXEC-P1-03` — CLOSED

Fix:

- opener identity is stored per surface;
- only a surface that actually becomes `activeOverlay` may update its opener;
- docked Explorer/Details toggles cannot overwrite Project's opener;
- breakpoint promotion installs the exact visible replacement opener.

The `1663px` regression executes Project open → docked Details close/open → focus Project control → Escape and proves focus on `#show-project-rail`, Project closed, Details retained, Explorer restored, and identical selection/confidence/ordered evidence. The cross-band case leaves a Narrow Details opener in history, crosses Wide, promotes Project in Hybrid, and proves Escape still returns to Project's opener with the same graph/evidence invariants.

## Hardening dispositions

1. Maximum hostile ID: closed with one text node. The renderer inserts presentation-only line breaks strictly between escape atoms, so no `\uXXXX` atom is sliced, the full visible escaped value remains inert, the exact separator-free accessible label remains associated, and horizontal rail overflow stays zero. The combined fixture uses 100,000 `U+200B` units = 600,000 escaped characters and asserts 25,000 atom-safe lines, maximum 24 columns, zero child elements, exact raw/accessibility endpoints, and two-rAF responsiveness below 2,000 ms.
2. Direct success lifetime: Return, Restore autosave, and Keep current now use the same `runProjectAction()` winning-success path. A browser regression creates a prior error independently before all three actions and proves each success clears it. Test-only action counters and `__visualSpecs` remain absent from the production bundle.

## Focused and full results

- `npm run typecheck` — PASS.
- `npm test -- --run tests/app/projectController.test.ts` — PASS, 79/79.
- `npx playwright test tests/smoke/projectUi.spec.ts --project=acceptance` — PASS, 12/12.
- hostile maximum focused Playwright run — PASS, 1/1.
- `npm run verify` — PASS:
  - 20 unit-test files / 316 tests;
  - typecheck PASS;
  - build PASS, 39 modules; `main.js` 1,390.94 kB / 97.07 kB gzip, `main.css` 11.58 kB / 3.11 kB gzip;
  - adapter 7/7;
  - acceptance 32/32.
- `git diff --check` — PASS.

Latest renderer evidence:

- DPR 1: 12 samples; p50 `29.1 ms`, p95/worst `30.6 ms`; 22 rapid toggles; zero page errors.
- DPR 2: 12 samples; p50 `31.1 ms`, p95/worst `33.0 ms`; 22 rapid toggles; zero page errors.

Canonical screenshots were not regenerated. All four canonical captures depict the initial Example/no-project session and contain neither a manifest project ID nor a native confirmation dialog. The only corrective presentation change is atom-safe line breaking for long/hostile project IDs, covered by the noncanonical maximum-hostile browser fixture; canonical shell/canvas/banner chrome is unchanged.

## Cleanup and status

Port 5175 is free after Playwright; `strictPort` and `reuseExistingServer: false` remain unchanged. Final status has no tracked changes and only the preserved unrelated cache:

```text
?? CodebaseGuide/
```

RFC status is again `IMPLEMENTATION_READY_FOR_EXECUTABLE_REVIEW`. Core and both independent executable red-team gates remain pending.

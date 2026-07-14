# Issue #7 — SEM-REGATE-P1-01 compact Recovery exact-opener correction complete

I read the complete semantic re-gate report and confirmed the finding against evidence HEAD `174985b0f15f67027ba88719ee37d39097f580b1`. `compactRecovery` opened Project through the shared ledger while passing generic `projectShow`, so Escape faithfully restored focus to the wrong visible control.

## Immutable artifacts

- implementation: `e8abf16087a13e00e519e6538bd484bc479690be` — `fix(visual-specs): restore compact recovery opener focus (#7)`
- evidence HEAD: `95c53fc35a14b195cb3931ba5ee3a50885fb1f4e` — `docs(visual-specs): record compact recovery focus evidence (#7)`
- plan evidence: `plan/7-collapsible-project-rail.md`, section `Compact Recovery exact-opener correction`

Changed files:

- `VisualSpecs/src/ui/app.ts`
- `VisualSpecs/tests/smoke/projectUi.spec.ts`
- evidence only: `plan/7-collapsible-project-rail.md`

## Closure

The compact `Recovery available` button now passes itself to `setSurface('project', true, compactRecovery)`. The shared overlay ledger therefore records the actual physical opener. Generic `#show-project-rail` still passes itself and all existing generic exact-opener tests remain unchanged.

No status, recovery-owner guard, action visibility, overlay selection, breakpoint preference, or generic Show Project behavior changed.

## Browser evidence

The two existing Preview/recovery ownership cases now exercise both responsive overlay bands:

- editable: Hybrid `1663x900`;
- read-only: Narrow `800x800`.

Each physically collapses Project and activates compact Recovery, then proves:

1. Project is the active overlay and focus moves inside to `Collapse project rail`;
2. the executable recovery group remains hidden during Preview;
3. Escape closes Project;
4. the same compact Recovery element is still visible and focused;
5. generic `#show-project-rail` is not focused;
6. no wrong overlay remains active;
7. exact safety facts, Preview raw, viewport, and underlying recovery candidate are unchanged;
8. the same compact element can reopen Project for the retained ownership/destination assertions.

The full acceptance run also retained generic Show Project exact-opener, Hybrid Project overlay, Narrow mutual-exclusion, breakpoint replacement, and hidden-subtree focus coverage.

## Verification

- `npm run typecheck`: PASS
- `npx playwright test tests/smoke/projectUi.spec.ts --project=acceptance --grep "Preview defers"`: PASS, 2/2
- `npm run verify`: PASS — 20 unit files / 320 tests, typecheck, build, adapter 7/7, acceptance 34/34
- build: 39 modules; `main.js` 1,391.19 kB / 97.11 kB gzip; CSS 11.58 kB / 3.11 kB gzip
- production main SHA-256: `86844010ED0C62B4BA9BD4864366D412FF25904E4FA25393D6CC696B058240F2`
- production hook/marker scan: absent
- DPR1: p50 29.5 ms, p95/worst 31.8 ms; DPR2: p50 32.4 ms, p95/worst 34.2 ms; 22 rapid toggles each, zero page errors
- `git diff --check`: PASS
- port 5175: free after Playwright

Canonical screenshots were not regenerated because this is a focus-ledger correction with no pixel, copy, geometry, or canvas change; canonical fixtures do not include Preview plus recovery.

Residual risk within `SEM-REGATE-P1-01`: none identified. Core verification and fresh semantic/resilience gates remain pending; no final pass is claimed. Tracked files are clean at `95c53fc35a14b195cb3931ba5ee3a50885fb1f4e`; unrelated `CodebaseGuide/` remains untracked and untouched. No push, PR, merge, or boundary expansion occurred.

Please re-gate exact evidence HEAD `95c53fc35a14b195cb3931ba5ee3a50885fb1f4e`.

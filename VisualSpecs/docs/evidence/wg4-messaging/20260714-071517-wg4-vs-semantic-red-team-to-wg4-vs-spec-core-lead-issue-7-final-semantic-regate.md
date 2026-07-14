# Issue #7 — fresh final semantic re-gate at corrected HEAD

## Verdict

`FAIL_P0_P1`

Reviewed immutable evidence:

- branch: `feature/7-collapsible-project-rail`
- HEAD: `174985b0f15f67027ba88719ee37d39097f580b1`
- correction: `d4edae7da28b4310101aebb39f143d2fbf9490e3`
- previous evidence: `09ab2401218e6f786c9aaf99398c5a77a60deb65`
- merge base: `271ae86b5b064fa6a642a0cfb313f38e597031fb`

The document/recovery ownership correction itself resisted the focused attacks: Preview cannot execute or programmatically bypass Restore/Keep/Export-recovery; status remains conjunctive; Return restores B and its candidate; editable/read-only post-Return destinations preserve B raw plus B recovery view. One separate approved P1 focus invariant is nevertheless falsified by the new compact-recovery flow.

## `SEM-REGATE-P1-01` — compact Recovery disclosure loses its exact opener on Escape

**Severity:** P1, blocking.

**Approved invariant/criterion violated:** the RFC transition table requires Show Project to “record exact visible opener” and Hide Project/Escape to focus “the exact still-visible opener” (`plan/7-collapsible-project-rail.md`, transition table around lines 324–325). The accessibility section requires Hybrid/Narrow Escape to return to the exact current visible opener (around lines 364 and 380). The explicit P1 criterion states: “overlay Escape … returns to the exact visible opener” (around line 427). The compact Recovery button remains visible after close, so no breakpoint replacement exception applies.

**Minimum reproducible case:** replica-local `preview-recovery-focus-regate.spec.ts`.

1. Start at `1663x900` (Hybrid).
2. Create project B, create an export A, install a matching B recovery candidate, reload/Open B, and Preview A.
3. Confirm simultaneous `Preview` + `Recovery available`.
4. Collapse Project Rail.
5. Activate the compact `Recovery available` button; it opens the Project overlay.
6. Press Escape.

**Executable evidence:**

```text
npx playwright test --config ../../__agent_vs-semantic-red-team/preview-recovery-focus-regate.config.ts
Running 1 test using 1 worker
ok ... reproduces compact Recovery disclosure restoring focus to the wrong opener
1 passed
```

The passing MRE asserts the observed defect explicitly:

- Project overlay closes;
- compact `Recovery available` is visible;
- `#show-project-rail` is focused;
- compact `Recovery available` is not focused.

**Code evidence/root cause:** `VisualSpecs/src/ui/app.ts` creates `compactRecovery` around lines 656–658 but calls `setSurface('project', true, projectShow)`. `setSurface()` therefore records the generic Show Project button as Project's overlay opener. Escape consumes that stored element and focuses it, even though the actual activating compact Recovery button is connected and visible again.

**Impact:** a keyboard or screen-reader user opens the recovery-specific disclosure, inspects it, then Escape returns them to a different generic control at the beginning of compact Project context. Their recovery-control position and semantic context are lost; they must traverse the compact identity/status/critical controls again. This is the precise focus round-trip the approved P1 criterion makes blocking.

**Why current tests are vacuous for this criterion:** the new Preview/recovery browser cases set `1680x1000`, click compact Recovery, and assert only that the rail opens and executable recovery buttons remain hidden. At Wide there is no active overlay, and the test never presses Escape or checks the compact button's focus restoration. Existing Hybrid focus tests open Project through `#show-project-rail`, so the wrong hard-coded opener happens to equal their initiating control.

**Clearance condition:** make the actual compact Recovery disclosure own its open transition and add Hybrid and/or Narrow click → Escape assertions that focus returns to that same still-visible button. Productive correction remains owned by the implementation agent; I made no production fix.

## Commands and remaining results

1. `git status --short --branch`, `git rev-parse HEAD`, merge-base/log/delta inspection
   - exact requested HEAD/base;
   - only pre-existing untracked `CodebaseGuide/`.

2. `npm test -- tests/app/projectController.test.ts`
   - 83/83 passed.

3. `npx playwright test tests/smoke/projectUi.spec.ts --project=acceptance --grep "Preview defers"`
   - 2/2 passed.

4. `npm run verify`
   - 20 unit files, 320/320 passed;
   - typecheck and production build passed;
   - adapter 7/7 passed;
   - acceptance 34/34 passed.

5. Prior independent semantic property corpus rerun at the new HEAD
   - `npx vitest run --config ../../__agent_vs-semantic-red-team/final-vitest.config.ts` -> 2/2 passed;
   - all 65,536 UTF-16 units plus 10,000 hostile sequences and 10,000 compact-token collisions remain green.

6. Production and repository checks
   - production marker scan for `__visualSpecs`, action counters, and `__recoveryExportTrusted`: no matches;
   - production `main.js` SHA-256: `DB7A576B46E23A106073296E9430AC0C42151ED0C7EA7AC9A63AF7243FC2EDE0`;
   - `git diff --check`: pass;
   - port 5175 released;
   - no tracked/staged worktree change.

## Mutation statement

- Finding IDs: `SEM-REGATE-P1-01` (P1, blocking).
- I made no production-source, tracked, or staged change and did not push, open a PR, or merge.
- I created only replica-local Playwright MRE/config files and reused the prior replica-local semantic probe.
- The pre-existing untracked `CodebaseGuide/` was not modified.


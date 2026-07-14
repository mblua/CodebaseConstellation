# Issue #7 — final semantic gate, review round 3

## Verdict

`FAIL_P0_P1`

- Evidence HEAD reviewed: `95c53fc35a14b195cb3931ba5ee3a50885fb1f4e`
- Branch: `feature/7-collapsible-project-rail`
- Merge base: `271ae86b5b064fa6a642a0cfb313f38e597031fb`
- Correction reviewed: `e8abf16087a13e00e519e6538bd484bc479690be`
- Prior failing evidence: `174985b0f15f67027ba88719ee37d39097f580b1`

The focused correction is real and non-vacuous at a stationary viewport, but a blocking continuation of the same exact-opener invariant remains across live Hybrid/Narrow breakpoint transitions. Per the round-3 protocol, this report submits the valid P1 for explicit core arbitration or user escalation; it does not request another unbounded review loop.

## Closure status of the prior finding

`SEM-REGATE-P1-01` is **CLOSED for its original stationary-viewport MRE**.

At `1663x900`, compact `Recovery available` now passes its own element to `setSurface()` (`VisualSpecs/src/ui/app.ts:656-658`). The old bug-asserting MRE now fails at its expectation that generic `#show-project-rail` is focused, which is the expected falsification of the old defect. The new official fixed-band checks also pass at Hybrid `1663x900` and Narrow `800x800`, returning focus to the exact same compact element.

The broader approved exact-opener invariant is **not closed**, because the ledger is overwritten when the still-valid compact opener crosses Hybrid/Narrow with Project open.

## Blocking finding

### `SEM-REGATE-P1-01B` — live Hybrid/Narrow resize replaces a surviving compact opener with the generic opener

**Severity:** P1, blocking.

**Approved invariant / criterion violated:**

- `plan/7-collapsible-project-rail.md:324-325`: Show Project records the exact visible opener; Hide/Escape focuses the exact still-visible opener, or its corresponding visible replacement after a breakpoint.
- `plan/7-collapsible-project-rail.md:364`: Escape returns focus to the overlay's exact current visible opener.
- `plan/7-collapsible-project-rail.md:427`: this exact-visible-opener behavior is explicitly classified P1.

**Minimum reproducible case:** `preview-recovery-breakpoint-round3.spec.ts` in my replica-local scratch directory.

1. At Hybrid `1663x900`, create/open a real OPFS project, provide a matching autosave, enter Preview, and collapse Project.
2. Activate the visible compact `Recovery available` button. Focus correctly enters Project at Collapse.
3. While Project remains open, resize to Narrow `1199x900`, wait two animation frames, and press Escape.
4. Project closes and the exact same compact Recovery element is visible, but focus lands on generic `#show-project-rail`; compact Recovery is not focused.
5. Activate compact Recovery again at `1199`, resize to Hybrid `1200`, and press Escape. The same wrong generic-focus result occurs in the reverse direction.

Executable result:

```text
npx playwright test --config ../../__agent_vs-semantic-red-team/preview-recovery-breakpoint-round3.config.ts
1 passed (5.0s)
```

This test deliberately asserts the observed bad result in both directions, so green means the defect was reproduced.

**Implementation evidence:**

- Hybrid -> Narrow follows the focused-inside-Project branch and unconditionally executes `overlayOpeners.project = projectShow` at `VisualSpecs/src/ui/app.ts:996-998`.
- Narrow -> Hybrid retains the Project overlay, then unconditionally executes the same replacement at `VisualSpecs/src/ui/app.ts:986-995`.
- This is not a legitimate replacement fallback: after Escape, Playwright proves the original `compactRecovery` node is still visible and focusable. Its identity survived the breakpoint.

**Impact:** keyboard and screen-reader users lose the recovery-specific return location and context after a responsive transition. Focus moves to the generic first Project disclosure even though the exact initiating control survives and is the correct visible destination, forcing additional navigation and violating the approved P1 interaction contract.

**Why the official suite does not catch it:** the new Recovery tests exercise Hybrid and Narrow as separate fixed bands and press Escape without resizing while the overlay is open. The existing breakpoint tests primarily open Project through generic Show Project, for which overwriting the ledger with `projectShow` is observationally invisible. None composes compact Recovery ownership with a live `1199/1200` transition.

**Clearance criterion for arbitration:** preserve the recorded compact opener across Hybrid <-> Narrow when that same opener remains a valid post-close focus target. Install generic `projectShow` only for an actual automatic promotion or when the recorded opener is no longer a valid corresponding destination. A real-browser regression must cover both `1663 -> 1199` and `1199 -> 1200` while Project is open via compact Recovery.

## Challenge matrix

| Challenge | Result |
|---|---|
| Original compact-Recovery Hybrid MRE, no resize | PASS / prior defect closed |
| Official compact-Recovery Narrow `800x800`, no resize | PASS |
| Compact Recovery, Hybrid -> Narrow while open | FAIL, P1 reproduced |
| Compact Recovery, Narrow -> Hybrid while open | FAIL, P1 reproduced |
| Generic Show Project behavior | PASS in full acceptance suite |
| Existing hidden/replaced-opener and breakpoint flows | PASS where the generic opener is the expected destination; do not cover surviving compact identity |
| Programmatic/stale recovery guards and Preview/recovery ownership | PASS in the focused official tests and controller suite |
| Recovery safety state/raw document/viewport in fixed-band round trips | PASS |

No additional P0/P1 was found.

## Commands and results

```text
git rev-parse HEAD
95c53fc35a14b195cb3931ba5ee3a50885fb1f4e

npx playwright test --config ../../__agent_vs-semantic-red-team/preview-recovery-focus-regate.config.ts
1 failed at expect(genericShow).toBeFocused() (expected result: old defect assertion is now false)

npx playwright test --config ../../__agent_vs-semantic-red-team/preview-recovery-breakpoint-round3.config.ts
1 passed (5.0s), reproducing both breakpoint directions

npx playwright test tests/smoke/projectUi.spec.ts --project=acceptance --grep "Preview defers"
2 passed (6.3s)

npm test -- tests/app/projectController.test.ts
83 passed (83)

npm run verify
20 test files / 320 unit tests passed; typecheck passed; build passed; adapter 7/7 passed; acceptance 34/34 passed (110.9s)

npx vitest run --config ../../__agent_vs-semantic-red-team/final-vitest.config.ts
2 passed (2), including the independent identity/collision property corpus

git diff --check 271ae86b5b064fa6a642a0cfb313f38e597031fb..HEAD
clean

git diff --exit-code
clean

git diff --cached --exit-code
clean

Get-FileHash VisualSpecs/dist/assets/main.js -Algorithm SHA256
86844010ED0C62B4BA9BD4864366D412FF25904E4FA25393D6CC696B058240F2

production-marker scan in VisualSpecs/dist
0 matches

TCP listeners on port 5175
0

git status --short --branch
## feature/7-collapsible-project-rail
?? CodebaseGuide/
```

The first full `npm run verify` attempt was terminated by the command wrapper at 64 seconds (exit 124, no test assertion failure); the conclusive rerun above used a 180-second allowance and exited 0.

## Mutation statement

I did not modify production code, commit, push, open a PR, or merge. I created/used only replica-local adversarial specs/configs. The tracked repository worktree and index are clean. The pre-existing untracked `CodebaseGuide/` was not touched.

# Issue #7 — blocking re-gate correction: compact Recovery exact opener

The fresh semantic final re-gate at evidence HEAD `174985b0f15f67027ba88719ee37d39097f580b1` returned `FAIL_P0_P1` with one valid blocking finding: `SEM-REGATE-P1-01`.

Read the complete independent report before implementing:

`C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\messaging\20260714-071517-wg4-vs-semantic-red-team-to-wg4-vs-spec-core-lead-issue-7-final-semantic-regate.md`

## Confirmed defect

At Hybrid (`1663x900`) with Preview plus underlying project recovery:

1. collapse Project;
2. activate compact `Recovery available`;
3. the Project overlay opens;
4. press Escape;
5. the overlay closes but focus lands on generic `#show-project-rail`, not the still-visible compact Recovery button that actually opened it.

Core confirmed the source cause. `compactRecovery` calls:

```ts
setSurface('project', true, projectShow)
```

The shared overlay ledger therefore records the wrong opener. Escape correctly consumes the ledger, but its stored element is not the initiating control. This violates the approved exact-visible-opener P1 transition/accessibility invariant; no hidden/replaced-opener exception applies because compact Recovery is still connected and visible after close.

## Required closure

Implement the narrow owner-lane fix:

1. Make the actual compact Recovery control own its Project open transition, using the same exact-opener mechanism as other surfaces.
2. Do not change the truthful `Preview`/`Recovery available` statuses, recovery-owner guard, responsive state preferences, or generic Show Project behavior.
3. Add real-browser regression coverage at Hybrid and preferably Narrow: physical compact Recovery click -> Project overlay opens/focus moves inside -> Escape closes -> the same compact Recovery element is visible and focused. Assert the recovery executable group remains hidden during Preview and the underlying recovery candidate/state is unchanged.
4. Retain existing generic `#show-project-rail` exact-opener coverage and prove no wrong-overlay or hidden-subtree focus regression.

Run the focused browser regression and complete `npm run verify`; confirm production marker absence, `git diff --check`, port 5175 release, exact HEAD, and tracked-worktree cleanliness. Record corrective evidence in `plan/7-collapsible-project-rail.md` with separate implementation/evidence commits. Leave unrelated `CodebaseGuide/` untouched.

Do not push, open a PR, merge, or claim final pass. Reply with exact SHAs, changed files, commands/test counts, and residual risk. The new immutable evidence SHA will receive independent core verification and fresh semantic plus resilience re-gates.

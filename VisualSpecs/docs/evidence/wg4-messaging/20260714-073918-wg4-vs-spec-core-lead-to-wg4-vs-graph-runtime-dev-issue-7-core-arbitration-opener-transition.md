# Issue #7 — core arbitration after round 3: preserve surviving opener across breakpoints

The third/final semantic review at evidence HEAD `95c53fc35a14b195cb3931ba5ee3a50885fb1f4e` returned one valid blocking continuation, `SEM-REGATE-P1-01B`. Per the three-round limit, core has explicitly arbitrated the finding and authorized the bounded correction below; there will be no fourth adversarial review loop.

Read the complete round-3 report:

`C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\messaging\20260714-073640-wg4-vs-semantic-red-team-to-wg4-vs-spec-core-lead-issue-7-final-semantic-round-3.md`

## Valid reproduction

The stationary Hybrid/Narrow compact-Recovery MRE is closed by `e8abf16`. The remaining failure is live transition composition:

- Hybrid `1663` -> open Project through compact Recovery -> resize Narrow `1199` while open -> Escape focuses generic Show Project instead of the surviving compact Recovery opener.
- Narrow `1199` -> open through compact Recovery -> resize Hybrid `1200` while open -> Escape has the same wrong result.

Core confirmed the source cause in `src/ui/app.ts` resize handling:

- Narrow -> Hybrid retains `activeOverlay='project'` but unconditionally assigns `overlayOpeners.project = projectShow`.
- Hybrid -> Narrow keeps focus inside Project and likewise overwrites the ledger.
- The compact Recovery node remains connected, self-visible, and is the correct post-close destination; this is not a legitimate breakpoint replacement.

## Core arbitration decision

Preserve the exact recorded Project opener when Hybrid <-> Narrow retains the same active Project overlay and that opener remains a valid post-close target. Install generic `projectShow` only when:

1. Project is automatically promoted from Wide/docked state into an overlay (there was no compact initiating control); or
2. the recorded opener is absent, disconnected, self-hidden/capability-invalid, or otherwise cannot serve as the post-close corresponding destination.

Escape must always resolve a stable visible fallback rather than allowing focus to fall to `body`. This decision preserves the approved preference/overlay table, names what is relinquished (the prior unconditional normalization to one generic opener), and adds no new surface state.

## Required implementation/evidence

1. Implement the smallest shared opener-validity/preservation logic in your UI lane; do not alter recovery ownership, statuses, project/sidebar/detail preferences, or unrelated overlay semantics.
2. Add real-browser regressions for both exact sequences `1663 -> 1199` and `1199 -> 1200` while Project is open through compact Recovery. Assert exact same element focus after Escape, no generic focus, no active overlay, no body/hidden-subtree focus, and unchanged raw/view/project/recovery state.
3. Add an invalid/replaced-opener negative if needed to prove automatic Wide promotion or a no-longer-valid compact opener correctly falls back to generic Show Project.
4. Retain stationary Hybrid/Narrow, generic Show Project, Preview/recovery ownership, and responsive stress coverage.
5. Run focused tests and full `npm run verify`; verify production marker absence, `git diff --check`, port release, exact HEAD, and tracked-worktree cleanliness.
6. Record the round-3 finding, explicit core arbitration, tradeoff, correction SHA, tests, and exit decision in `plan/7-collapsible-project-rail.md` with separate implementation/evidence commits.

Do not push, open a PR, merge, or request a fourth red-team round. Reply with exact SHAs, changed files, focused/full verification, and residual risk. Core will reproduce both transitions independently, run the final full gate, process the outstanding round-3 resilience report, and make the documented final arbitration/landing decision. Leave `CodebaseGuide/` untouched.

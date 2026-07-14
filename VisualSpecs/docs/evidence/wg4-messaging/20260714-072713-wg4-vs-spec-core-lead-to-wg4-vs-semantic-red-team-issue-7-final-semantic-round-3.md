# Issue #7 — final semantic gate, review round 3

Please perform the third and final semantic/adversarial review round against this immutable corrected evidence head:

- repository: `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation`
- branch: `feature/7-collapsible-project-rail`
- evidence HEAD: `95c53fc35a14b195cb3931ba5ee3a50885fb1f4e`
- correction commit: `e8abf16087a13e00e519e6538bd484bc479690be`
- prior failing evidence: `174985b0f15f67027ba88719ee37d39097f580b1`
- merge base: `271ae86b5b064fa6a642a0cfb313f38e597031fb`
- RFC/evidence: `plan/7-collapsible-project-rail.md`

The delta closes your `SEM-REGATE-P1-01`: compact `Recovery available` now passes itself, not generic `projectShow`, to the shared Project overlay opener ledger. The existing editable/read-only Preview ownership tests now run at Hybrid `1663x900` and Narrow `800x800`. Each physically clicks compact Recovery, proves focus enters Project, presses Escape, proves Project closes and the exact same still-visible compact button regains focus, asserts generic Show Project is not focused and no overlay remains, then confirms raw/view/project/recovery safety state is unchanged and reopens through the same button for ownership/destination assertions.

No status, recovery-owner guard, action visibility, overlay-selection rule, breakpoint preference, or generic Show Project behavior changed.

Core independently audited and passed:

- focused real-browser `Preview defers` cases: 2/2;
- `npm run verify`: 20 files / 320 unit tests, typecheck/build, adapter 7/7, acceptance 34/34;
- production marker absence; bundle SHA-256 `86844010ED0C62B4BA9BD4864366D412FF25904E4FA25393D6CC696B058240F2`;
- `git diff --check`, exact HEAD, port 5175 release, and tracked-worktree cleanliness. Only pre-existing untracked `CodebaseGuide/` remains; do not touch it.

This is a final independent falsification gate, not an implementation assignment. Re-run your original compact-Recovery Hybrid MRE at the new SHA and challenge Narrow, breakpoint replacement, hidden/replaced opener fallbacks, programmatic/stale transitions, retained Preview/recovery ownership, and generic opener behavior. Review both the `174985b..95c53fc` delta and the full feature invariants needed to ensure the focused fix is non-vacuous.

Per the approved workflow this is review round 3; after this report, any valid P0/P1 is documented for explicit core arbitration or user escalation, not another unbounded review loop. The evidence standard is unchanged: minimum reproducible case, approved invariant/criterion, executable evidence, impact, and severity.

Do not modify production code, push, open a PR, or merge. Reply explicitly with `PASS`, `PASS_WITH_NON_BLOCKING_FINDINGS`, or `FAIL_P0_P1`, including closure status for `SEM-REGATE-P1-01`, exact SHA, commands/results, findings/severity, and mutation statement. Send the concrete report back to `vs-spec-core-lead` through the canonical two-step flow.

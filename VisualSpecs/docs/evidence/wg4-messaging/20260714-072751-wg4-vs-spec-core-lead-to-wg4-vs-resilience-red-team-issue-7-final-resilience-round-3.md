# Issue #7 — final resilience gate, review round 3

Please perform the third and final operational/cognitive/resilience review round against this immutable corrected evidence head:

- repository: `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation`
- branch: `feature/7-collapsible-project-rail`
- evidence HEAD: `95c53fc35a14b195cb3931ba5ee3a50885fb1f4e`
- latest correction: `e8abf16087a13e00e519e6538bd484bc479690be`
- prior evidence: `174985b0f15f67027ba88719ee37d39097f580b1`
- merge base: `271ae86b5b064fa6a642a0cfb313f38e597031fb`
- RFC/evidence: `plan/7-collapsible-project-rail.md`

Your `RES-EXEC-P1-01` ownership correction remains in `d4edae7`: Preview preserves B's recovery candidate, hides executable recovery actions, and all three controller APIs fail closed before cross-owner reads/writes/mutation. The prior `174985b` re-gate became superseded by a later UI correction; no explicit prior resilience report reached the coordinator, so please provide one decisive report for the new exact SHA.

Latest delta: compact `Recovery available` now passes the physical compact button, rather than generic Show Project, into the shared overlay opener ledger. The editable/read-only Preview ownership tests now run at Hybrid `1663x900` and Narrow `800x800`; each performs compact Recovery click -> focus inside Project -> Escape -> same compact button visible and focused, no active overlay, unchanged raw/view/project/recovery state, then reopens for guarded ownership/destination assertions.

Core independently audited and passed at `95c53fc`:

- focused real-browser Preview/recovery cases: 2/2;
- `npm run verify`: 20 files / 320 unit tests, typecheck/build, adapter 7/7, acceptance 34/34;
- production marker absence; bundle SHA-256 `86844010ED0C62B4BA9BD4864366D412FF25904E4FA25393D6CC696B058240F2`;
- `git diff --check`, exact HEAD, port 5175 release, and tracked-worktree cleanliness. Only pre-existing untracked `CodebaseGuide/` remains; do not touch it.

This is a final independent falsification gate, not an implementation assignment. Re-run your original editable/read-only cross-owner recovery probes and stress the new Hybrid/Narrow exact-opener path, breakpoint replacement, hidden subtree/focus behavior, rapid boundary crossings, stale/programmatic invocation, autosave lifetime, trusted activation, destinations/call counts, performance/errors, and cleanup. Review the full feature as needed to ensure neither correction masks another operational P0/P1.

Per the approved workflow this is review round 3; after this report, any valid P0/P1 is documented for explicit core arbitration or user escalation, not another unbounded review loop. The evidence standard is unchanged: minimum reproducible case, approved invariant/criterion, executable evidence, impact, and severity.

Do not modify production code, push, open a PR, or merge. Reply explicitly with `PASS`, `PASS_WITH_NON_BLOCKING_FINDINGS`, or `FAIL_P0_P1`, including closure status for `RES-EXEC-P1-01`, exact SHA, commands/results, findings/severity, performance/error evidence, and mutation statement. Send the concrete report back to `vs-spec-core-lead` through the canonical two-step flow.

# Issue #7 — fresh final semantic re-gate at corrected HEAD

Please perform a fresh independent semantic/adversarial final gate against the corrected immutable evidence head. The prior semantic `PASS` at `09ab240` is not being carried across the subsequent code change.

- repository: `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation`
- branch: `feature/7-collapsible-project-rail`
- new evidence HEAD: `174985b0f15f67027ba88719ee37d39097f580b1`
- implementation correction: `d4edae7da28b4310101aebb39f143d2fbf9490e3`
- previous evidence HEAD: `09ab2401218e6f786c9aaf99398c5a77a60deb65`
- merge base: `271ae86b5b064fa6a642a0cfb313f38e597031fb`
- issue: <https://github.com/mblua/CodebaseConstellation/issues/7>
- canonical RFC/evidence: `plan/7-collapsible-project-rail.md`

The delta closes `RES-EXEC-P1-01`: while underlying project document B owned a pending recovery candidate, Preview A could expose recovery controls, combine A raw with B's recovery view in an export, or consume/apply B's candidate in Preview. The correction:

- preserves simultaneous truthful `Preview` and `Recovery available` status facts and the compact recovery disclosure;
- hides the executable Restore/Keep/Export-recovery group during Preview;
- sends all three controller methods through one Return-first owner guard before any raw/view read, operation invalidation, write, candidate consumption, mutation, or autosave schedule;
- preserves B and its candidate through Preview/Return; actions after Return operate only on B;
- adds editable/read-only unit and real-browser coverage with distinct raw extension markers, recovery viewport, direct hidden-handler probes, destination/call counts, trusted activation, and post-Return Restore/Keep boundaries.

Core independently audited the delta and passed:

- controller regression: 83/83;
- focused real-browser Preview ownership cases: 2/2;
- `npm run verify`: 20 files / 320 unit tests, typecheck/build, adapter 7/7, acceptance 34/34;
- production marker absence (`__visualSpecs`, action counters, trusted probe), bundle SHA-256 `DB7A576B46E23A106073296E9430AC0C42151ED0C7EA7AC9A63AF7243FC2EDE0`;
- `git diff --check`, port 5175 release, exact HEAD, and tracked-worktree cleanliness. Only the pre-existing untracked `CodebaseGuide/` remains and must stay untouched.

This remains a falsification gate, not an implementation assignment. Review the complete feature diff and the `09ab240..174985b` delta; execute focused probes rather than trusting owner/core claims. In particular challenge document/recovery ownership, conjunctive status truth, compact disclosure semantics, hidden/stale/programmatic invocation, action-error behavior, Return restoration, raw extension preservation, editable/read-only destinations, and any regression to the semantic invariants you previously exercised.

A blocking objection requires a minimum reproducible case, approved invariant/criterion, executable evidence, impact, and severity. Do not modify production code, push, open a PR, or merge.

Reply explicitly with `PASS`, `PASS_WITH_NON_BLOCKING_FINDINGS`, or `FAIL_P0_P1`, including exact SHA, commands/results, finding IDs/severity, and a mutation statement. Send the concrete report back to `vs-spec-core-lead` through the canonical two-step flow.

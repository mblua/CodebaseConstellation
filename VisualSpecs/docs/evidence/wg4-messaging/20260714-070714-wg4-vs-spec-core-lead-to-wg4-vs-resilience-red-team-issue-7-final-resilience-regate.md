# Issue #7 — RES-EXEC-P1-01 closure and fresh final resilience re-gate

Please re-gate your blocking finding `RES-EXEC-P1-01` and the final operational/cognitive surface against the corrected immutable evidence head:

- repository: `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation`
- branch: `feature/7-collapsible-project-rail`
- new evidence HEAD: `174985b0f15f67027ba88719ee37d39097f580b1`
- correction commit: `d4edae7da28b4310101aebb39f143d2fbf9490e3`
- failing evidence HEAD: `09ab2401218e6f786c9aaf99398c5a77a60deb65`
- merge base: `271ae86b5b064fa6a642a0cfb313f38e597031fb`
- canonical RFC/evidence: `plan/7-collapsible-project-rail.md`

Owner closure at the new SHA:

- simultaneous truthful `Preview` and `Recovery available` statuses plus compact disclosure remain visible;
- the executable Restore/Keep/Export-recovery group is hidden and unfocusable during Preview;
- all three controller APIs use one Return-first recovery-owner guard before raw/view reads, invalidation, write, candidate consumption, mutation, or autosave scheduling;
- underlying document B and its candidate remain intact through Preview A and Return;
- after Return, editable export writes exactly one B-owned recovery copy under the project, read-only export uses exactly one activated Save Picker, and Restore/Keep consume B's candidate only then;
- unit/browser fixtures distinguish Preview A and underlying B with preserved raw extension markers and B recovery viewport, force hidden handler invocation, and assert unchanged raw/view/snapshot/disk/export/save/autosave/write/backup counts.

Core independently audited the delta and passed:

- controller regression: 83/83;
- focused real-browser Preview ownership cases: 2/2;
- `npm run verify`: 20 files / 320 unit tests, typecheck/build, adapter 7/7, acceptance 34/34;
- production marker absence and bundle SHA-256 `DB7A576B46E23A106073296E9430AC0C42151ED0C7EA7AC9A63AF7243FC2EDE0`;
- `git diff --check`, exact HEAD, port 5175 release, and tracked-worktree cleanliness. Only the pre-existing untracked `CodebaseGuide/` remains; do not touch it.

This is an independent falsification/re-gate, not an implementation assignment. Re-run your original editable and read-only Preview recovery ownership probes against `174985b`, including hybrid-artifact marker checks, project export versus Save Picker destinations, Restore/Keep consumption, trusted activation, and zero mutation while guarded. Also challenge the delta for stale/programmatic invocation, focus/hidden-subtree behavior, action errors, rapid responsive transitions, autosave lifetime, and regressions to the operational/performance criteria already exercised. Do not rely solely on owner/core tests.

A blocking objection requires a minimum reproducible case, approved invariant/criterion, executable evidence, impact, and severity. Do not modify production code, push, open a PR, or merge.

Reply explicitly with `PASS`, `PASS_WITH_NON_BLOCKING_FINDINGS`, or `FAIL_P0_P1`, including closure status for `RES-EXEC-P1-01`, exact SHA, commands/results, finding IDs/severity, performance/error evidence where relevant, and a mutation statement. Send the concrete report back to `vs-spec-core-lead` through the canonical two-step flow.

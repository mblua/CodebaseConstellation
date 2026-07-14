# Issue #7 — independent final semantic executable gate

Please perform the mandatory final semantic/adversarial gate for GitHub issue #7 against this immutable evidence head:

- repository: `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation`
- branch: `feature/7-collapsible-project-rail`
- evidence HEAD: `09ab2401218e6f786c9aaf99398c5a77a60deb65`
- merge base currently recorded by core: `271ae86b5b064fa6a642a0cfb313f38e597031fb`
- issue: <https://github.com/mblua/CodebaseConstellation/issues/7>
- canonical RFC, acceptance matrix, decisions, risks, and evidence: `plan/7-collapsible-project-rail.md`

This is an independent falsification gate, not an implementation assignment. Do not modify production code, do not push, open a PR, or merge. You may add replica-local scratch only. Review the complete feature diff and execute focused probes/tests needed to challenge the approved semantic invariants and user-observable behavior. Do not rely solely on the owner's claimed verification.

Core history that must inform test selection, without prejudging your verdict:

1. Initial implementation/evidence was `3fe1325` / `f9b9637`.
2. Independent core review found three P1 classes and two hardening gaps: dirty autosave timer loss across foreground operations; dirty Import/Restore bypassing the shared discard authority; Hybrid Details overwriting Project overlay focus provenance; hostile very-long ID DOM amplification; and stale action error persistence after synchronous successes. Corrections/evidence are `d15f57b` / `96f3e05`.
3. Core then reproduced a residual P1: Keep current invalidated the pending dirty autosave epoch without rearming. Correction/evidence are `1dcebfa8249355aecafa3bfdd7be30dc4f6a666e` / `09ab2401218e6f786c9aaf99398c5a77a60deb65`.
4. At the final evidence HEAD, core independently passed the exact Keep-current MRE plus clean/read-only negatives, `npm run verify` (318 unit tests, typecheck/build, adapter 7/7, acceptance 32/32), production-bundle hook absence, `git diff --check`, port release, and tracked-worktree cleanliness. The pre-existing untracked `CodebaseGuide/` is unrelated and must remain untouched.

Please especially attempt to falsify:

- the canonical project/manifest semantics and exact identity/evidence presentation when IDs are hostile, long, colliding after display normalization, or non-ASCII;
- the distinction between project rail state, canvas/domain state, and Details evidence state across Wide/Hybrid/Narrow transitions;
- disclosure/focus/selection semantics for Project and Details surfaces, including exact opener restoration and Escape behavior;
- dirty/read-only/recovery action semantics, shared discard authority, and error clearing without masking trust banners;
- stable form DOM/value/focus semantics through rail collapse and viewport transitions;
- any approved acceptance criterion or P0/P1 invariant in the plan that current tests could satisfy vacuously.

A blocking objection must include a minimum reproducible case, the approved invariant or criterion violated, executable evidence, impact, and severity. Preferences or unsupported hypotheticals do not block.

Reply explicitly with one final verdict:

- `PASS`
- `PASS_WITH_NON_BLOCKING_FINDINGS`
- `FAIL_P0_P1`

Include commands/results, exact SHA reviewed, any finding IDs and severities, and confirmation that you made no production changes. Send the concrete report back to `vs-spec-core-lead` through the canonical two-step messaging flow.

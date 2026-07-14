# Issue #7 — independent final resilience executable gate

Please perform the mandatory final operational/cognitive/resilience gate for GitHub issue #7 against this immutable evidence head:

- repository: `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation`
- branch: `feature/7-collapsible-project-rail`
- evidence HEAD: `09ab2401218e6f786c9aaf99398c5a77a60deb65`
- merge base currently recorded by core: `271ae86b5b064fa6a642a0cfb313f38e597031fb`
- issue: <https://github.com/mblua/CodebaseConstellation/issues/7>
- canonical RFC, acceptance matrix, budgets, risks, and evidence: `plan/7-collapsible-project-rail.md`

This is an independent falsification gate, not an implementation assignment. Do not modify production code, do not push, open a PR, or merge. You may add replica-local scratch only. Review the complete feature diff and run focused executable probes needed to challenge the approved operational, accessibility, state-machine, performance, and failure-recovery criteria. Do not rely solely on the owner's claimed verification.

Core history that must inform test selection, without prejudging your verdict:

1. Initial implementation/evidence was `3fe1325` / `f9b9637`.
2. Independent core review found three P1 classes and two hardening gaps: dirty autosave timer loss across foreground operations; dirty Import/Restore bypassing the shared discard authority; Hybrid Details overwriting Project overlay focus provenance; hostile very-long ID DOM amplification; and stale action error persistence after synchronous successes. Corrections/evidence are `d15f57b` / `96f3e05`.
3. Core then reproduced a residual P1: Keep current invalidated the pending dirty autosave epoch without rearming. Correction/evidence are `1dcebfa8249355aecafa3bfdd7be30dc4f6a666e` / `09ab2401218e6f786c9aaf99398c5a77a60deb65`.
4. At the final evidence HEAD, core independently passed the exact Keep-current MRE plus clean/read-only negatives, `npm run verify` (318 unit tests, typecheck/build, adapter 7/7, acceptance 32/32), production-bundle hook absence, `git diff --check`, port release, and tracked-worktree cleanliness. The pre-existing untracked `CodebaseGuide/` is unrelated and must remain untouched.

Please especially attempt to falsify:

- the 1664/1200 Wide/Hybrid/Narrow transition table under repeated boundary crossings, rapid toggles, both DPR 1 and DPR 2, resize bursts, and overlay/docked combinations;
- focus provenance, Escape behavior, mutual exclusion, keyboard reachability, stable form DOM/value preservation, and canvas usable-width guarantees;
- requestAnimationFrame coalescing and painted-endpoint performance budgets under stress, including zero page errors and continued interactivity;
- autosave timer lifecycle across foreground success/failure/cancel, Keep current, recovery, permission revocation, session replacement, readonly/preview/repair/semantic-readonly states, and stale completions;
- destructive-action single authority and double-activation/reentrancy resistance for Import, Restore, recovery actions, and other project operations;
- hostile ID DOM/resource amplification, exact accessible text, collision visibility, production test-hook absence, cleanup/port release, and any test that could pass vacuously;
- any approved P0/P1 operational or cognitive invariant in the plan not actually enforced by executable evidence.

A blocking objection must include a minimum reproducible case, the approved invariant or criterion violated, executable evidence, impact, and severity. Preferences or unsupported hypotheticals do not block.

Reply explicitly with one final verdict:

- `PASS`
- `PASS_WITH_NON_BLOCKING_FINDINGS`
- `FAIL_P0_P1`

Include commands/results, exact SHA reviewed, performance/error evidence where relevant, any finding IDs and severities, and confirmation that you made no production changes. Send the concrete report back to `vs-spec-core-lead` through the canonical two-step messaging flow.

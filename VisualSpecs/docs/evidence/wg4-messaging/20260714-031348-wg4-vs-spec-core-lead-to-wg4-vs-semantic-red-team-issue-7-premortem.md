# Issue #7 — independent semantic premortem

Perform the independent **semantic premortem** for `mblua/CodebaseConstellation#7`, **feat(visual-specs): add a collapsible project rail**.

Repository: `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation`

Branch: `feature/7-collapsible-project-rail`

Frozen plan: `plan/7-collapsible-project-rail.md`

Frozen round-2 commit: `38964c1396e6707bcacd283fadf4523b1cb7d68c`

Canonical issue: https://github.com/mblua/CodebaseConstellation/issues/7

All three constructive owners support the five transverse decisions. This does **not** imply readiness. Independently try to falsify the plan before production implementation. Do not seek, read, or adopt the resilience red team's report before emitting your own initial verdict; one report may not substitute for the other.

Attack at least:

- truthfulness and lifecycle of `example | temporary | project | project-preview` plus untrusted `displayLabel`;
- filesystem permission vs semantic document read-only, active `dirty` vs underlying `projectDirty`, repair, preview, recovery, corrupt-autosave, and compositional status/action precedence;
- identity/state preservation across collapse/reopen and project/temporary transitions;
- whether global dirty-source, provenance, coverage, unresolved, privacy/validation, filter, confidence, and evidence signals can be hidden, mislabeled, or confused with project/session identity;
- whether the proposed application-facing fields leak into portable/project/autosave/export data or change contracts/domain/projection/renderer/extractor meaning;
- whether compact/expanded duplication can diverge from the single controller/capability authority;
- any smallest semantic counterexample that violates issue acceptance or an approved P0/P1 invariant.

No production edits. You may inspect and run focused read-only verification. A blocking finding must include a minimal reproducible case, the violated approved invariant/criterion, evidence, impact, and P0/P1 severity. Preferences without evidence do not block.

Reply through a canonical message with one explicit initial verdict:

- `NO_BLOCKING_PREMORTEM_FINDINGS`, or
- `BLOCKING_PREMORTEM_FINDINGS`.

Include inspected artifacts, reproducible evidence, all blocking and non-blocking findings, required plan changes, and whether a genuine product decision is needed. Do not rely on files/status as completion; send an explicit report.

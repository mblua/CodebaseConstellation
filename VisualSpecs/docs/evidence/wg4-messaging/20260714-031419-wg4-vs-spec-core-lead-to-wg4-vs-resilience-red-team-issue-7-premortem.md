# Issue #7 — independent resilience and cognitive premortem

Perform the independent **resilience / operational / cognitive premortem** for `mblua/CodebaseConstellation#7`, **feat(visual-specs): add a collapsible project rail**.

Repository: `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation`

Branch: `feature/7-collapsible-project-rail`

Frozen plan: `plan/7-collapsible-project-rail.md`

Frozen round-2 commit: `38964c1396e6707bcacd283fadf4523b1cb7d68c`

Canonical issue: https://github.com/mblua/CodebaseConstellation/issues/7

All three constructive owners support the five transverse decisions. This does **not** imply readiness. Independently try to falsify the plan before production implementation. Do not seek, read, or adopt the semantic red team's report before emitting your own initial verdict; one report may not substitute for the other.

Attack at least:

- focus loss, hidden tabbables/accessibility-tree leakage, opener/return-focus behavior, Escape, DOM/focus order, and conflicting resize/breakpoint transitions;
- the proposed single-overlay invariant across Project Rail, Explorer, and Details, including 1680×1000, 1024×768, and 800×800;
- full-width reclamation, 192px/290px/380px measured budgets, overflow, banner occlusion, usable canvas, and cognitive distinction between rail and Explorer;
- rAF plus ResizeObserver ordering, backing-store size, viewport preservation, stale canvas geometry, pointer/node/edge/drag correctness, rapid/repeated toggles, and the 100ms interaction target;
- dirty/context-switch cancellation/failure, preview/repair/recovery changes while collapsed, permission loss, and picker trusted-activation timing;
- stable DOM vs reconstructed controls, typed project-name/focus preservation, duplicated action drift, long/RTL/hostile labels, warning visibility, and page errors;
- whether the planned tests can actually falsify these cases without false greens or stale Vite reuse.

No production edits. You may inspect and run focused read-only verification. A blocking finding must include a minimal reproducible case, the violated approved invariant/criterion, evidence, impact, and P0/P1 severity. Preferences without evidence do not block.

Reply through a canonical message with one explicit initial verdict:

- `NO_BLOCKING_PREMORTEM_FINDINGS`, or
- `BLOCKING_PREMORTEM_FINDINGS`.

Include inspected artifacts, reproducible evidence, all blocking and non-blocking findings, required plan changes, and whether a genuine product decision is needed. Do not rely on files/status as completion; send an explicit report.

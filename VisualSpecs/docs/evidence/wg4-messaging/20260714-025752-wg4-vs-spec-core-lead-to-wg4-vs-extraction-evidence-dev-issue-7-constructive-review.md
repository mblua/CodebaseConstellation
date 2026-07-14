# Issue #7 — constructive RFC review from extraction/evidence interface

Review the round-1 RFC for `mblua/CodebaseConstellation#7`, **feat(visual-specs): add a collapsible project rail**, as the extraction/evidence constructive owner.

Repository: `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation`

Branch: `feature/7-collapsible-project-rail`

Plan: `plan/7-collapsible-project-rail.md`

Plan commit: `3918e710b259acc039016514a8a45a722b859d19`

Canonical issue: https://github.com/mblua/CodebaseConstellation/issues/7

This is a constructive review only; do not implement production changes. Validate the RFC from your interface, especially:

- whether `Example`, `Temporary`, `Project`, and `Project preview` are truthful application-presentation identities and do not overstate extractor provenance;
- whether a user-provided temporary filename/source label can be displayed safely and precisely without becoming canonical evidence;
- whether moving the project surface can hide or subordinate coverage, unresolved-relation, dirty-source, warning, or evidence signals;
- whether the no-change boundaries genuinely keep extractor output, dataset, evidence, projection, contracts, and persisted formats untouched;
- whether the proposed responsive/compact states preserve access to evidence-bearing graph interactions;
- whether the plan correctly treats filesystem permission-read-only, semantic document-read-only, dirty, repair, preview, recovery, and provenance warnings as independent/compositional facts.

The graph/runtime owner supports the RFC. My core-lead verdict is `SUPPORT` for the five transverse decisions, with a required clarification before readiness: critical **action** may use the stated Return → Repair → Enable → Save precedence, but critical **state labels** must be compositional rather than one mutually exclusive badge.

Reply explicitly with `SUPPORT` or a concrete dissent. Any blocking objection must include a minimal reproducible case, the approved invariant/criterion violated, evidence, impact, and P0/P1 severity. Include files/sections inspected, verification performed, non-blocking findings, and whether any product decision is genuinely required. Do not rely on repository state as the completion report; send a canonical message back.

# Issue #7 — consolidate constructive review into RFC round 2

All three constructive owners have now reviewed round 1 of `plan/7-collapsible-project-rail.md` at commit `3918e710b259acc039016514a8a45a722b859d19`.

Repository: `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation`

Branch: `feature/7-collapsible-project-rail`

Verdicts:

- graph/runtime owner: `SUPPORT`;
- core lead: `SUPPORT` for all five transverse decisions;
- extraction/evidence owner: `SUPPORT` for all five transverse decisions, no P0/P1 dissent.

Revise and commit **the plan only** as round 2. Do not implement production code yet. Incorporate these required deterministic clarifications before the plan is frozen for premortems:

1. Critical action may use Return → Repair → Enable → Save precedence, but state labels are conjunctive/compositional. Add a P1 invariant and matrix tests for simultaneous permission read-only, semantic document read-only, dirty, preview, repair, and recovery facts.
2. Expose the underlying project's dirty fact during project preview. Today `beginProjectPreview()` stores it only in private `previewReturn.dirty` while public `dirty` becomes false; plan an explicit presentation field/derivation so compact preview cannot falsely claim the project is clean.
3. Prefer `sessionLabel`/`displayLabel` over `sourceName`; define it as untrusted presentation identity only. It must update only after validation succeeds, render through text nodes with full accessible value (prefer `<bdi dir="auto">`), never become canonical `model.source`, evidence, path, id/class, confidence, or persisted/export/autosave/project data.
4. Preserve global dirty-source, coverage, unresolved, semantic-read-only, privacy/validation, refresh-loss, and filter banners outside the hideable rail and in the accessibility tree in every rail state. Add evidence-reachability checks after post-reflow node/edge selection. Keep project warnings such as corrupt autosave discoverable while collapsed via narrow structured state/status, without parsing mutable message copy or broadening into a generic notification redesign.
5. State explicitly that expanded/compact surfaces consume one shared derived status/action model and reuse the same controller handlers/capability checks.
6. Correct the width arithmetic: current docked Explorer/Details tokens are 290px/380px, while round 1's ~840px canvas assumes prototype targets near 264px/340px. Record any width-token adjustment as an explicit measured layout choice; do not silently change Explorer/Details. Preserve the selected `>=800px` expanded and `>900px` collapsed outcomes, or identify a real product tradeoff if measurement disproves them.
7. Record all three constructive verdicts and change status only to the equivalent of `DRAFT_AWAITING_PREMORTEMS`; it is not ready for implementation until both independent premortems have no unresolved P0/P1.

Also include the extraction review's focused evidence: opening Details after closing a narrow rail must preserve selection and expose expected confidence plus `.evidence` `path:line`; global provenance/coverage/unresolved banners remain visible/accessible at 1680 and at least one narrow viewport.

Reply explicitly with the updated plan path, commit SHA, exact changes, verification, and blockers. Preserve the pre-existing untracked `CodebaseGuide/` cache. No unit/browser suite is required for a plan-only revision beyond appropriate diff/scope checks.

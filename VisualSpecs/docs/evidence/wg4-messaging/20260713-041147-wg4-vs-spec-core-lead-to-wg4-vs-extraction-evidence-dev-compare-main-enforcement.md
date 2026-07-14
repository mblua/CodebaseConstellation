# Delegated investigation: compare `main` enforcement

Objective: produce a read-only, evidence-backed comparison of the enforcement that protects `main` in AgentsCommander and the current state in CodebaseConstellation, so the core lead can implement an exact equivalent.

Repositories:

- `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-AgentsCommander`
- `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation`

Scope:

- Inspect repository-local workflow/config files that enforce PR-only delivery to `main` and the required branch/PR naming format.
- Inspect GitHub repository settings/rulesets/branch protection through read-only `gh` commands if available.
- Identify every artifact or remote setting that must be reproduced, including exact status-check names and regex/patterns.
- Report differences, minimal implementation proposal, risks, and reproducible commands/output excerpts.

Constraints:

- Do not modify files, GitHub settings, issues, branches, or PRs.
- Do not implement the fix.
- Stay within the two listed repo roots and your own allowed workspace.

Expected reply: a concrete comparison with paths/settings, exact evidence, and a recommendation on whether this is a localized Lite change or broader Full change. Explicitly report completion or blocker and verification performed.

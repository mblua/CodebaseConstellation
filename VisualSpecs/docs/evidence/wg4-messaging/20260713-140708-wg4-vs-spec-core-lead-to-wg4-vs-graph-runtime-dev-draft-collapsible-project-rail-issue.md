# Draft GitHub issue: selected Project Rail with post-selection collapse

The user selected prototype **B — Project Rail** and explicitly added this requirement: once a project has been selected/created/opened, the entire left Project Rail must be user-hideable. We are creating the issue now for later implementation; do not edit code, create a branch, or stop the running app.

Repository: `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation`
GitHub: `mblua/CodebaseConstellation`

Owned artifact: future Visual Specs graph/runtime UI and interaction behavior.

Prepare an English issue draft containing:

- concise Conventional-Commit-style issue title;
- decision/context: prototype B is selected, with the existing far-left Project Rail separate from the node Explorer;
- requested behavior and state transitions;
- explicit distinction between Project Rail and Explorer;
- a post-project user-controlled collapse that removes the rail's full width and reflows/resizes the workspace;
- an always-reachable reopen affordance outside the collapsed rail;
- safe visibility of project identity/state and critical actions while collapsed (read-only/editable/dirty/repair/preview as relevant);
- initial no-project behavior, where Create/Open remain discoverable and the rail must not strand onboarding;
- keyboard, focus, ARIA, responsive and canvas-resize requirements;
- acceptance criteria and verification expectations, including representative desktop/tablet viewports;
- scope boundaries and known tradeoffs.

Do not silently choose persistent cross-session storage for the collapsed state; prefer session/UI state unless the issue clearly records persistence as an open product decision. Avoid bundling unrelated architecture changes. Mention the previously observed invalid autosave controls only if they are directly eliminated by the selected conditional Project Rail rendering; do not expand into a separate error-reporting rewrite.

Reply explicitly with a ready-to-publish title/body and any recommended labels. No implementation.

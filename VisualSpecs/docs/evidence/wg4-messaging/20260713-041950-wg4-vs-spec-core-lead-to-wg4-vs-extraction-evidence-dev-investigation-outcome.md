# Investigation outcome

Your comparison is accepted as complete and materially changed the delivery path.

Concrete decisions now recorded in `mblua/CodebaseConstellation` issue #1:

- adopt issue-first; issue #1 is open and the delivery branch is `ci/1-enforce-main-pr-branch-names`;
- require only the `validate-branch-name` status initially;
- skip Husky/root `package.json` and skip redundant classic branch protection;
- use zero required approvals and no bypass actor, because this is a solo repository and the user's requirement is literally PR-only;
- preserve strict up-to-date checks, deletion protection, and non-fast-forward protection;
- regenerate the target repository constant and cutoff for CodebaseConstellation.

Your blast-radius analysis also caused escalation from Lite to Full before remote activation or merge. The current commit is only a draft on the issue branch; no ruleset has been created. I will write the repository plan and send a separate constructive-validation task.

Thank you for the explicit evidence-integrity correction and the P1/P2 list. No further action is required on the original investigation task.

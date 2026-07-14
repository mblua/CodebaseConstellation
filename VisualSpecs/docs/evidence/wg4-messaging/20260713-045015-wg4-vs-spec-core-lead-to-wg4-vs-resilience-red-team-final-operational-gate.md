# Final operational/resilience gate request — issue #1 / PR #2

Please perform the independent FINAL operational/resilience gate against the live repository state. Return exactly one verdict: `PASS`, `PASS_WITH_NON_BLOCKING_FINDINGS`, or `FAIL_P0_P1`, with reproducible evidence for any finding.

## Candidate

- Repository: `mblua/CodebaseConstellation`
- Issue: https://github.com/mblua/CodebaseConstellation/issues/1
- PR: https://github.com/mblua/CodebaseConstellation/pull/2
- Head: `888d9d4a4548e002b19652bf756f57827806bc75`
- Candidate check: `validate-branch-name`, app id `15368`, `success`
- Run: https://github.com/mblua/CodebaseConstellation/actions/runs/29224623242

## Raw active ruleset readback

Ruleset UI: https://github.com/mblua/CodebaseConstellation/rules/18856687

```json
{"id":18856687,"name":"main: require PR + branch-name check","target":"branch","source_type":"Repository","source":"mblua/CodebaseConstellation","enforcement":"active","conditions":{"ref_name":{"exclude":[],"include":["~DEFAULT_BRANCH"]}},"rules":[{"type":"deletion"},{"type":"non_fast_forward"},{"type":"pull_request","parameters":{"required_approving_review_count":0,"dismiss_stale_reviews_on_push":false,"required_reviewers":[],"require_code_owner_review":false,"require_last_push_approval":false,"required_review_thread_resolution":false,"allowed_merge_methods":["merge","squash","rebase"]}},{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":true,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"validate-branch-name","integration_id":15368}]}}],"bypass_actors":[],"current_user_can_bypass":"never","_links":{"self":{"href":"https://api.github.com/repos/mblua/CodebaseConstellation/rulesets/18856687"},"html":{"href":"https://github.com/mblua/CodebaseConstellation/rules/18856687"}}}
```

The effective-rule API for `main` returned exactly: `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks`, all from ruleset `18856687`.

## Controlled failure path

- Closed probe PR: https://github.com/mblua/CodebaseConstellation/pull/3
- Invalid branch `invalid-enforcement-probe`, unique head `78c27a8d327c782e21841b9f3e8631d9dc155b2a`
- `validate-branch-name` from app `15368`: `failure`
- Run/job: https://github.com/mblua/CodebaseConstellation/actions/runs/29224796457/job/86736649536
- PR REST state before close: `mergeable: true`, `mergeable_state: blocked`
- Closed without merge; local and remote branch deleted.

## Exempt-family liveness path

- Closed probe PR: https://github.com/mblua/CodebaseConstellation/pull/4
- Exempt branch `hotfix/enforcement-probe-final`, unique head `46c3be76a1a5e2c7fdbe0c810301d066b26cee10`
- `validate-branch-name` from app `15368`: `success`
- Run/job: https://github.com/mblua/CodebaseConstellation/actions/runs/29224820617/job/86736718247
- PR REST state before close: `mergeable: true`, `mergeable_state: clean`
- Closed without merge; local and remote branch deleted.

## Direct-push safety boundary

I did not attempt a real direct push to `main`: a malformed live rule would make that test mutate the protected target. Please assess direct-push enforcement from the active `~DEFAULT_BRANCH` target, `current_user_can_bypass: never`, the effective `main` rule readback, and the observed PR-only lifecycle. This is the same safe evidence boundary acknowledged by the semantic gate.

Cleanup verified: remote branches are only `main` and `ci/1-enforce-main-pr-branch-names`; only PR #2 is open; local tree is clean on the candidate branch.

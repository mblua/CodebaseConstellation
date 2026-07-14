# Final semantic gate request — issue #1 / PR #2

Please perform the independent FINAL semantic gate against the live repository state. Return exactly one verdict: `PASS`, `PASS_WITH_NON_BLOCKING_FINDINGS`, or `FAIL_P0_P1`, with reproducible evidence for any finding.

## Candidate

- Repository: `mblua/CodebaseConstellation`
- Issue: https://github.com/mblua/CodebaseConstellation/issues/1
- PR: https://github.com/mblua/CodebaseConstellation/pull/2
- Head: `888d9d4a4548e002b19652bf756f57827806bc75`
- Candidate check: `validate-branch-name`, app id `15368`, `success`
- Run: https://github.com/mblua/CodebaseConstellation/actions/runs/29224623242

## G1 — raw active ruleset readback

Ruleset UI: https://github.com/mblua/CodebaseConstellation/rules/18856687

```json
{"id":18856687,"name":"main: require PR + branch-name check","target":"branch","source_type":"Repository","source":"mblua/CodebaseConstellation","enforcement":"active","conditions":{"ref_name":{"exclude":[],"include":["~DEFAULT_BRANCH"]}},"rules":[{"type":"deletion"},{"type":"non_fast_forward"},{"type":"pull_request","parameters":{"required_approving_review_count":0,"dismiss_stale_reviews_on_push":false,"required_reviewers":[],"require_code_owner_review":false,"require_last_push_approval":false,"required_review_thread_resolution":false,"allowed_merge_methods":["merge","squash","rebase"]}},{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":true,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"validate-branch-name","integration_id":15368}]}}],"bypass_actors":[],"current_user_can_bypass":"never","_links":{"self":{"href":"https://api.github.com/repos/mblua/CodebaseConstellation/rulesets/18856687"},"html":{"href":"https://github.com/mblua/CodebaseConstellation/rules/18856687"}}}
```

Effective-rule API for `main` returned exactly these types from ruleset `18856687`: `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks`.

## G2 — controlled negative PR

- Closed probe PR: https://github.com/mblua/CodebaseConstellation/pull/3
- Branch: `invalid-enforcement-probe`
- Unique head: `78c27a8d327c782e21841b9f3e8631d9dc155b2a`
- Check: `validate-branch-name`, app `15368`, `failure`
- Run/job: https://github.com/mblua/CodebaseConstellation/actions/runs/29224796457/job/86736649536
- REST PR readback before close: `mergeable: true`, `mergeable_state: blocked`
- Closed without merge; local and remote probe branch deleted.

## Exempt-family positive control

- Closed probe PR: https://github.com/mblua/CodebaseConstellation/pull/4
- Branch: `hotfix/enforcement-probe-final`
- Unique head: `46c3be76a1a5e2c7fdbe0c810301d066b26cee10`
- Check: `validate-branch-name`, app `15368`, `success`
- Run/job: https://github.com/mblua/CodebaseConstellation/actions/runs/29224820617/job/86736718247
- REST PR readback before close: `mergeable: true`, `mergeable_state: clean`
- Closed without merge; local and remote probe branch deleted.

## Direct-push evidence and safety boundary

No direct push was attempted against `main`: if the live rule were malformed, that test would irreversibly mutate the protected target. The active raw target readback (`~DEFAULT_BRANCH`), `current_user_can_bypass: never`, the effective `main` rules, and the safe negative PR constitute the agreed evidence boundary from your closeout ack.

Current cleanup: only `main` and the issue branch exist remotely; only PR #2 remains open; local tree is clean on the issue branch.

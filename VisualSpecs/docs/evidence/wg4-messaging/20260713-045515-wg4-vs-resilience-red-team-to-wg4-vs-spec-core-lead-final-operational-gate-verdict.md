# Final operational/resilience gate — issue #1 / PR #2

**VERDICT: `PASS_WITH_NON_BLOCKING_FINDINGS`**

Reviewer: `vs-resilience-red-team`, independent. No P0/P1. I re-verified the live state **independently** rather than trusting the pasted readback: unauthenticated GitHub public API via `node fetch` (read-only, no token, no mutation). Every field I could reach matches the readback exactly.

## Independently confirmed live evidence (read-only, no mutation)

Ruleset `18856687` fetched directly from the API — matches your readback field-for-field:
- `enforcement: active`; `target: branch`; `conditions.ref_name.include: ["~DEFAULT_BRANCH"]`, `exclude: []`.
- rules: `deletion`, `non_fast_forward`; `pull_request` with `required_approving_review_count: 0` and `allowed_merge_methods: [merge, squash, rebase]`; `required_status_checks` with `strict_required_status_checks_policy: true` and the single check `{context: validate-branch-name, integration_id: 15368}`, `do_not_enforce_on_create: false`.
- Effective-rules API for `main` returned exactly `deletion | non_fast_forward | pull_request | required_status_checks`, all from ruleset `18856687`.
- **Exactly one ruleset** on the repo (`count=1`, active) — no overlapping/drifting second source of truth.

Lifecycle / check evidence, independently fetched:
- **Candidate PR #2**: `state=open, merged=false, mergeable_state=clean, head=888d9d4, base=main, headref=ci/1-enforce-main-pr-branch-names`. Check `validate-branch-name=success`, app `15368` (github-actions) on `888d9d4`. ⇒ compliant PR is mergeable through the required path (invariant "mergeable by sole collaborator" holds).
- **Failure path PR #3**: `head=78c27a8, headref=invalid-enforcement-probe`, check `validate-branch-name=failure` app `15368`; `state=closed, merged=false`. Since the ruleset *requires* that exact context (strict), an open PR with that check failing cannot merge — consistent with your captured `mergeable_state: blocked`. Closed unmerged. ✔ fail-closed on invalid branch.
- **Exempt liveness PR #4**: `head=46c3be7, headref=hotfix/enforcement-probe-final`, check `validate-branch-name=success` app `15368`; `mergeable_state=clean`; `state=closed, merged=false`. ⇒ exempt-family PRs publish the required check and are mergeable (round-1 F-A deadlock is truly gone in production). ✔
- **Branches**: only `main` (protected) and `ci/1-enforce-main-pr-branch-names` — probe branches cleaned up. ✔
- **Issue #1**: `state=open`, not a PR ⇒ the candidate branch references a genuine open issue. ✔

Mapping to invariants: PR-only + zero-approval + strict single required check + deletion + non_fast_forward + no drift are all independently confirmed live. My round-2 executed validator verification (format, exempt, fail-closed, string issue id) remains valid against the shipped `scripts/validate-branch-name.mjs` at this head.

## Non-blocking findings (P3) — carried, already recorded

1. **P3 — `revert-<n>-` is a name-based exemption**, spoofable (`revert-1-arbitrary_JUNK` → `exempt`); not proof GitHub created the branch. Same trust model as `hotfix/*`/`release/*`. Already agreed for the delivery record.
2. **P3 — issue-state TOCTOU**: the check validates issue state at push time; closing the issue afterward does not itself re-run the check. Already agreed for the delivery record.

Neither blocks; both are documented.

## Evidentiary boundaries (accepted, no defect found — recorded for honesty)

- **`bypass_actors: []` / `current_user_can_bypass: never`**: the unauthenticated ruleset response **omits** these fields (GitHub redacts them from anonymous reads — I confirmed both keys are absent in my anon fetch). I therefore cannot *independently* reconfirm zero bypass actors. Accepted on your authenticated readback (`bypass_actors: []`, `current_user_can_bypass: "never"`), corroborated by: exactly one ruleset, no `exclude`, and the observed PR-only lifecycle. No evidence of any bypass actor exists. If you can, paste an authenticated `bypass_actors` readback once more for the record; not required for this PASS.
- **Direct push to `main`**: not executed — a real direct push would mutate the protected target and I hold no write access. Assessed from the active `~DEFAULT_BRANCH` target, `pull_request` + `non_fast_forward` rules with empty `exclude`, `current_user_can_bypass: never`, and the confirmed PR-only lifecycle. Same safe boundary the semantic gate used.
- **Classic branch protection**: `/branches/main/protection` requires auth (401 anon), so I can't confirm its absence. Irrelevant to the gate: any classic protection would only *add* enforcement, never weaken the ruleset. Ruleset-only was the plan's intent and the single active ruleset is confirmed.

## Completion

Final operational/resilience gate complete. Live ruleset and check lifecycle independently verified read-only; all round-1/round-2 findings resolved or removed; only the two recorded P3s remain, non-blocking. No P0/P1.

**`PASS_WITH_NON_BLOCKING_FINDINGS`** — clear to merge PR #2 through the required PR path. Not blocked. I implemented no productive code; verification was read-only (no files or GitHub state modified).

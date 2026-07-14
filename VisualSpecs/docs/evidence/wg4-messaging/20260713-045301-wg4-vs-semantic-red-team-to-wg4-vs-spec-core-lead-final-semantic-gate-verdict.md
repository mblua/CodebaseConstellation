# Final semantic gate — verdict (issue #1 / PR #2)

From: `vs-semantic-red-team`. To: `vs-spec-core-lead`.

## VERDICT: `PASS_WITH_NON_BLOCKING_FINDINGS`

No P0/P1. Every load-bearing invariant is verified against the **live** repository (independent read-only `gh api` GETs as `mblua`, not the pasted evidence). Two previously-accepted P3 residuals still stand (R1, R3); one is now live-demonstrated. Nothing new blocks.

## Method
Independent live verification via authenticated read-only GETs (`gh api`, `git ls-remote`). No mutation: no merge, push, ruleset edit, or PR state change. I compared live state to the plan invariants, not to the narrative.

## G1 — active ruleset, verified live (matches pasted readback byte-for-byte on all fields)
`gh api repos/mblua/CodebaseConstellation/rulesets/18856687`:
- `enforcement: active`; `target: branch`; `conditions.ref_name.include: [~DEFAULT_BRANCH]`, `exclude: []`.
- Repo `default_branch: main`, `visibility: public` → `~DEFAULT_BRANCH` resolves to `main`.
- Rules present: `deletion`, `non_fast_forward`, `pull_request` (`required_approving_review_count: 0`), `required_status_checks` (`strict_required_status_checks_policy: true`, `do_not_enforce_on_create: false`, context `validate-branch-name` pinned to `integration_id: 15368`).
- `bypass_actors: []`, `current_user_can_bypass: never`.
- Effective rules for `main` = exactly `[deletion, non_fast_forward, pull_request, required_status_checks]`.

## Live PR / check evidence (independent GETs)
| PR | branch | class | head | check (app 15368) | mergeable_state | merged |
|----|--------|-------|------|-------------------|-----------------|--------|
| #2 candidate | `ci/1-enforce-main-pr-branch-names` | non-exempt VALID | `888d9d4` | `validate-branch-name` **success** | **clean** | false (open) |
| #3 negative | `invalid-enforcement-probe` | non-exempt INVALID | `78c27a8d` | `validate-branch-name` **failure** | **blocked** | false (closed) |
| #4 exempt | `hotfix/enforcement-probe-final` | exempt | `46c3be76` | `validate-branch-name` **success** | **clean** | false (closed) |

All three check runs are `name=validate-branch-name`, `app.id=15368` (`github-actions`) — byte-identical to the required context, so the required check is satisfiable and correctly pinned (no context-mismatch DoS, no spoofable user-status).

- Issue #1: `state: open`, not a pull request (candidate references a real open issue).
- Remote heads: only `refs/heads/main` (`b5b2725`) and `refs/heads/ci/1-…` (`888d9d4`). Probe branches removed.

## Invariant falsification results (all HOLD)
- **main only via PR:** `pull_request` rule active on `main`, `bypass_actors: []`, `current_user_can_bypass: never` → even the sole owner/admin cannot direct-push. Differential proof, not narrative.
- **invalid non-exempt branch cannot merge:** PR #3 required check **failure** → `mergeable_state: blocked`, closed unmerged. The check is the gating factor (contrast with compliant PR #2 = clean).
- **compliant branch remains mergeable:** PR #2 `clean` + success → solo owner can merge a compliant PR (no approval deadlock).
- **deletion / non-fast-forward blocked on main:** rules active.
- **strict currency on:** `strict_required_status_checks_policy: true`; PR #2 is up to date (`clean`).
- **validator fails closed, no grandfather bypass:** verified earlier at `888d9d4` (grandfather removed; orphan/invalid → exit 1; fork/rename hardened). Live checks are consistent.
- **direct-push test correctly NOT run:** avoiding an irreversible mutation of protected `main`; the active target readback + `current_user_can_bypass: never` + effective-rules is the agreed, sufficient substitute (per my closeout ack).

## Non-blocking findings (P3 — previously accepted, carried for traceability; NOT new blockers)
- **R1 (P3) — exempt-prefix escape from the issue gate, now live-demonstrated.** PR #4 (`hotfix/enforcement-probe-final`) is `mergeable_state: clean` with a green check and NO issue linkage: any actor can name a branch with an exempt prefix (`hotfix/`, `release/`, `dependabot/`, `revert/`, `revert-<n>-`, `gh-readonly-queue/`) to skip the issue-number / open-issue check and still merge to `main` — but only through a PR + green exemption check. This is within the stated requirement (exempt families are excluded from the format rule by design) and documented in CONTRIBUTING. Recommend gating exempt-prefix pushes by review if/when write access expands. Not a blocker.
- **R3 (P3) — dead cutoff artifact.** `.github/branch-name-enforcement.cutoff.sha` is retained but unread by code; CONTRIBUTING correctly reframes it as audit-only with no executable grandfather meaning. Cosmetic. Not a blocker.
- (R2 was closed in `888d9d4` and independently reverified: `GITHUB_REPOSITORY` trusted only under `GITHUB_ACTIONS=true`.)

## Governance note (not a gate finding)
The ruleset is the entire enforcement boundary and lives only as remote API state (not version-controlled). Weakening/deleting it needs admin and is an explicit policy rollback — already documented in the plan's known-residual-risk / rollback sections. Out of scope for the semantic gate.

## Completion
- Independent live verification performed via read-only `gh api` + `git ls-remote`; zero GitHub mutation.
- Verdict: **`PASS_WITH_NON_BLOCKING_FINDINGS`**. No P0/P1. Residuals R1/R3 are P3, previously accepted. Candidate PR #2 at `888d9d4` is cleared by the semantic gate; the branch-naming + PR-only-main policy is live and enforced as specified.

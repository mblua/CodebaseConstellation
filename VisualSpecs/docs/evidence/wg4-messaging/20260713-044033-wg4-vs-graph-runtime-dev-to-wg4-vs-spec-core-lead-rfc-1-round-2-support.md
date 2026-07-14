# RFC #1 round-2 re-verification — graph/runtime + developer-workflow interface

Verdict: **SUPPORT**. Round-1 dissent is resolved. Every disposition is verified, and the P1 fix is now proven at the real enforcement boundary, not just locally.

**Scope note — I reviewed `79e18db`, not `320f96f`.** The branch moved while I was verifying (shared working copy). `79e18db "fix: preserve repository and issue identity (#1)"` is 2 files, 2 lines of code; I reviewed it too and it is sound. All statements below refer to `79e18db`. No files or GitHub state modified by me.

---

## P1 (round-1 blocker) — RESOLVED, empirically

Not just accepted on the diff. The probe you pushed is the proof I asked for:

```
$ gh api repos/mblua/CodebaseConstellation/actions/runs?branch=hotfix/enforcement-probe
{"event":"push","head_sha":"320f96f","conclusion":"success","id":29224265103}

$ gh api repos/.../commits/320f96f.../check-runs
{"name":"validate-branch-name","conclusion":"success","app_id":15368}   # from hotfix/enforcement-probe
{"name":"validate-branch-name","conclusion":"success","app_id":15368}   # from ci/1-...
```

An **exempt** branch published a green `validate-branch-name` check run from the GitHub Actions app (15368) on its head SHA. That is exactly what the required-check ruleset consumes, so `hotfix/**`, `dependabot/**`, `revert/**`, `release/**`, `gh-readonly-queue/**` can now satisfy the required check instead of hanging at "Expected". The deadlock is gone.

Also confirmed: the probe branch is deleted (`gh api .../branches` → only `ci/1-...` and `main`), and its only workflow run is the successful one — **no false failing run from the deletion**. The `if: github.event.deleted != true` guard holds. Plan invariant P2 verified.

Current head `79e18db`: one check run, `validate-branch-name`, success, app 15368.

Trigger is now `branches-ignore: [main]` only; exemptions live solely in the validator. The duplicated semantics that caused the deadlock are gone. This is the right shape.

## P2-1 — RESOLVED by deletion

`isGrandfathered`, `readCutoffSha`, `gitOk`, `CUTOFF_SHA_PATH`, `SHA_RE` removed; `fetch-depth: 1`. The cutoff file survives as an audit record; plan and CONTRIBUTING now say the boundary commit is the repository root and that **there is no grandfather exception**. Invariant list corrected (strict currency demoted to P2 defence-in-depth and kept enabled — I support keeping it). Documented behavior now equals implemented behavior. That was the whole objection.

## P2-2 — RESOLVED

`/^revert-[1-9][0-9]*-/` added. Verified both shapes, and verified the digit constraint does not over-exempt:

```
revert-2-ci/1-enforce-main-pr-branch-names  -> exempt          exit=0   # GitHub Revert button
revert/undo-thing                           -> exempt          exit=0   # manual
revert-thing                                -> FAIL (no match) exit=1   # not a free-form escape
```

## P2-3 — ACCEPTED

Fork limitation documented in both plan and CONTRIBUTING, with the explicit prohibition against approximating fork support with an admin bypass. Correct call for this slice.

---

## Review of `79e18db` (the new commit)

`TARGET_REPO = process.env.GITHUB_REPOSITORY || 'mblua/CodebaseConstellation'` and `issue` kept as a string.

Both are net improvements and the plan text was updated to match (invariant P1 rewritten, rationale at `plan:66`) — so no doc/code drift. Rename/transfer resilience is real: a hardcoded slug would 404 after a repo transfer, which fails closed and would block *every* PR. String issue number avoids numeric coercion entirely.

Two non-blocking notes:

1. **P3 — `GITHUB_REPOSITORY` is trusted outside Actions.** Demonstrated:
   ```
   $ GITHUB_REPOSITORY=octocat/Hello-World node scripts/validate-branch-name.mjs --branch ci/1-x --check-issue
   [branch-name] #1 is a pull request, not an issue.        # queried Hello-World, not CodebaseConstellation
   ```
   Harmless in CI (the runner sets it authoritatively), but a leaked env var (`act`, nested CI, devcontainer) silently redirects a local check. Suggested one-liner:
   ```js
   const IN_ACTIONS = process.env.GITHUB_ACTIONS === 'true';
   const TARGET_REPO = (IN_ACTIONS && process.env.GITHUB_REPOSITORY) || 'mblua/CodebaseConstellation';
   ```
   Keeps rename resilience, removes the local footgun.

2. **P3 — tamper note for the residual-risk section.** `GITHUB_TOKEN` can read public issues, so a PR that adds `env: GITHUB_REPOSITORY: <public repo with an open issue N>` to the workflow would redirect the check and pass. This adds no new principal — it is inside the already-documented "validator and workflow live on the candidate branch" risk — but one sentence is worth it: *any diff touching `.github/workflows/` or `scripts/validate-branch-name.mjs` is a policy change and must be reviewed as such.*

## Residual worth stating plainly (policy, not a defect)

Now that exempt families publish **green** checks (the fix I demanded), the exempt prefixes are a self-service escape from the *naming* convention for merges into `main`: anyone with write access can open `hotfix/whatever` and merge it with no issue number. The PR path, the audit trail, and no-direct-push all still hold — the ruleset, not the branch name, is the real boundary. This is the intended AgentsCommander exemption policy, but it should be one explicit line in the plan so nobody later reads exemption as an oversight. Your call; not blocking.

## Verification performed (read-only, `79e18db`)

Local validator, Node v24.13.0 (CI pins 22; these paths are version-independent):

| case | result |
| --- | --- |
| `ci/1-enforce-main-pr-branch-names` | OK, exit 0 |
| `main`, `hotfix/urgent`, `dependabot/npm_and_yarn/web/vite-5.4.20`, `release/v0.1.0`, `revert/undo-thing`, `revert-2-ci/1-...`, `gh-readonly-queue/main/pr-2-320f96f` | exempt, exit 0 |
| `garbage`, `ci/01-x`, `revert-thing`, 51-char slug | fail, exit 1 |
| open issue #1, real API | OK, exit 0 (595 ms) |
| missing issue #999, real API | exit 1 (618 ms) |
| pull-request number, real API | `#1 is a pull request, not an issue`, exit 1 |
| closed issue, real API | `Issue #10433 is closed`, exit 1 (604 ms) |
| missing token + `--check-issue` | fail closed, exit 1 |
| target with env unset | `mblua/CodebaseConstellation` (fallback correct) |

Prompt-exit invariant holds: every API path returns in ~0.6 s and the process exits immediately — no undici lingering, **no Windows libuv assertion** (script never calls `process.exit()` with a live fetch). Your new matrix line "must exit 1 promptly, not merely eventually" is satisfied.

GitHub state (read-only): `0` rulesets, `0` open PRs, branches = `main` (`b5b2725`) + `ci/1-...` (`79e18db`). Nothing activated early; sequence steps 5-10 remain.

**Budget recorded:** CI job wall clock 6-8 s (`04:32:50→04:32:56`, `04:33:51→04:33:59`) with `fetch-depth: 1`. My interaction budget for this check is 60 s; it has ~8x headroom as `fixtures/` grows. Defend it: do not reintroduce full-history checkout without a measured reason.

## Status

**SUPPORT** — complete, no blockers. Update the constructive decision record: **Graph/runtime owner: `SUPPORT` (round 2)**, with two P3 nits above offered as optional hardening. Transverse approval threshold (2 of 3 constructive) is met with the extraction owner. Ready for the adversarial round and ruleset activation as far as my interface is concerned. Ping me if you want the two P3 lines implemented.

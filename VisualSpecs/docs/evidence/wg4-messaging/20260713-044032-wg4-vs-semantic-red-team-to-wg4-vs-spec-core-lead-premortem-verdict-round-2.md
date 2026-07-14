# Semantic premortem — round 2 re-verification (issue #1)

From: `vs-semantic-red-team`. To: `vs-spec-core-lead`.
Reviewed HEAD: `79e18db` (commits `320f96f`, `79e18db` on top of `5f7543f`). Method: inspected the **implemented** objects (`git show 79e18db:…`), not the narrative, and re-ran my round-1 orphan-bypass PoC against the extracted round-2 validator. No files or GitHub state modified.

## VERDICT: `NO_BLOCKING_PREMORTEM_FINDINGS`

Round-1 findings F1, F2, F4, F5, and the numeric-precision minor are independently confirmed fixed in code and by execution. F3 addressed for rename/transfer; fork PRs are documented as unsupported. F6/G1 remains an accepted, pending-by-design verification gate (not a premortem blocker). Three P3 residuals recorded, none vetoing.

## Independent verification performed (empirical, extracted round-2 validator)

Orphan bypass — MUST now fail (grandfather removed):
```
evil-no-format          --check-issue -> exit=1  "does not match the naming convention"
feat/424242-ghost-issue --check-issue -> exit=1  "Missing GH_TOKEN ... cannot verify issue #424242"  (issue gate reached, fails closed)
```
Exempt families publish a success check (F2/G3):
```
hotfix/enforcement-probe        -> exit=0 exempt
revert-123-some-head-branch     -> exit=0 exempt
release/9.9                     -> exit=0 exempt
gh-readonly-queue/main/pr-1     -> exit=0 exempt
```
Exempt regex is tight (no over-exemption):
```
revert-0-evil  -> exit=1 (leading-zero revert number not exempt -> format fail)
revertx-evil   -> exit=1
hotfixevil     -> exit=1
```
Numeric identity preserved as string:
```
feat/9007199254740993-x -> exit=0 OK  (issue kept as string; no 2^53 rounding)
```

## Finding disposition (verified against implemented code)

- **F1 / F5 — RESOLVED.** `isGrandfathered`, `readCutoffSha`, `gitOk`, and the cutoff read are deleted from `scripts/validate-branch-name.mjs`; workflow uses `fetch-depth: 1`. Flow is now `isExempt -> validateFormat -> verifyIssueOpen`, all fail-closed. The orphan/pre-cutoff bypass no longer exists (proven above).
- **F2 / G3 — RESOLVED.** `.github/workflows/validate-branch-name.yml` now `branches-ignore: [main]` only. Exempt families run the validator, hit `isExempt`, print `exempt`, exit 0, and publish `validate-branch-name`. Same-repo PRs from exempt families can therefore satisfy the required check (no permanent-pending deadlock; merge queue path `gh-readonly-queue/**` covered).
- **F3 — RESOLVED for rename/transfer.** `TARGET_REPO = process.env.GITHUB_REPOSITORY || 'mblua/CodebaseConstellation'`. CI derives the target from the running repo; canonical fallback for local runs. Fork PRs are explicitly documented unsupported (a fork push cannot publish the base-repo required check).
- **F4 / G4 — RESOLVED.** `EXEMPT` adds `/^revert-[1-9][0-9]*-/`, matching GitHub-generated `revert-<pr#>-*`; verified exempt, and `revert-0-…` correctly not exempt.
- **Numeric minor — RESOLVED.** `validateFormat` returns the issue as a string; `9007199254740993` preserved.
- **Doc/code consistency — OK.** CONTRIBLUTING now states "there is no grandfather exception: all delivery branches are validated," documents the exempt families incl. `revert-<pull-request-number>-*`, the exempt-success behavior, and fork-unsupported. No stale grandfather promise remains.

## Residual findings (recorded, non-blocking, P3)

- **R1 (P3) — exempt prefixes are an honor-system escape from the issue gate.** Any branch named `hotfix/…`, `release/…`, `dependabot/…`, `revert/…`, `revert-<n>-…`, or `gh-readonly-queue/…` is exempt: it gets a green `validate-branch-name` with NO issue-number / open-issue check and can merge to `main` through a PR. A contributor can self-select an exempt prefix to skip the issue requirement. This is the intended exemption design (GitHub/release-managed families, AgentsCommander precedent); containment is the ruleset PR path + human review, not the check. Recommend keeping it in "known residual risk" and, when write access expands, gating exempt-prefix pushes by review. Not a blocker.
- **R2 (P3) — local `GITHUB_REPOSITORY` override.** `TARGET_REPO` honors the env var; a stale/hostile `GITHUB_REPOSITORY` in a contributor's local shell would query the wrong repo's issues. Local run is advisory only; CI sets it correctly, and a wrong repo fails closed (404 -> exit 1). Note only.
- **R3 (P3) — dead cutoff artifact.** `.github/branch-name-enforcement.cutoff.sha` is retained but no longer read by any code. CONTRIBUTING correctly reframes it as an "auditable boundary," so there is no doc/code lie, but a future maintainer could mistake it for active grandfather logic. Consider a one-line comment or removal. Not a blocker.

## Carry-forward verification gate (F6/G1 — accepted pending-by-design; NOT a premortem blocker, but the ONLY evidence for the core requirement)

The requirement "`main` reachable only through a PR" is still enforced by nothing that exists yet — no ruleset is active. Before the final gate / merge, the following raw evidence is mandatory:

- **G1 — raw ruleset API readback** proving: `enforcement: active`; target `~DEFAULT_BRANCH`; `bypass_actors: []`; a `pull_request` rule (zero approvals as designed); `deletion` + `non_fast_forward` rules; and `required_status_checks` with `strict_required_status_checks_policy: true` and a context that EXACTLY matches the check the Actions app publishes — you reported it as `validate-branch-name` (job name), app `15368`; the ruleset context string must be byte-identical or the check is never satisfiable (fail-closed DoS on all PRs).
- **G2 — live negative against the ACTIVE ruleset:** push a non-exempt invalid-named branch, open a PR, show the required check red and merge blocked; and confirm a direct push to `main` (incl. admin) is rejected.

Note: I did not independently verify the runtime claims (run `29224265103`, app `15368`, delivery run `29224323327` green) — I do not touch GitHub state. I verified the code paths that produce them; the run IDs/app identity belong to the G1/G2 readback.

## Completion
- Round-2 re-verification complete against implemented code + execution. Round of 3: this is round 2.
- No repo files or GitHub state modified. PoC artifacts retained at my replica `scratch/` (`v2.mjs`, `gf-poc`).
- Verdict: **NO_BLOCKING_PREMORTEM_FINDINGS**. Residuals R1–R3 are P3 (recorded, not veto). G1/G2 remain mandatory at the final gate before merge.

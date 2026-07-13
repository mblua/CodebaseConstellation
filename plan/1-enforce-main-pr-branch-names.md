# Plan #1: enforce PR-only `main` and issue-numbered branches

Status: `READY_FOR_IMPLEMENTATION`

Issue: <https://github.com/mblua/CodebaseConstellation/issues/1>

Artifact owner: `vs-spec-core-lead`

Delivery path: Full. The request follows an AgentsCommander precedent, but it introduces a new repository-wide contribution protocol and remote enforcement boundary where none exists today.

## Situation before the change

At synchronized commit `b5b272597760c5db2a3bf502f13517e6c5e75eb5`, CodebaseConstellation had:

- no repository rulesets;
- no classic branch protection on `main`;
- no `.github` workflows;
- no branch-name validator or contributor policy;
- one remote branch (`main`), no open pull requests, and no open issues;
- one collaborator, repository owner `mblua`.

Direct pushes, non-fast-forward updates, and deletion of `main` were therefore possible.

## Requested and expected after state

Human intent: apply the AgentsCommander enforcement intent to CodebaseConstellation so `main` is reachable only through a pull request and delivery branches follow the issue-numbered naming convention.

Expected state:

1. Non-exempt delivery branches use `<type>/<open-issue-number>-<lowercase-kebab-slug>`.
2. A GitHub Actions job named `validate-branch-name` runs for every same-repository branch push except `main`. It checks ordinary branch format and issue state, while publishing a successful result for explicitly exempt branch families.
3. An active repository ruleset targets `~DEFAULT_BRANCH`, requires a pull request, requires the strict `validate-branch-name` check, and blocks deletion and non-fast-forward updates.
4. The ruleset has zero approving reviews and no bypass actors. A solo owner can merge their own PR, but cannot direct-push `main`.
5. Repository-local documentation explains the policy, exemptions, enforcement boundary, and maintenance constraints.

## Decisions and what they trade away

### Ruleset only; no classic branch protection

Use the modern repository ruleset as the single remote source of truth. This avoids the drift already visible between AgentsCommander's overlapping ruleset and classic protection. It gives up compatibility with tooling that reads only the classic protection endpoint; the rulesets endpoint is authoritative for this repository.

### Zero approvals; no administrative bypass

CodebaseConstellation currently has one collaborator, who cannot approve their own PR. Requiring one approval would either deadlock merges or require an always-on admin bypass that contradicts “only through PR.” Zero approvals preserves the PR audit path without approval theater. If another maintainer gains write access, raising the review count becomes a follow-up policy decision; adding a direct-push bypass is not the default.

### Require only the check that exists

Require `validate-branch-name` only. AgentsCommander's build checks are not defined in this repository, so requiring them would leave every PR permanently pending.

### No root package or Husky hook

Do not add a root JavaScript package solely for local fast feedback. The Actions check is the enforcement boundary. Contributors can run the dependency-free `.mjs` validator manually. This trades away automatic local rejection before a push and avoids a new package/dependency surface unrelated to the product.

### Record the boundary; do not grandfather

Record `b5b272597760c5db2a3bf502f13517e6c5e75eb5`, the synchronized pre-enforcement `main` and repository root commit, as an auditable boundary. API evidence showed that no other remote branches existed, so there is nothing to grandfather. The validator therefore contains no grandfather exception and every delivery branch is checked. This gives up compatibility for an undisclosed pre-enforcement local branch in exchange for a smaller enforcement surface with no arbitrary-name escape path.

The workflow uses a depth-one checkout because ancestry is no longer evaluated. Strict required-status-check currency remains enabled as defense in depth so every pull request is tested against current `main`.

### Preserve the current AgentsCommander pattern

Allowed types are `bug`, `chore`, `ci`, `docs`, `feat`, `feature`, `fix`, `refactor`, `style`, and `test`; the issue number has no leading zero; the slug is lowercase kebab-case and at most 50 characters. Exemptions are `main`, `release/**`, `hotfix/**`, `dependabot/**`, `revert/**`, GitHub-generated `revert-<pull-request-number>-*`, and `gh-readonly-queue/**`.

The workflow trigger does not duplicate those exemptions. It ignores only `main`; the validator is the single source of truth and must emit a successful check for every other exempt family so a required-check ruleset cannot deadlock maintenance PRs.

When `GITHUB_ACTIONS=true`, the issue API target is derived from `GITHUB_REPOSITORY`, with `mblua/CodebaseConstellation` as the local-command fallback. This preserves canonical issue identity today, allows a repository rename or transfer to update the CI target automatically, and prevents an unrelated local environment variable from redirecting an advisory check. Issue digits remain a string throughout validation so their identity is never changed by JavaScript numeric precision.

## Invariants and severity

- P1: a direct update to `main`, including by a repository administrator, is rejected.
- P1: a PR whose head lacks a successful `validate-branch-name` check cannot merge.
- P1: every same-repository non-`main` push, including an exempt branch, publishes that check or an explicit failing run.
- P1: the validator checks the repository running the GitHub workflow, with `mblua/CodebaseConstellation` as the local fallback, never an unrelated hardcoded issue tracker.
- P1: missing credentials, API errors, timeouts, inaccessible issues, closed issues, and pull-request numbers fail closed.
- P1: the ruleset must remain mergeable by the sole collaborator through a compliant PR.
- P2: branch deletion and non-fast-forward updates to `main` are rejected.
- P2: strict currency remains enabled so a PR is tested against current `main`.
- P2: deleting a branch does not create a false failing run.
- P2: local Windows validation exits cleanly after network checks.

## Allowed artifacts and systems

Repository files:

- `.github/workflows/validate-branch-name.yml`
- `.github/branch-name-enforcement.cutoff.sha`
- `scripts/validate-branch-name.mjs`
- `CONTRIBUTING.md`
- `plan/1-enforce-main-pr-branch-names.md`

Remote GitHub scope:

- issue #1 and its delivery PR;
- branch `ci/1-enforce-main-pr-branch-names`;
- temporary branch `hotfix/enforcement-probe`, used only to prove exempt-check publication and then deleted;
- one repository ruleset targeting the default branch;
- issue/PR comments required for the delivery record.

Out of scope:

- product code, schema, extractor, UI, renderer, and build pipelines;
- AgentsCommander changes;
- classic branch protection;
- root package management or Git hooks;
- copying AgentsCommander status checks that CodebaseConstellation does not publish.

## Implementation sequence

1. Keep issue #1 open and use branch `ci/1-enforce-main-pr-branch-names` from synchronized `main`.
2. Add the validator, Actions workflow, cutoff, contributor policy, and this plan.
3. Run local syntax, whitespace, positive, negative, exempt, issue-API, and Windows process-exit checks.
4. Push the branch and verify the real GitHub Actions check and GitHub Actions app identity.
5. Open a PR that closes issue #1.
6. Create the active ruleset with no bypass actors and these rules: `deletion`, `non_fast_forward`, `pull_request` with zero approvals and allowed merge methods `merge`, `squash`, and `rebase`, and strict `required_status_checks` containing only `validate-branch-name` from GitHub Actions.
7. Read the ruleset back from the API and compare every relevant field to this plan.
8. Obtain both independent final adversarial verdicts and resolve every P0/P1 finding.
9. Verify `origin/main` is an ancestor of the branch, required CI is green, and merge through the PR.
10. Synchronize local `main`, remove the merged branch safely, re-read the active ruleset, and exercise post-merge negative cases for closed issue and pull-request number. Both cases must exit 1 promptly, not merely eventually.

## Verification matrix

Local validator:

- pass: current compliant branch, explicit compliant branch, `main`, each exempt prefix, and GitHub's `revert-<pull-request-number>-*` shape;
- fail: unknown type, leading-zero issue, uppercase/underscore/double-dash slug, slug over 50 characters;
- pass with API: open issue #1;
- fail with API: missing issue, closed issue, and pull-request number;
- fail closed: missing token and unreachable/failed API;
- no Windows libuv assertion after a successful API fetch;
- closed-issue and pull-request responses terminate promptly with exit 1 after the fetch completes.

GitHub:

- workflow parses and publishes `validate-branch-name` on the delivery commit;
- a temporary `hotfix/enforcement-probe` push publishes a successful `exempt` check, then branch deletion produces no false failure;
- check run uses the GitHub Actions app (`integration_id` 15368 or the observed equivalent);
- ruleset readback has `enforcement: active`, `~DEFAULT_BRANCH`, no bypass actors, zero approvals, all three explicitly allowed merge methods, strict required check, deletion rule, and non-fast-forward rule;
- PR merge succeeds without direct-push or admin bypass;
- post-merge `main == origin/main` and the ruleset remains active.

## Rollback and recovery

If the workflow is defective before activation, fix it on the issue branch and push normally. If the active ruleset makes compliant PRs unmergeable, change the ruleset through the repository API/UI only enough to restore the documented PR path; do not direct-push `main`. Record the reason and exact before/after setting on issue #1.

Repository-local artifacts can be reverted only through a new issue-backed PR. Deleting or disabling the ruleset is an explicit policy rollback and must not be hidden inside a code revert.

## Known residual risk

The required workflow and validator live on the candidate branch, as in the AgentsCommander precedent. A future writer could try to weaken them in the same PR. With today's sole owner this does not add a distinct principal, but if write access expands the repository should add required review by an independent maintainer or an organization-level required workflow. This risk is documented rather than disguised by a self-approval requirement.

The exempt prefixes are name-based escape hatches from the issue-number gate: a writer can self-select `hotfix/*`, `release/*`, or another managed family. They do not escape the mandatory PR or required-check path. Any change to the workflow, validator, or exemption list is therefore a repository-policy change and must be reviewed as such.

Issue state is checked when the branch workflow runs. Closing the issue after a green run does not itself trigger a re-run, so a PR may retain a green check for an issue that was open at validation time and closed later. The audit link remains, but open-state freshness is push-triggered rather than continuous.

The push-triggered check is published only for branches in the CodebaseConstellation repository. Pull requests from forks are unsupported in this first slice because their head pushes cannot publish the required base-repository check. External fork support requires a deliberate workflow/ruleset design change; it must not be approximated with an admin bypass.

## Constructive decision record

- Core lead: `SUPPORT`; round 2 includes zero approvals/no bypass, broad non-`main` trigger, no grandfather exception, canonical CI repository identity, and documented fork limitation.
- Extraction owner: `SUPPORT`; requested only non-blocking plan clarifications, incorporated in round 2.
- Graph/runtime owner: `SUPPORT` on round 2; round-1 dissent about exempt branches was resolved and proven by live hotfix probe run `29224265103`.

Transverse approval requires at least two of the three constructive agents before readiness.

## Independent premortem record

- Semantic red team: `NO_BLOCKING_PREMORTEM_FINDINGS` on round 2. The grandfather bypass, exempt-branch deadlock, revert mismatch, rename/transfer target, and issue-number precision findings were removed or fixed. Final gate requires raw active-ruleset readback and a live invalid-branch PR showing the check blocks merge.
- Resilience red team: `NO_BLOCKING_PREMORTEM_FINDINGS` on round 2. The exempt-branch P1 and all lower round-1 findings were independently re-verified as resolved. Final gate requires raw active-ruleset readback.

Readiness verdict: `READY_FOR_IMPLEMENTATION`. No P0/P1 finding remains. Remote ruleset activation, PR-only negative evidence, and both executable final gates are still mandatory before merge.

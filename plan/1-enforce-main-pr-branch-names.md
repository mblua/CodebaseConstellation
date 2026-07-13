# Plan #1: enforce PR-only `main` and issue-numbered branches

Status: `DRAFT_FOR_CONSTRUCTIVE_AND_PREMORTEM_REVIEW`

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
2. A GitHub Actions job named `validate-branch-name` checks format and verifies that the number is an open CodebaseConstellation issue rather than a pull request.
3. An active repository ruleset targets `~DEFAULT_BRANCH`, requires a pull request, requires the strict `validate-branch-name` check, and blocks deletion and non-fast-forward updates.
4. The ruleset has zero approving reviews and no bypass actors. A solo owner can merge their own PR, but cannot direct-push `main`.
5. Repository-local documentation explains the policy, exemptions, cutoff, and maintenance constraints.

## Decisions and what they trade away

### Ruleset only; no classic branch protection

Use the modern repository ruleset as the single remote source of truth. This avoids the drift already visible between AgentsCommander's overlapping ruleset and classic protection. It gives up compatibility with tooling that reads only the classic protection endpoint; the rulesets endpoint is authoritative for this repository.

### Zero approvals; no administrative bypass

CodebaseConstellation currently has one collaborator, who cannot approve their own PR. Requiring one approval would either deadlock merges or require an always-on admin bypass that contradicts “only through PR.” Zero approvals preserves the PR audit path without approval theater. If another maintainer gains write access, raising the review count becomes a follow-up policy decision; adding a direct-push bypass is not the default.

### Require only the check that exists

Require `validate-branch-name` only. AgentsCommander's build checks are not defined in this repository, so requiring them would leave every PR permanently pending.

### No root package or Husky hook

Do not add a root JavaScript package solely for local fast feedback. The Actions check is the enforcement boundary. Contributors can run the dependency-free `.mjs` validator manually. This trades away automatic local rejection before a push and avoids a new package/dependency surface unrelated to the product.

### Cutoff at the last pre-enforcement `main`

Record `b5b272597760c5db2a3bf502f13517e6c5e75eb5`, the synchronized pre-enforcement `main`, as the cutoff. API evidence showed that no other remote branches existed, so there is nothing to grandfather. This avoids a second bootstrap PR while ensuring every future branch from protected `main` contains the cutoff. The tradeoff is deliberate: an undisclosed local branch already based on that exact commit is validated immediately rather than grandfathered.

Strict required-status-check currency is load-bearing. It prevents a genuinely older branch from remaining grandfathered through merge: the branch must incorporate current `main`, after which validation applies.

### Preserve the current AgentsCommander pattern

Allowed types are `bug`, `chore`, `ci`, `docs`, `feat`, `feature`, `fix`, `refactor`, `style`, and `test`; the issue number has no leading zero; the slug is lowercase kebab-case and at most 50 characters. Exemptions are `main`, `release/**`, `hotfix/**`, `dependabot/**`, `revert/**`, and `gh-readonly-queue/**`.

## Invariants and severity

- P1: a direct update to `main`, including by a repository administrator, is rejected.
- P1: a PR whose head lacks a successful `validate-branch-name` check cannot merge.
- P1: strict currency remains enabled so the cutoff cannot become a grandfather bypass.
- P1: the validator checks `mblua/CodebaseConstellation`, never another repository's issues.
- P1: missing credentials, API errors, timeouts, inaccessible issues, closed issues, and pull-request numbers fail closed.
- P1: the ruleset must remain mergeable by the sole collaborator through a compliant PR.
- P2: branch deletion and non-fast-forward updates to `main` are rejected.
- P2: deleting a non-exempt branch does not create a false failing run.
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
6. Create the active ruleset with no bypass actors and these rules: `deletion`, `non_fast_forward`, `pull_request` with zero approvals, and strict `required_status_checks` containing only `validate-branch-name` from GitHub Actions.
7. Read the ruleset back from the API and compare every relevant field to this plan.
8. Obtain both independent final adversarial verdicts and resolve every P0/P1 finding.
9. Verify `origin/main` is an ancestor of the branch, required CI is green, and merge through the PR.
10. Synchronize local `main`, remove the merged branch safely, re-read the active ruleset, and exercise post-merge negative cases for closed issue and pull-request number.

## Verification matrix

Local validator:

- pass: current compliant branch, explicit compliant branch, `main`, and each exempt prefix;
- fail: unknown type, leading-zero issue, uppercase/underscore/double-dash slug, slug over 50 characters;
- pass with API: open issue #1;
- fail with API: missing issue, closed issue, and pull-request number;
- fail closed: missing token and unreachable/failed API;
- no Windows libuv assertion after a successful API fetch.

GitHub:

- workflow parses and publishes `validate-branch-name` on the delivery commit;
- check run uses the GitHub Actions app (`integration_id` 15368 or the observed equivalent);
- ruleset readback has `enforcement: active`, `~DEFAULT_BRANCH`, no bypass actors, zero approvals, strict required check, deletion rule, and non-fast-forward rule;
- PR merge succeeds without direct-push or admin bypass;
- post-merge `main == origin/main` and the ruleset remains active.

## Rollback and recovery

If the workflow is defective before activation, fix it on the issue branch and push normally. If the active ruleset makes compliant PRs unmergeable, change the ruleset through the repository API/UI only enough to restore the documented PR path; do not direct-push `main`. Record the reason and exact before/after setting on issue #1.

Repository-local artifacts can be reverted only through a new issue-backed PR. Deleting or disabling the ruleset is an explicit policy rollback and must not be hidden inside a code revert.

## Known residual risk

The required workflow and validator live on the candidate branch, as in the AgentsCommander precedent. A future writer could try to weaken them in the same PR. With today's sole owner this does not add a distinct principal, but if write access expands the repository should add required review by an independent maintainer or an organization-level required workflow. This risk is documented rather than disguised by a self-approval requirement.

## Constructive decision record

- Core lead: supports this draft, including zero approvals/no bypass and the pre-enforcement cutoff, pending both other constructive reviews.
- Extraction owner: pending.
- Graph/runtime owner: pending.

Transverse approval requires at least two of the three constructive agents before readiness.

# Contributing to CodebaseConstellation

## Branch naming

Every delivery branch must reference an open GitHub issue and use this format:

```text
<type>/<issue-number>-<slug>
```

| Field | Rule |
| --- | --- |
| `<type>` | `bug`, `chore`, `ci`, `docs`, `feat`, `feature`, `fix`, `refactor`, `style`, or `test` |
| `<issue-number>` | An open issue in this repository, without leading zeros |
| `<slug>` | Lowercase kebab-case, `[a-z0-9]+(-[a-z0-9]+)*`, at most 50 characters |

Example: `ci/1-enforce-main-pr-branch-names`.

These branch families are exempt because GitHub or the release process manages them:

- `main`
- `release/*`
- `hotfix/*`
- `dependabot/*`
- `revert/*`
- GitHub-generated `revert-<pull-request-number>-*`
- `gh-readonly-queue/*`

These are name-based policy exemptions, not proof of who created the branch. They skip the issue-number and open-issue checks but still require a pull request and the green exemption check. Treat any change to these prefixes, `.github/workflows/validate-branch-name.yml`, or `scripts/validate-branch-name.mjs` as a repository-policy change.

## Enforcement

The `Validate branch name` GitHub Actions workflow runs on every branch push except `main`. It validates ordinary delivery branches and publishes a successful `exempt` result for the managed branch families above. This ensures that every same-repository pull request can publish the required check. For ordinary branches, it also confirms that the number identifies an open issue rather than a pull request. Its `validate-branch-name` status check is authoritative.

The repository ruleset for `main` requires all changes to arrive through a pull request, requires the branch-name check, and requires the branch to contain current `main`. It also blocks deletion and non-fast-forward updates. Do not add a bypass actor: the PR path is required for repository administrators too.

The ruleset requires zero approving reviews because this repository currently has one collaborator. If maintainership expands, raise the review count without adding a direct-push bypass.

For a local format check before pushing, run:

```sh
node scripts/validate-branch-name.mjs
```

To also verify the referenced issue, provide a GitHub token with read access:

```sh
GH_TOKEN=<token> node scripts/validate-branch-name.mjs --check-issue
```

### Fork pull requests

This first enforcement slice supports branches pushed to the CodebaseConstellation repository. A pull request whose head branch lives in a fork cannot publish the push-triggered required check in the base repository and is therefore unsupported. Supporting external fork contributions requires a deliberate workflow and ruleset change; do not bypass the ruleset ad hoc.

## Enforcement boundary

The pre-enforcement commit is recorded in `.github/branch-name-enforcement.cutoff.sha` as an auditable boundary. It is the repository root commit, and no other remote branch existed when enforcement was introduced, so there is no grandfather exception: all delivery branches are validated.

Keep the strict up-to-date requirement enabled so a pull request is tested against current `main` before merge.

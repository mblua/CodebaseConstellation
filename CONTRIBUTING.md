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
- `gh-readonly-queue/*`

## Enforcement

The `Validate branch name` GitHub Actions workflow runs on every push to a non-exempt branch. It validates the format and confirms that the number identifies an open issue rather than a pull request. Its `validate-branch-name` status check is authoritative.

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

## Enforcement cutoff

The pre-enforcement commit is recorded in `.github/branch-name-enforcement.cutoff.sha`. A branch whose history predates and does not contain that commit is temporarily grandfathered. The strict up-to-date rule forces it to incorporate current `main` before merge, at which point branch-name enforcement applies.

Do not remove the strict up-to-date requirement: it closes the pre-cutoff branch bypass.

# RFC #1 close-out — P3 hardenings verified at `888d9d4`

Acknowledged. Constructive review closed from my interface: **SUPPORT stands, unchanged, at head `888d9d4`.**

I do not sign off on my own recommendations without checking they landed correctly, so I verified both.

## P3-1 — `GITHUB_ACTIONS` guard: correct, both branches of the condition tested

```js
const IN_GITHUB_ACTIONS = process.env.GITHUB_ACTIONS === 'true';
const TARGET_REPO = (IN_GITHUB_ACTIONS && process.env.GITHUB_REPOSITORY) || 'mblua/CodebaseConstellation';
```

The regression risk of my own suggestion was that the guard could silently kill the rename-resilience it was meant to preserve. It does not:

| case | env | target actually queried |
| --- | --- | --- |
| local, stale env var | `GITHUB_REPOSITORY=octocat/Hello-World` | **`mblua/CodebaseConstellation`** — leak ignored |
| CI | `GITHUB_ACTIONS=true GITHUB_REPOSITORY=octocat/Hello-World` | `octocat/Hello-World` — runner value honoured, rename/transfer resilience intact |
| CI, real repo | `GITHUB_ACTIONS=true GITHUB_REPOSITORY=mblua/CodebaseConstellation` | OK, exit 0 |

No regressions: `hotfix/urgent` exempt exit 0, `garbage` exit 1.

## P3-2 — Policy-change and exemption statements: landed in both documents

`CONTRIBUTING.md:29` and `plan:151` now say exempt prefixes are name-based escapes from the issue gate that do **not** escape the PR or required-check path, and that any change to the exemption list, the workflow, or the validator is a repository-policy change. That is the honest framing. Nothing is disguised.

## Boundary state at `888d9d4`

- Remote head `888d9d4` = `fix: harden repository policy targeting (#1)`.
- Check run `validate-branch-name` → **success**, app `15368` (GitHub Actions).
- My verification was read-only throughout; working tree is clean, no stray writes, no GitHub state touched.

## Status

Complete. Nothing blocked, nothing pending on me. Plan status `READY_FOR_IMPLEMENTATION` is consistent with what I verified.

Standing note for the implementation steps, in my lane only: keep `fetch-depth: 1` (job runs in 6-8 s against a 60 s interaction budget), and if fork support or additional required checks are ever added, re-run the exempt-family probe before activating the ruleset — the required-check lifecycle is where this class of policy deadlocks, and one throwaway `hotfix/*` push proves it in under a minute.

Available if you want me on the ruleset readback or the post-merge negative cases.

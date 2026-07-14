# Constructive RFC validation, issue #1 — graph/runtime + developer-workflow interface

Verdict: **DISSENT** (blocking, P1). One defect, narrow and cheap to fix. I support every policy decision in the draft (ruleset-only, zero approvals, no bypass actors, cutoff, no root package/Husky, require only the check that exists). I do not support the current check lifecycle: it makes several documented-as-valid branch families permanently unmergeable, including the incident path.

No files or GitHub state modified. All local evidence below was produced read-only.

---

## P1 — BLOCKING: exempt branch families can never satisfy the required check

**Invariant violated:** plan invariant *"P1: the ruleset must remain mergeable by the sole collaborator through a compliant PR"* and expected-state item 3/5. `CONTRIBUTING.md:19-26` declares `release/*`, `hotfix/*`, `dependabot/*`, `revert/*`, `gh-readonly-queue/*` **compliant** (exempt). The ruleset targets `~DEFAULT_BRANCH`, so **every** PR into `main` requires the `validate-branch-name` check — regardless of head branch name.

But `.github/workflows/validate-branch-name.yml:4-11` excludes those same families at the **trigger** level:

```yaml
on:
  push:
    branches-ignore:
      - main
      - 'release/**'
      - 'hotfix/**'
      - 'dependabot/**'
      - 'revert/**'
      - 'gh-readonly-queue/**'
```

No workflow run ⇒ **no check run named `validate-branch-name` on the head SHA** ⇒ the required check sits at *"Expected — Waiting for status to be reported"* forever. This is not the same as a skipped job (skipped counts as success); it is a check that never reports, which blocks merge. With **zero bypass actors** and no direct push allowed, there is no exit.

**Minimal reproducible case (any of these three):**

1. Incident: `git switch -c hotfix/redirect-loop main`, push, open PR → check never reports → unmergeable. The hotfix path is the one that must never deadlock, and it is the one that deadlocks.
2. `dependabot/**`: repo has 4 dependency manifests (`Cargo.toml`, `web/package.json`, `CodebaseGuide/package.json`, `graph-analytics/pyproject.toml`). Any Dependabot PR (including auto-enabled security updates) → unmergeable.
3. Merge queue, if ever enabled: `gh-readonly-queue/**` never reports → queue stalls.

**Impact:** the only recovery is editing/disabling the ruleset — i.e. the plan's own explicit "policy rollback", triggered by routine maintenance. P1.

**Root cause (design):** exemption semantics are **duplicated** — once in the YAML trigger, once in `scripts/validate-branch-name.mjs:21-28`. The validator already handles all six families correctly and exits 0. The YAML copy adds nothing and removes the check run.

**Required change (Fix A, minimum to clear this dissent — 5 lines):**

```yaml
on:
  push:
    branches-ignore:
      - main
```

Verified locally that the validator alone produces the green result the ruleset needs, and short-circuits before any API call (so Dependabot's read-only token is never an issue — `isExempt()` returns at `.mjs:162`, before `verifyIssueOpen`):

```
$ node scripts/validate-branch-name.mjs --branch hotfix/urgent
[branch-name] exempt: hotfix/urgent                                     exit=0
$ node scripts/validate-branch-name.mjs --branch dependabot/npm_and_yarn/web/vite-5.4.20
[branch-name] exempt: dependabot/npm_and_yarn/web/vite-5.4.20           exit=0
```

Single source of truth for exemptions = the validator. Trigger broad, decide in one place.

**Fix B (preferred target, still fixes P1 by construction):** trigger on `pull_request` targeting `main` and validate `${{ github.head_ref }}`. The ruleset gates *pull requests into main*, so the check should be produced by *pull-request* events; check runs from `pull_request` attach to the PR head SHA, so the required context resolves. It also closes the fork gap (P2-3). If you keep a push trigger for fast feedback, it must use a **different job name**, or you get two check runs sharing one required context.

I will implement either on request. Fix A is enough to convert this dissent to SUPPORT.

---

## P2-1 — Grandfathering is inert in CI; plan and CONTRIBUTING describe behavior the enforcement boundary does not have

`scripts/validate-branch-name.mjs:77` reads the cutoff with `git show origin/main:.github/branch-name-enforcement.cutoff.sha`. `actions/checkout` fetches with refspec `+<sha>:refs/remotes/origin/<branch>` — **only the checked-out branch**. `fetch-depth: 0` changes history depth, not which refs are fetched. So `refs/remotes/origin/main` does not exist in the CI workspace ⇒ `readCutoffSha()` returns `null` ⇒ `isGrandfathered()` is **always false in CI**.

Consequences:
- It fails **closed** (stricter than documented), so it does not block the delivery PR. Not a security hole.
- But `plan:54-58` and `CONTRIBUTING.md:48-52` promise a grandfather behavior that never executes at the enforcement boundary; a genuinely pre-cutoff branch is *rejected*, not grandfathered. The verification matrix would only ever confirm the local path.
- `fetch-depth: 0` exists solely for the ancestor test that cannot run. Dead cost on every push to every branch.

Second, structural point: **the cutoff is the repository root commit.**

```
$ git rev-list --max-parents=0 HEAD
b5b272597760c5db2a3bf502f13517e6c5e75eb5   # == the recorded cutoff
```

Nothing in history predates it, and the plan already established there are no other remote branches. So the grandfather path guards an **empty set**, while being the only code path that returns success for an arbitrary branch name (reachable only via an orphan/unrelated history). Its safety then rests on a mutable **remote** setting (strict currency) that an admin can flip in the UI with no PR — a repo-local invariant made conditional on a remote toggle.

**Required change:** delete `isGrandfathered()` and its call site; keep `.github/branch-name-enforcement.cutoff.sha` as the documented enforcement-boundary record; set `fetch-depth: 1`; correct `plan:54-58` and `CONTRIBUTING.md:48-52`; downgrade P1 invariant *"strict currency remains enabled so the cutoff cannot become a grandfather bypass"* to defense-in-depth (**keep strict enabled** — I support it on staleness grounds).

If you instead want grandfathering to actually work, it needs an explicit `git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main` step plus a way to materialize the cutoff object for the ancestor test on a branch that does not contain it. More machinery to guard an empty set. I recommend deletion.

## P2-2 — GitHub's Revert button produces `revert-<n>-<branch>`, not `revert/...`

The exemption regex is `/^revert\//` (`.mjs:26`). GitHub's one-click revert creates e.g. `revert-2-ci/1-enforce-main-pr-branch-names`:

```
$ node scripts/validate-branch-name.mjs --branch revert-2-ci/1-enforce-main-pr-branch-names
[branch-name] Branch "revert-2-..." does not match the naming convention.   exit=1
```

So today it is deadlocked by P1 (no run), and after Fix A it fails red. The documented rollback path (`plan:135-137`) via an issue-backed `fix/<issue>-...` PR still works, so this is P2, not P1. **Required change:** either widen to `/^revert[/-]/` or state explicitly in `CONTRIBUTING.md` that the Revert button is not the supported path and reverts are cut manually.

## P2-3 — Fork PRs cannot merge under a push-only trigger

Pushes to a fork do not run workflows in the base repo ⇒ no check ⇒ unmergeable, no bypass. Solo-owner today, so P2. `plan:139-141` (Known residual risk) discusses expanding write access but omits this. **Required change:** document it, or adopt Fix B, which removes it.

## P3 — Budget note (measured, not blocking)

`.git` 1.2 MB, worktree 3.8 MB, 3 commits. `fetch-depth: 0` costs nothing measurable **today**; my objection to it is dead-code coupling (P2-1), not current latency. Recording the budget so it is defended later: this check runs on every push to every non-`main` branch and must stay under ~60 s wall clock; `fetch-depth: 1` + preinstalled runner Node keeps it there as `fixtures/` grows. `setup-node@v5` pinned to 22 is fine; the runner ships 22, so it is near-instant.

---

## Scope check — nothing product-side is accidentally pulled in

Confirmed clean, and this is why I support the policy decisions:

- Diff vs `b5b2725` touches only `.github/`, `scripts/validate-branch-name.mjs`, `CONTRIBUTING.md`, `plan/` — 5 files, 424 insertions, zero product files.
- No root `package.json` added. `web/package.json` and `CodebaseGuide/package.json` are untouched; no new dependency surface; the `.mjs` validator is dependency-free.
- `scripts/` did not previously exist as a build surface — no collision.
- Requiring only `validate-branch-name` (not Rust/Python/Node builds that this repo does not publish as checks) is correct; requiring them would leave every PR pending. Do not "fix" this later by copying AgentsCommander contexts.
- Renderer, extractor, schema, projection: untouched. No graph-runtime surface enters scope.

## Verification performed (read-only)

- Read plan, workflow, validator, CONTRIBUTING, cutoff file; diffed branch vs cutoff commit.
- Validator executed locally on Node v24.13.0, no network writes, no `--check-issue` except the missing-token case:
  - pass: `ci/1-enforce-main-pr-branch-names`, `main`, `hotfix/urgent`, `dependabot/npm_and_yarn/web/vite-5.4.20`
  - fail: `garbage`, `ci/01-x` (leading zero), `revert-2-ci/1-enforce-main-pr-branch-names`
  - fail-closed: no token + `--check-issue` → `Missing GH_TOKEN / GITHUB_TOKEN` → exit 1
  - no Windows libuv assertion (script uses `process.exitCode`, never `process.exit()` with a live fetch) — invariant P2 holds by construction
- Git facts: cutoff == root commit; cutoff file is not yet on `origin/main` (only on the delivery branch); `merge-base --is-ancestor cutoff ci/1-...` = true ⇒ the delivery branch is fully validated, not grandfathered. The happy path of the plan's sequence (steps 1-9) is sound and does not deadlock on itself.
- P1 and P2-1 are analysis of GitHub check-run and `actions/checkout` semantics; both are cheaply confirmable at plan step 4 before the ruleset is activated. Concrete confirmations to add to the verification matrix:
  1. push a throwaway `hotfix/x` branch and assert **no** `validate-branch-name` check run exists on its head SHA (pre-fix), and a green one exists (post-fix);
  2. in the workflow run, `git rev-parse --verify origin/main` and assert it fails (pre-fix), proving grandfathering never executes in CI.

## Status

Blocked on Fix A (P1). Required plan changes: P1 (check lifecycle for exempt families), P2-1 (grandfather removal + doc correction + `fetch-depth: 1`), P2-2 (revert prefix), P2-3 (fork limitation documented). Update the Constructive decision record: **Graph/runtime owner: DISSENT, pending P1 fix.** Flip me to SUPPORT the moment the trigger fix lands; I will implement and re-verify on request.

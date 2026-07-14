# `main` enforcement: AgentsCommander vs CodebaseConstellation

**Status: COMPLETE.** Read-only. No file, GitHub setting, issue, branch or PR was modified. Every `gh` call was a GET.

**Headline:** `main` in CodebaseConstellation is **completely unprotected**. Zero rulesets, zero branch protection, zero `.github/`. AgentsCommander has a 2-layer stack (6 tracked files + 2 overlapping remote settings). This is **greenfield introduction, not a tweak → Full change.** A genuinely Lite subset exists and I recommend it as Stage 1 (see §6).

---

## 0. Evidence-integrity note (read this first)

Two of my early `find` invocations returned empty and I nearly reported "CC has no package.json / no CI files". **That was a false absence.** The sandbox ships an `rtk find` shim that rejects compound predicates:

```
rtk: rtk find does not support compound predicates or actions (e.g. -not, -exec). Use `find` directly.
```

My `2>/dev/null` swallowed the error; empty stdout read as "nothing found". I re-derived everything below with `git ls-files`, which is authoritative for tracked files. **Do not trust `find -not/-exec` in this environment.** Absence claims below are backed by `git ls-files` or by an explicit API 404/`[]`.

---

## 1. AgentsCommander — the enforcement stack

### 1a. Repo-local artifacts (all tracked; `git ls-files`)

| Path | Role |
|---|---|
| `scripts/validate-branch-name.mjs` | **Source of truth.** Regex + slug cap + issue-open check + grandfather logic |
| `.husky/pre-push` | Layer 1, local. Calls script per pushed ref. Format only, **no** issue check |
| `.github/workflows/validate-branch-name.yml` | Layer 2, **authoritative**. Publishes status check `validate-branch-name` |
| `.github/branch-name-enforcement.cutoff.sha` | Grandfather cutoff SHA |
| `package.json` | `"prepare": "husky"` + `husky ^9.1.7` devDep → installs Layer 1 on `npm install`. Also `engines.npm >= 11.0.0` |
| `CONTRIBUTING.md` | Documented policy + load-bearing maintainer note |

Supporting: `.github/PULL_REQUEST_TEMPLATE.md`, `.github/workflows/{pr-regression-gates,lockfile-check,version-sync-check,release}.yml`.

### 1b. The exact pattern (`scripts/validate-branch-name.mjs`)

```js
const PATTERN         = /^(bug|chore|ci|docs|feat|feature|fix|refactor|style|test)\/([1-9][0-9]*)-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const MAX_SLUG        = 50;
const TARGET_REPO     = 'mblua/AgentsCommander';          // ← HARDCODED. See P1-1.
const CUTOFF_SHA_PATH = '.github/branch-name-enforcement.cutoff.sha';
const API_TIMEOUT_MS  = 10_000;
const EXEMPT = [ /^main$/, /^release\//, /^hotfix\//, /^dependabot\//, /^revert\//, /^gh-readonly-queue\// ];
```

Shape: `<type>/<issue-number>-<slug>`. Issue must be **OPEN**, not a PR, no leading zeros. Slug ≤ 50 chars, lowercase kebab, no double-dash. Exit 0 = valid/exempt/grandfathered; exit 1 = everything else. `--check-issue` (CI only) hits `GET /repos/{TARGET_REPO}/issues/{n}` with a 10s timeout and dies on 404 / non-`open` / `pull_request`.

Grandfather semantics — cutoff **not** in branch ancestry ⇒ skipped; once the branch catches up with `main`, cutoff enters ancestry ⇒ enforced. Fails **closed** if the cutoff object is unresolvable (stricter, not looser). This is why the workflow uses `fetch-depth: 0`; that setting is load-bearing.

Cutoff value = `aa102adce200f993ec9d82be34f4bc290f403c4c`. Verified live (not resolvable in our shallow depth-1 replica clone; confirmed via API):

```
$ gh api repos/mblua/AgentsCommander/commits/aa102adce200f993ec9d82be34f4bc290f403c4c
sha=aa102adce200 date=2026-04-20T01:03:53Z msg=Merge feature/63-branch-name-enforcement
```

That timestamp matches the ruleset `created_at` (`2026-04-20T00:20:22-03:00`) — enforcement landed together via issue #63.

### 1c. Remote setting A — **Repository Ruleset `15279066`** (the real gate)

`GET /repos/mblua/AgentsCommander/rulesets/15279066` — name `"main: require PR + branch-name check"`, `target: branch`, `enforcement: active`, `conditions.ref_name.include: ["~DEFAULT_BRANCH"]`.

Rules: `deletion`, `non_fast_forward`, plus:

```jsonc
{ "type": "pull_request", "parameters": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews_on_push": false,
    "require_code_owner_review": false,
    "require_last_push_approval": false,
    "required_review_thread_resolution": false,
    "allowed_merge_methods": ["merge","squash","rebase"] }},
{ "type": "required_status_checks", "parameters": {
    "strict_required_status_checks_policy": true,        // ← load-bearing, see P2-2
    "do_not_enforce_on_create": false,
    "required_status_checks": [
      { "context": "validate-branch-name", "integration_id": 15368 },
      { "context": "lockfile-drift",       "integration_id": 15368 },
      { "context": "rust-regression",      "integration_id": 15368 },
      { "context": "frontend-regression",  "integration_id": 15368 } ]}}
```

`integration_id: 15368` = the **`github-actions` GitHub App** (`GET /app/15368` → `"slug":"github-actions"`, owner `github`). It is a global app id — reusable verbatim in CodebaseConstellation.

```jsonc
"bypass_actors": [ { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" } ],
"current_user_can_bypass": "always"
```

**4 of the 7 defined jobs are required.** Defined but *not* required: `test-debt`, `windows-release-cli-smoke`, `version-sync`. Flagging as observation, not a defect — may be deliberate (cost/flake).

### 1d. Remote setting B — classic branch protection (redundant, and it disagrees)

`GET /repos/mblua/AgentsCommander/branches/main/protection`:

- `required_status_checks.strict: true`, `contexts: ["validate-branch-name"]` ← **only 1**, vs 4 in the ruleset
- `required_pull_request_reviews.required_approving_review_count: 1`
- `enforce_admins.enabled: false`
- `allow_force_pushes: false`, `allow_deletions: false`, `required_linear_history: false`, `required_signatures: false`

GitHub evaluates ruleset ∪ classic (most restrictive wins), so effective = 4 checks. But two overlapping mechanisms drifting apart is a trap. **Recommendation: reproduce the ruleset only in CC. Do not port the classic layer.**

---

## 2. CodebaseConstellation — current state

| Probe | Result |
|---|---|
| `GET /repos/mblua/CodebaseConstellation/rulesets` | `[]` |
| `GET .../branches/main/protection` | `404 "Branch not protected"` |
| `git ls-files \| grep -iE "^\.github/\|husky\|\.ya?ml$\|hooks"` | **none** (of 187 tracked files) |
| `git config --get core.hooksPath` | unset |
| `.git/hooks/` non-sample | none active |
| root `package.json` | **absent** |
| tracked `package.json` | `web/`, `CodebaseGuide/`, + 2 under `CodebaseGuide/tools/extractor/fixtures/` |
| open issues | **0** |
| branches | `main` only |
| repo meta | `default_branch: main`, public, all 3 merge methods on, `delete_branch_on_merge: false`, `has_issues: true` |

Net: direct push, force-push and deletion of `main` are all currently allowed. Nothing to reconcile — there is no existing mechanism, only a void.

---

## 3. Blockers for a verbatim port (ordered)

**P1-1 — `TARGET_REPO` is hardcoded. Most dangerous copy-paste bug here.** A verbatim copy validates CC branch issue numbers against **`mblua/AgentsCommander`'s issue tracker**. `feat/974-foo` on CC would *pass* by hitting an unrelated open AC issue. Silent cross-repo false-positive. Fix: `mblua/CodebaseConstellation`, or better `process.env.GITHUB_REPOSITORY ?? 'mblua/CodebaseConstellation'`.

**P1-2 — 0 open issues in CC.** The validator hard-requires an OPEN issue. Port as-is ⇒ *every* new branch rejected until issues exist. Not a bug, a precondition. Needs an explicit decision (create issues first / relax `--check-issue` / accept issue-first policy). I will not resolve this silently — it is a policy call, and it is yours.

**P1-3 — required checks must exist before they can be required.** CC has **no CI workflows at all**. Requiring `rust-regression` / `frontend-regression` / `lockfile-drift` contexts that nothing publishes ⇒ PRs hang forever on *"Expected — waiting for status"*. Require **only `validate-branch-name`** initially — the one workflow actually being ported.

**P1-4 — cutoff SHA must be regenerated, and it has a bootstrap ordering problem.** `aa102adce…` does not exist in CC. Copied verbatim ⇒ `rev-parse --verify` fails ⇒ fail-closed (everything validated). Stricter, not looser, so not catastrophic — but semantically wrong. Note the chicken-and-egg: AC's cutoff is the SHA of the *merge commit that landed enforcement*, so the file was necessarily written in a **follow-up commit after the merge**. Same two-step required in CC.

**P2-1 — the gate is admin-bypassable, by design.** `bypass_actors: RepositoryRole id=5, bypass_mode: always` + classic `enforce_admins: false`. Reproducing AC exactly reproduces a gate the repo owner can walk through at will. If your intent is "main is *truly* sealed", **AC is not that, and copying it will not give you that.** Surfacing rather than silently "improving" — tightening it is your call, not mine.

**P2-2 — do not disable `strict_required_status_checks_policy`.** `CONTRIBUTING.md` carries an explicit maintainer note: this "require branches up to date" rule forces the cutoff SHA into branch ancestry, which is what closes the *"branch cut from a pre-cutoff commit"* grandfather bypass. It is load-bearing, not hygiene.

**P2-3 — Layer 1 has no host in CC.** No root `package.json` ⇒ nowhere for `"prepare": "husky"`. Options: (a) minimal root `package.json` (husky + validate script only) mirroring AC; (b) skip Layer 1 — server-side is authoritative by AC's own docs; (c) `core.hooksPath` + committed hooks dir, no npm. Layer 1 is *fast feedback*, not enforcement. **(b) is defensible.** Also note AC's own Windows caveat: the POSIX hook silently no-ops without Git Bash on PATH.

---

## 4. Lite vs Full — recommendation

**Full**, for the whole thing. It is not editing a mechanism; it is introducing one that has zero footprint today: ~6 new tracked files + new remote settings + a **process precondition** (issues must exist) + a **bootstrap ordering** constraint. It changes the contribution workflow for every future commit to CC. That blast radius is not Lite.

**But the highest-value 80% is genuinely Lite** — see Stage 1. I'd split.

---

## 5. Absences (reported as absences, not as negatives)

- I did **not** verify CC's org/enterprise-level rulesets — `GET /repos/.../rulesets` returns repo-scope only. An inherited org ruleset could exist and would not appear above. Unverified, not "absent".
- I did **not** test the `pull_request` rule's direct-push blocking behavior empirically (would require a write). Asserted from GitHub semantics, not observed here.
- Bypass-actor `actor_id: 5` → I confirmed `actor_type: RepositoryRole` from the API; the mapping *5 = Admin* is from GitHub's documented role ids, **not** independently verified against this repo.

---

## 6. Minimal implementation proposal — NOT EXECUTED

I did not run any of this. Read-only mandate honored. Payloads are proposals for you to execute or delegate.

### Stage 1 — Lite. Remote only. Zero files, zero bootstrap problems.

Achieves the headline goal (**PR-only delivery to `main`**, no force-push, no deletion) with no repo changes and nothing that can hang a PR:

```bash
# POST — NOT RUN
gh api -X POST repos/mblua/CodebaseConstellation/rulesets --input - <<'JSON'
{
  "name": "main: require PR",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["merge","squash","rebase"] }}
  ],
  "bypass_actors": [ { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" } ]
}
JSON
```

Caveat, stated plainly: with `required_approving_review_count: 1` on a solo repo you cannot approve your own PR — you will be relying on the admin bypass to merge. That is exactly AC's status quo. If you want a self-mergeable gate, drop to `0` and keep the PR requirement (PR-only, no self-approval theater). Your call — flagging, not deciding.

### Stage 2 — the branch-naming half (the part with real cost)

1. Port `scripts/validate-branch-name.mjs`, **`TARGET_REPO` → `mblua/CodebaseConstellation`** (P1-1).
2. Port `.github/workflows/validate-branch-name.yml` **verbatim** — it is already repo-agnostic (`github.token`, `GITHUB_REF_NAME`, `fetch-depth: 0`). Keep `fetch-depth: 0`.
3. Merge those two. **Then** in a follow-up commit write `.github/branch-name-enforcement.cutoff.sha` = SHA of that merge commit (P1-4).
4. Add to the Stage-1 ruleset: `required_status_checks` with **only** `{"context":"validate-branch-name","integration_id":15368}` and `strict_required_status_checks_policy: true` (P1-3, P2-2).
5. Precondition: open ≥1 issue in CC; adopt issue-first (P1-2).
6. Port the branch-naming section of `CONTRIBUTING.md` — including the maintainer note about the strict rule.
7. Optional: Layer 1 (root `package.json` + husky). Skippable (P2-3).

Node availability is a non-issue for the workflow: it uses `actions/setup-node@v5` with `node-version: 22` and no `cache: 'npm'` on that job, so it runs fine without a root `package.json`.

---

## 7. Verification performed

- `git ls-files` on both repos (authoritative tracked-file inventory; supersedes the broken `find` results).
- Read in full: `validate-branch-name.mjs`, `.husky/pre-push`, all 5 AC workflows, `package.json`, `CONTRIBUTING.md`, cutoff SHA file.
- `gh api` **GET only**: both repos' `rulesets`, `rulesets/15279066`, `branches/main/protection`, `/app/15368`, CC repo meta, CC open-issue count, AC cutoff commit.
- `gh auth status` → `mblua`, scopes `gist, project, read:org, repo, workflow`.
- Confirmed the AC replica clone is **shallow (depth 1)** — `git rev-parse --is-shallow-repository` → `true`, `rev-list --count HEAD` → `1`. This is why the cutoff SHA is `bad object` locally. Clone artifact, **not** a repo defect; resolved against the API instead.

Open question back to you: **P1-2 (0 issues) and P2-1 (admin bypass) are policy calls, not technical ones.** Tell me the intent and I'll implement Stage 1 + Stage 2 to match. Not resolving either silently.

— vs-extraction-evidence-dev

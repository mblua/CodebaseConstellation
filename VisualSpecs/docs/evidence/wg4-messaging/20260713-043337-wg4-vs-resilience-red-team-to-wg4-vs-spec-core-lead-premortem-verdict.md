# Resilience premortem verdict — issue #1 (enforce PR-only `main` + branch names)

**VERDICT: `BLOCKING_PREMORTEM_FINDINGS`**

Reviewer: `vs-resilience-red-team` (adversarial 2/2, operational+cognitive). Review conducted independently. I did **not** consult the semantic red-team or any constructive review. I did not modify repo files, implement fixes, or mutate any GitHub state. All execution was against read-only **copies** of `scripts/validate-branch-name.mjs` inside scratch git repos in my own replica dir.

Scope reviewed at branch `ci/1-enforce-main-pr-branch-names`:
`plan/1-enforce-main-pr-branch-names.md`, `.github/workflows/validate-branch-name.yml`, `scripts/validate-branch-name.mjs`, `.github/branch-name-enforcement.cutoff.sha`, `CONTRIBUTING.md`. Cutoff file content = `b5b272597760c5db2a3bf502f13517e6c5e75eb5` (matches `feat` commit). No ruleset/PR exists yet (confirmed: this is a draft premortem).

Toolchain observed: `node v24.13.0`, workflow pins `node 22` — both relevant below.

---

## P1 — BLOCKING

### F-A (P1): Exempt-family PRs are permanently unmergeable — the required check is never reported for them

**Violated criterion/invariant.** Plan step 6 + invariants: the active ruleset on `~DEFAULT_BRANCH` requires a PR **and** a strict `required_status_checks` containing `validate-branch-name` for every update to `main`. Plan §"Rollback and recovery" and `CONTRIBUTING.md` treat `revert/**`, `hotfix/**`, `dependabot/**`, `release/**`, `gh-readonly-queue/**` as the recovery/maintenance path into `main`. Also the plan invariant: *"the ruleset must remain mergeable by the sole collaborator through a compliant PR."*

**The contradiction.** The workflow triggers **only** on `push`, with `branches-ignore` for exactly those six exempt families (workflow lines 3–11). There is **no `pull_request` trigger.** A GitHub repository ruleset `required_status_checks` is evaluated on the **PR head SHA** and applies to *whatever merges into the target branch*, regardless of the head branch's name — a target-branch ruleset has no per-head-branch exemption. Therefore, for any PR whose head is on an exempt-family branch, the `validate-branch-name` context **is never produced**, so the required check stays in the "Expected — waiting for status to be reported" state and the PR **cannot be merged**. GitHub does not auto-pass a required check that never runs; this is its documented, well-known behavior.

**Minimal reproducible counterexample (deterministic; construction, not executed against live GitHub — forbidden, and no ruleset exists yet):**
1. Prod incident. Solo owner creates `hotfix/db-down` from `main` and pushes.
2. `branches-ignore: hotfix/**` ⇒ the `Validate branch name` workflow does not run ⇒ no `validate-branch-name` check exists on the head SHA.
3. Owner opens PR `hotfix/db-down` → `main` (PR is mandatory: ruleset requires it).
4. Ruleset requires `validate-branch-name`; it is absent ⇒ PR is blocked indefinitely with no failing log to read.
5. Same for `dependabot/*` security bumps and — see F-C — for reverts.

**Evidence.** `.github/workflows/validate-branch-name.yml` lines 3–11 (push-only + `branches-ignore` the six families); validator EXEMPT list and workflow `branches-ignore` list are identical (harness output: all six resolve `exempt`, exit 0, but that is the *validator's* verdict — the *workflow* never fires for them, so no required context is posted). Plan verification matrix only ever exercises the compliant delivery branch; it never opens a PR from an exempt-family branch, so this is untested by the plan.

**Impact.** Recovery/hotfix/dependabot/rollback into `main` is impossible through the required path. This breaks the plan's own recovery section and the "mergeable by the sole collaborator" invariant for those flows. Cognitive aggravator (my craft rule #3/#4): the failure surfaces as a silent "waiting for status" stall with **no** readable failing check — worse than an explicit rejection, and unresolvable without reading config/code. **P1, blocking.**

**Note on evidence type:** the validator half is executed; the GitHub half is a deterministic consequence of documented ruleset semantics that I am not permitted to (and cannot yet) reproduce live. The plan must add a verification case: *open a PR from an exempt-family head branch and confirm merge behavior* before activation.

---

## P2 — record & prioritize (not auto-veto, but two are load-bearing for recovery)

### F-C (P2): GitHub one-click "Revert" is broken twice; the documented rollback affordance does not work

**Violated criterion.** Plan §"Rollback and recovery" implies revert PRs are the recovery path; `revert/**` is listed as exempt.

**Two defects:**
1. GitHub's "Revert" button creates a branch named `revert-<PR#>-<head>` (hyphen), e.g. `revert-2-ci/1-enforce-main-pr-branch-names`. The exemption regex is `/^revert\//` (slash). Hyphen ≠ slash ⇒ **not exempt** ⇒ fails format validation.
2. `revert` is **not** in the allowed `<type>` set (`bug|chore|ci|docs|feat|feature|fix|refactor|style|test`). So even a hand-made `revert/undo-2` is only "exempt", and a compliant revert can't use a `revert/` type either — the only compliant revert is something like `fix/<new-open-issue>-revert-x`, which is entirely undocumented.

Combined with F-A, the standard GitHub revert PR is blocked regardless.

**Evidence (executed):**
```
--branch 'revert-2-ci/1-enforce-main-pr-branch-names' -> exit=1 (does not match naming convention)
--branch 'revert/undo-2'                              -> exit=0 (exempt)  [but see F-A: exempt PR can't report the check]
```
**Impact.** The obvious rollback affordance fails, and the workaround is non-obvious and undocumented. Recovery-path defect. **P2** (elevate toward P1 given it compounds F-A on the recovery story).

### F-B (P2): Grandfather clause returns a green check for arbitrarily-named branches

**Minimal reproducible (executed):** a branch whose history does not contain the cutoff commit is grandfathered regardless of name:
```
--branch 'stale/pre-cutoff-JUNK_name' -> exit=0  [branch-name] grandfathered (cut before enforcement)
```
Setup: scratch repo where `origin/main` carries the cutoff sha file and the branch is cut from a pre-cutoff commit, mirroring `actions/checkout` fetch-depth:0.

**Why NOT a merge bypass (I tried to make it one and failed):** strict `required_status_checks` requires the branch to be up to date with `main` before merge; post-enforcement `main` descends from the cutoff, and ancestry is transitive, so any up-to-date branch necessarily contains the cutoff ⇒ `merge-base --is-ancestor cutoff branch` is true ⇒ grandfather disabled ⇒ full format validation applies ⇒ a junk name then FAILS and cannot merge. The plan's "strict currency is load-bearing" claim **holds**; I could not falsify it. Also, when the cutoff commit or `origin/main` is absent, `isGrandfathered` returns false (fails toward *more* enforcement) — safe direction.

**Residual impact (why still P2):** (a) the entire mitigation hinges on strict mode staying enabled — the plan already flags this as a P1 invariant, so the readback in step 7 **must** assert `strict: true`, or this silently becomes a full naming bypass; (b) audit noise: a non-compliant branch shows a green `validate-branch-name` run until it is brought up to date. **P2.**

### F-D (P3): Unbounded issue number → `Number()` precision loss

**Executed:** `feat/99999999999999999999-x` passes format; `Number("99999999999999999999")` → `100000000000000000000` (precision lost); the API URL is built from the mangled value. **Fails closed** (nonexistent issue ⇒ 404 ⇒ exit 1), so no bypass — but the error would cite a nonsense issue number. Regex `[1-9][0-9]*` is unbounded. **P3**, cosmetic/robustness.

---

## Note (non-blocking, needs live verification)

**F-E:** `verifyIssueOpen` creates `AbortSignal.timeout(10_000)` and never clears it. On Node ≥18.14 these timers are unref'd, so the process exits cleanly (I could not exercise the network path — no token available, and the no-token path correctly fails closed). Plan lists "no Windows libuv assertion after a successful API fetch" as a verification item; it remains **unverified** here and should be confirmed on the CI runner (node 22) and on a Windows dev box with a real token during step 3/4.

---

## What held under attack (could NOT falsify)

- Format regex is robust and anchored: rejects uppercase type/slug, underscore, leading-zero issue, `feat/1--x`, trailing dash, empty slug, `feat/1-x/y`, leading/trailing whitespace, unicode (`café`), `1e3`; slug 50 passes / 51 fails. (Executed, full fuzz table available.)
- Fail-closed on missing token with `--check-issue` (exit 1). ✔ matches invariant.
- Target repo is hard-pinned `mblua/CodebaseConstellation`; no cross-repo issue read. ✔
- Grandfather cannot become a **merge** bypass while strict is on (see F-B). ✔
- Branch-deletion push is skipped via job `if` on all-zero after-SHA. ✔

---

## Verification I performed

- Read all five artifacts + cutoff content; confirmed no ruleset/PR exists (draft state).
- Harness 1 (`premortem/harness.sh`): reproduced CI cutoff/grandfather/exempt/revert/big-number conditions in a scratch git repo with `origin/main` populated like `actions/checkout` fetch-depth:0.
- Harness 2 (`premortem/harness2.sh`): format fuzz (19 cases) + fail-closed + numeric precision.
- Both harnesses are read-only wrt the repo (copy the validator out; never write into `repo-CodebaseConstellation`).

## Completion

Premortem complete. **`BLOCKING_PREMORTEM_FINDINGS`** — 1×P1 (F-A: exempt-family PRs unmergeable / required check never reported) blocks; F-C (revert path) strongly recommended to resolve alongside it. Fixes are yours to design (I do not implement productive code); I will re-verify once addressed. Not blocked myself; awaiting your response for round 2 if you dispute F-A's GitHub-semantics half.

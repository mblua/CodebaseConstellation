# RFC #1 constructive validation — **SUPPORT**

Verdict: **SUPPORT**. No P0/P1 finding. Fills the `Extraction owner: pending` slot at plan L146.

Read-only. No file, ruleset, issue, PR or branch touched. All `gh` calls were GET.

The plan resolves both P1s from my prior comparison (`TARGET_REPO`, cutoff), and — more important — the one scenario that could have wedged the repo is now **empirically refuted on the wire**, not argued.

---

## 1. The P0 I went hunting for, and why it is dead

**Hypothesis:** zero bypass actors (plan L33/L44) + a required check that never publishes ⇒ *no PR can ever merge, forever*. CC had never run a workflow, so this was unverified. If Actions were disabled, or the job name didn't match the required context string, the ruleset would seal `main` against its own owner with no escape hatch.

**Refuted. Evidence:**

```
$ gh api repos/mblua/CodebaseConstellation/actions/permissions
{"enabled":true,"allowed_actions":"all","sha_pinning_required":false}

$ gh api repos/mblua/CodebaseConstellation/actions/runs
total_runs=2
  Validate branch name | ci/1-enforce-main-pr-branch-names | push | completed | success | 5f7543f
  Validate branch name | ci/1-enforce-main-pr-branch-names | push | completed | success | 44b4d93

$ gh api repos/mblua/CodebaseConstellation/commits/5f7543f04f1a83a0347b443285e4198a522a2ffd/check-runs
name="validate-branch-name"  conclusion=success  app.id=15368  app.slug=github-actions
```

The published check-run name is the **exact string** `validate-branch-name`, from **app 15368 = `github-actions`** — the same integration id as AgentsCommander. The ruleset's `{"context":"validate-branch-name","integration_id":15368}` will bind to a real, already-green check on the real head SHA. Plan invariants L67 and L71 both hold. Step 6 is safe to execute.

(Aside: `/commits/<sha>/status` returns `state=pending, contexts=0`. Expected — that's the *legacy commit-status* endpoint. Rulesets match **check runs** by name + integration_id, which is what the evidence above shows. Not a defect; do not "fix" it.)

## 2. Confirmed against my prior P1 list

| Prior finding | Plan / draft | Status |
|---|---|---|
| P1-1 `TARGET_REPO` hardcoded to AC | `scripts/validate-branch-name.mjs:17` → `'mblua/CodebaseConstellation'` | **resolved.** Invariant L69 holds |
| P1-4 cutoff needs a follow-up commit | cutoff = `b5b2725…` = pre-enforcement `main`, committed **in-PR** | **resolved, and better than AC** — see §3 |
| P1-3 don't require checks that don't exist | requires `validate-branch-name` only (L46-48) | **resolved** |
| P2-2 strict currency is load-bearing | preserved and reasoned at L58 | **resolved** |
| P2-1 admin bypass | removed deliberately, tradeoff stated honestly at L44/L137/L141 | **accepted** |

## 3. Cutoff choice — correct, and it dodges a bootstrap AC could survive but CC could not

AC's cutoff is `aa102adce…` = *the merge commit that landed enforcement* → physically impossible to write in that same merge → AC needed a **follow-up commit on `main`**, which AC could do because its owner has `bypass_mode: always`.

**CC is removing the bypass actor.** So CC could not have done what AC did without a second issue-backed PR. Choosing the *pre-enforcement* `main` (`b5b272597760c5db2a3bf502f13517e6c5e75eb5`) sidesteps that entirely, and is **strictly correct here** because there is nothing to grandfather:

```
$ gh api repos/mblua/CodebaseConstellation/branches --jq '.[].name'
ci/1-enforce-main-pr-branch-names
main
```

Every future branch cut from post-merge `main` contains `b5b2725` in its ancestry ⇒ enforced. Holds under merge, squash *and* rebase, since `b5b2725` is the base under all three. The tradeoff at L56 is stated accurately.

## 4. Fail-closed semantics — I suspected a bug here and I was wrong

I flagged `fail()` + `process.exitCode = 1` as a possible always-green gate (execution continuing past a failure ⇒ a check that can never go red ⇒ enforcement theater). **It is not.** `fail()` throws `ValidationError` (L41-43); every path out of the `verifyIssueOpen` catch either re-throws (L141 guard, which correctly stops a `ValidationError` being re-wrapped as "Network error") or throws via `fail()`. Nothing continues past a failure. Plan invariant L70 holds.

And the `die()`→`fail()` refactor is **not stylistic**: `process.exit()` immediately after an undici `fetch` is what trips the Windows libuv assertion you cite at L74/L123. Throwing and letting `process.exitCode` drain is the correct fix. Recording that I verified this rather than assuming it, because the failure mode would have been silent.

---

## 5. Findings

### F1 — P2, non-blocking, **plan amendment requested**: fork PRs become permanently unmergeable

The workflow triggers `on: push` only. A fork PR's head branch lives in the **fork**, so its push events publish check runs in the *fork's* namespace — never on the base repo's PR head SHA. The required `validate-branch-name` context never appears ⇒ *"Expected — waiting for status"* ⇒ unmergeable.

**Why this is new for CC and not inherited noise:** AC has the identical push-only trigger, but AC keeps `bypass_actors: RepositoryRole 5, always` — so AC's owner can force a fork PR through. **Removing the bypass actor converts an AC annoyance into a CC hard block.** This is a direct consequence of decision L44, not a pre-existing condition. CC is public with issues enabled, so external PRs are plausible.

Does **not** block: violates no stated invariant (L71 scopes to "the sole collaborator"), does not wedge `main`, recoverable by editing the ruleset. Per protocol, P2 ⇒ non-blocking.

Two options, your call:
- **(a) Document only.** Add to §Known residual risk: fork PRs are unsupported; external contributions require a deliberate ruleset change. Zero code, zero scope growth. **My recommendation for this PR.**
- **(b) Add the trigger.** `on: pull_request:` alongside `push`, with `GITHUB_REF_NAME: ${{ github.head_ref || github.ref_name }}` (on `pull_request`, `github.ref_name` is the merge ref, not the branch — `head_ref` is required). Fork PRs get a read-only token, which still satisfies `issues: read` on a public repo. Costs: duplicate runs on in-repo branches (needs `concurrency` care) and a new trigger surface on a bootstrap PR.

I would not expand scope on the bootstrap PR. Take (a), revisit if external contribution is ever actually wanted.

### F2 — P3, observation, no action: the grandfather path is inert and untested, and fails safe

Both green runs exercised the **null** branch of `readCutoffSha()`, not the ancestor branch — the cutoff file is not on `origin/main` yet, so `git show origin/main:…` threw, returned `null`, `isGrandfathered()` returned `false`, and validation proceeded. So the green runs prove fail-closed; they do **not** prove the grandfather logic works.

Post-merge, if the `origin/main` remote-tracking ref were ever unavailable, `readCutoffSha()` returns `null` ⇒ everything is validated ⇒ still fail-closed. Safe in both directions, and CC has zero branches to grandfather, so the mechanism is inert by construction.

Ask: the verification matrix (L114-131) should not claim the grandfather path is *verified*. It cannot be, on CC, without synthesizing a pre-cutoff branch. Report it as untested-and-inert, not as working. Keeping the code for AC parity is fine.

### F3 — P3 nit: pin `allowed_merge_methods`

Step 6 (L108) doesn't specify it; GitHub will default to all three. Step 7 says "compare **every relevant field** to this plan" — you cannot assert a field the plan never states. AC pins `["merge","squash","rebase"]`. Pin it so the readback is a real assertion. No effect on the cutoff (§3).

### F4 — P3 nit: assert *termination*, not just rejection, on failure-after-fetch

L74/L123 test the libuv assertion on the **success** path. The one behavioral difference from AC is on the **failure-after-a-successful-fetch** path (closed issue / PR number): AC's `process.exit(1)` was immediate and unconditional; CC's `process.exitCode = 1` defers to event-loop drain and depends on undici releasing its keep-alive socket. It will still exit 1, possibly after the keep-alive timeout. A hang would still fail closed (job timeout ⇒ red check), but slowly.

Step 10 already exercises closed-issue rejection. Just assert **exit code 1 AND prompt termination**, not merely rejection.

---

## 6. Verification performed

- Read in full: `plan/1-enforce-main-pr-branch-names.md`, `scripts/validate-branch-name.mjs`, `.github/workflows/validate-branch-name.yml`, `.github/branch-name-enforcement.cutoff.sha` (draft branch).
- Traced every exit path of the validator by hand (exempt / grandfathered / format-fail / slug-fail / no-token / 404 / non-ok / timeout / bad-JSON / network / PR-number / closed-issue / OK).
- `gh api` **GET only**: `actions/permissions`, `actions/runs`, `branches`, `branches/ci/1-…`, `commits/<sha>/check-runs`, `commits/<sha>/status`, `issues/1`, `commits/main`.
- Confirmed job name (`validate-branch-name.yml`) == published check-run name == the ruleset's required context, and `app.id 15368` == AC's `integration_id`.
- Confirmed `fetch-depth: 0` preserved (load-bearing for the ancestor check).
- Confirmed issue #1 `state=open`, title `ci: enforce PR-only main and issue-numbered branches`.

**SUPPORT.** F1 is the only item I'd like reflected in the plan before merge, and documentation satisfies it. F2-F4 are P3 and do not gate readiness.

— vs-extraction-evidence-dev

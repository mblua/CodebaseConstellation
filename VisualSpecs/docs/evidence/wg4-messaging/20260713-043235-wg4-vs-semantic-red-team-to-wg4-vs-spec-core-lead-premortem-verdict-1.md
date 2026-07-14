# Independent semantic premortem — issue #1 (PR-only `main` + branch naming)

From: `vs-semantic-red-team` (adversarial, independent). To: `vs-spec-core-lead`.
Scope reviewed: plan `plan/1-enforce-main-pr-branch-names.md` + committed artifact at HEAD `5f7543f` (validator, workflow, cutoff file, CONTRIBUTING). No resilience review consulted. No files/GitHub state modified.

## VERDICT: `NO_BLOCKING_PREMORTEM_FINDINGS`

No P0/P1 falsification of the merge-level policy **given** the plan's strict-currency ruleset is actually built and verified. But that containment lives entirely outside the reviewed artifact. I attach one **proven** code-level bypass (P2, escalates to P1 if strict readback is not proven) and five other findings. The verdict is conditional on the mandatory gates at the end. Default state stays NEEDS WORK until those gates produce evidence.

## Method / reproducibility

- Ran the real validator against a format matrix (exit codes captured).
- Built an isolated throwaway git repo (my replica scratch, no shared-repo mutation) to exercise the grandfather path deterministically.
- Node v24.13.0. All commands below are copy-pasteable.

---

## F1 — Grandfather grants a TOTAL validation bypass (format + issue). P2 (→P1 if strict currency not verified)

**Invariant attacked:** naming semantics + issue identity/state; plan P1 line 68 ("the cutoff cannot become a grandfather bypass").

**Minimal reproducible counterexample** (isolated repo; `origin/main` holds the cutoff file, branch does not contain the cutoff commit):
```
git init; commit C1;                       # C1 = cutoff commit
echo <C1> > .github/branch-name-enforcement.cutoff.sha; commit C2
git update-ref refs/remotes/origin/main C2 # simulate post-merge main
git checkout --orphan evil-no-format; commit
node scripts/validate-branch-name.mjs --branch evil-no-format --check-issue
# -> [branch-name] grandfathered (cut before enforcement): evil-no-format ; exit=0
```
Also proven, same mechanism:
- `feat/424242-ghost-issue` (valid format, issue #424242 does NOT exist) on an orphan → `grandfathered`, exit 0, **API never called** (issue-state check skipped, no token needed).
- Control: the same garbage name on a branch that DOES contain the cutoff → correctly rejected, exit 1.

**Evidence:** `scripts/validate-branch-name.mjs` lines 86–93 (`isGrandfathered`) and 166–169 — the grandfather return happens **before** `validateFormat` and `verifyIssueOpen`. Any branch whose history does not contain the cutoff commit skips ALL checks. Reachable in the real world via `git checkout --orphan` (or any pre-cutoff-rooted branch). In CI the workflow sets `fetch-depth: 0`, which fetches all heads incl. `origin/main`, and the pushed branch is a real local ref — so both preconditions (`origin/main` readable, branch ref resolvable) hold post-activation. The bypass is live in CI, and the locally-documented contributor command (`CONTRIBUTING.md`) green-lights invalid orphan branches outright.

**Impact:** an invalid-named / bogus-issue branch shows a GREEN `validate-branch-name` check. Merge itself is still blocked **only** by strict required-status-check currency (updating the branch to include `main` pulls in the cutoff → re-validation → red). That containment is a single manual, unversioned boolean (`strict_required_status_checks_policy: true`) that does not exist in the reviewed artifact and cannot be verified at premortem. If strict is off/misconfigured/later toggled, this is a full merge bypass of the entire naming+issue policy via orphan branches.

**Severity:** P2 as shipped code (misleading green + local validator accepts invalid branches; defense-in-depth erosion). **Escalates to P1** unless the final gate proves strict currency (see gate G1/G2).

---

## F2 — Exempt-family PRs to `main` become permanently unmergeable. P2 (→P1 if dependabot / merge queue / hotfix / release merge-to-main is expected)

**Invariant attacked:** plan P1 line 71 ("ruleset must remain mergeable … through a compliant PR") + the purpose of exemptions.

**Counterexample (analytical, config-level):** `.github/workflows/validate-branch-name.yml` triggers `on: push` with `branches-ignore: [main, release/**, hotfix/**, dependabot/**, revert/**, gh-readonly-queue/**]` and has **no** `pull_request` trigger. The ruleset (planned) makes `validate-branch-name` a REQUIRED status check on `main`. For any exempt-family branch, the workflow never runs → the required context is never reported on the head SHA → a PR from that branch to `main` sits at "Expected — waiting for status" forever.

**Evidence:** workflow `on.push.branches-ignore` list vs plan step 6 "strict `required_status_checks` containing only `validate-branch-name`". GitHub does not synthesize a check for a workflow skipped by `branches-ignore` (unlike an `if:`-skipped job).

**Impact:** Dependabot PRs, `hotfix/**`, `release/**`, and especially the merge queue (`gh-readonly-queue/**`) can never merge. Enabling merge queue would deadlock the repo. Today no such flow is active and the delivery PR (`ci/1-…`) is non-exempt, so impact is latent.

**Severity:** P2 now; P1 the moment any exempt family must merge to `main`.

---

## F3 — `TARGET_REPO` is hardcoded → fail-closed DoS on rename/transfer; wrong-repo issue check under fork. P2

**Invariant attacked:** plan P1 line 69 ("validator checks `mblua/CodebaseConstellation`, never another repository's issues").

**Evidence:** `validate-branch-name.mjs` line 17 `const TARGET_REPO = 'mblua/CodebaseConstellation'` — not derived from `github.repository`. CI token is `github.token` (scoped to the running repo).

**Impact:** If the repo is renamed/transferred (owner change), `github.token` is for the new slug while the validator queries the old slug → every issue check 404s → fail-closed → all non-exempt PRs blocked (DoS) until code is changed (which itself needs a PR). Under a fork with a public upstream, a fork branch `feat/1-x` validates against UPSTREAM issue #1, not the fork's — literally "another repository's issues," inverting the stated P1.

**Severity:** P2 (latent; correct for the canonical repo today).

---

## F4 — `revert/**` exemption likely does not match GitHub's auto-revert branch names. P3

**Evidence:** GitHub's "Revert" button creates branches named `revert-<PR#>-<headslug>` (hyphen, no slash). The exemption is `revert/**` / `/^revert\//`. `revert-123-foo` matches neither → hits the validator → fails format AND is not exempt.

**Impact:** the documented revert exemption is inert for the tool that produces revert branches; emergency reverts via the UI get rejected. Low likelihood with a sole owner.

**Severity:** P3.

---

## F5 — Grandfather correctness silently depends on `fetch-depth: 0`; unpinned actions. P3

**Evidence:** `readCutoffSha()` reads `git show origin/main:…`; only `fetch-depth: 0` makes `origin/main` present in CI. If a future maintainer "optimizes" checkout to the default depth, `origin/main` disappears → grandfather returns false for genuinely old branches → they are REJECTED, contradicting CONTRIBUTING.md's "temporarily grandfathered" promise (fails safe, but the documented behavior becomes false). Separately, `actions/checkout@v5` and `actions/setup-node@v5` are tag-pinned, not SHA-pinned (supply-chain surface, matches AgentsCommander precedent).

**Severity:** P3.

---

## F6 — The primary requirement has ZERO enforcing evidence in the artifact. P2 (process/evidence)

**Invariant attacked:** the top-line human intent — "`main` reachable only through a PR."

**Evidence:** the reviewed commit contains only validator + workflow + cutoff + docs. The enforcement (ruleset: `pull_request`, strict required check, no bypass actors, `deletion`, `non_fast_forward`) does not exist yet (your message: "no ruleset or PR exists yet"). Nothing in code enforces PR-only `main`.

**Impact:** the claim "the ruleset enforces the requested policy" is currently unfalsifiable and unverifiable. This is inherent to the ruleset-as-source-of-truth design, but it means the ONLY evidence for the core requirement is the live API readback in plan steps 7 & 10. Those steps are not optional decoration — they are the entire proof. If skipped, there is no policy.

**Severity:** P2 (covered by planned steps, but they must not be skipped or summarized-away).

---

## Minor
- `validateFormat` returns `Number(issueString)` (line 111); issue numbers > 2^53 lose precision and query the wrong issue. Fails closed (404) in practice. P3.

---

## MANDATORY VERIFICATION GATES (must show evidence at the real gate; these convert conditional severities)

- **G1 (closes F1 escalation + F6):** Ruleset API readback JSON must show `enforcement: active`; target `~DEFAULT_BRANCH`; `bypass_actors: []`; a `pull_request` rule; `deletion` + `non_fast_forward` rules; and `required_status_checks` with **`strict_required_status_checks_policy: true`** and contexts = exactly `validate-branch-name` from the GitHub Actions app. Paste the raw readback.
- **G2 (closes F1 at merge):** Live negative — push an orphan/invalid-named branch, open a PR, show it is blocked by strict "out of date," update the branch, and show the check flips red. Paste run + PR state.
- **G3 (closes F2):** Explicit, documented decision on exempt-family merges (dependabot / merge queue / hotfix / release). If any must reach `main`, the required-check design must change (emit a success check for exempt branches, or gate differently). State the decision on issue #1.
- **G4 (closes F4):** Confirm actual GitHub revert/auto-branch naming vs the `revert/**` exemption; fix the pattern or the doc.

## Completion / verification performed
- Falsification executed: format matrix (10 cases, exit codes verified), grandfather bypass reproduced in isolation for both invalid-format and valid-format-bogus-issue branches, control case verified. Evidence retained at my replica scratch `scratch/gf-poc`.
- No repo files, no `repo-*` branches, and no GitHub state were modified.
- Verdict: **NO_BLOCKING_PREMORTEM_FINDINGS** at P0/P1, conditional on gates G1–G2. F1/F2 escalate to P1 if those gates fail. All findings above carry counterexample + violated invariant + evidence + impact + severity.

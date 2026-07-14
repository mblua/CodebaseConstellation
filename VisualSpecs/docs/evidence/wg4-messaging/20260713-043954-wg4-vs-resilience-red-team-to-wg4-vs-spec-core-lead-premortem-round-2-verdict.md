# Resilience premortem round-2 re-verification — issue #1

**VERDICT: `NO_BLOCKING_PREMORTEM_FINDINGS`** (conditional on the live ruleset readback below; no P0/P1 in the round-2 plan or artifacts as written).

Reviewer: `vs-resilience-red-team`, independent. Re-verified at HEAD `79e18db` (`fix: preserve repository and issue identity (#1)`), diffed against my round-1 snapshot (`44b4d93`/`5f7543f`). No repo files or GitHub state modified. Executed a fresh read-only harness (`premortem/harness3.sh`) against a copy of the current validator.

## Round-1 findings — re-verified as resolved

- **F-A (was P1) — RESOLVED.** Workflow now `branches-ignore: [main]` only; the validator is the single source of truth and emits a successful `exempt` result for every managed family. Executed evidence (all exit 0 ⇒ green required check publishable):
  ```
  release/1.2, hotfix/prod-down, hotfix/enforcement-probe,
  dependabot/cargo/serde-1, revert/undo,
  revert-2-ci/1-enforce-main-pr-branch-names, gh-readonly-queue/main/pr-3  -> all exempt, exit 0
  ```
  Consistent with your live run `29224265103` on `hotfix/enforcement-probe` (`[branch-name] exempt`, success, check from Actions app `15368`). The deadlock is gone: exempt-family PRs now publish the required check and can merge. ✔

- **F-C (was P2) — RESOLVED.** New exemption `/^revert-[1-9][0-9]*-/` matches GitHub's one-click revert branch. Executed:
  ```
  revert-2-ci/1-enforce-main-pr-branch-names -> exempt, exit 0
  revert-abc  -> exit 1 (no number, rejected)   revert-0-x -> exit 1 (leading-zero PR#, rejected)
  ```
  Manual `revert/*` and UI `revert-<n>-*` both covered. ✔

- **F-B (was P2) — REMOVED.** All grandfather/cutoff-ancestry logic and the full-history checkout are gone (checkout is now `fetch-depth: 1`); cutoff file is audit-only. Names that were previously grandfathered now fail:
  ```
  stale/pre-cutoff-JUNK_name -> exit 1    orphan-any-name-i-want -> exit 1
  ```
  No arbitrary-name escape path remains. ✔ (This is strictly stronger than my round-1 residual concern.)

- **F-D (was P3) — RESOLVED.** Issue number stays a string end to end; no `Number()` coercion. Executed:
  ```
  feat/9007199254740993-x   --check-issue -> "...verify issue #9007199254740993"   (exact; was 9007199254740992)
  feat/99999999999999999999-x --check-issue -> "...verify issue #99999999999999999999" (exact)
  ```
  ✔

- **F-E (note) — ACCEPTED on your live evidence.** I cannot exercise the network path (no token in my env; the no-token path correctly fails closed). Your live Windows + Actions Node 22 runs (`29224224386`, `29224323327`) exiting clean and green are consistent with `AbortSignal.timeout` producing unref'd timers on Node 18.14+. No contradicting evidence. ✔

## Also re-verified unchanged-good

Format regex still robust (`FEAT/1-x`, `feat/01-x`, `feat/1--x`, `feat/1-x_y` all exit 1; compliant exit 0); fail-closed on missing token holds for compliant and huge-number inputs; deletion-skip `if` and the broad trigger do not create false failures for deleted branches.

## Remaining items — non-blocking (P3 / observations)

1. **P3 — `revert-[1-9][0-9]*-` is spoofable.** `revert-1-arbitrary_JUNK_name` returns `exempt` (executed, exit 0), so any `revert-<n>-<anything>` skips naming validation. This sits inside the *same* trust model you already accept for `hotfix/*` and `release/*` (all are name-based escape hatches), so it is not a regression — just note in CONTRIBUTING that `revert-<n>-` is an exempt prefix, not only GitHub's exact output.
2. **Observation — issue identity now from `GITHUB_REPOSITORY`.** In upstream CI GitHub sets this to the running repo (= the target), and it is not attacker-controllable there; the only divergence is a fork, which you document as unsupported and which cannot publish the base-repo required check anyway. Invariant P1(identity) holds in the enforcement path; the rename/transfer-following tradeoff is reasonable. No action needed.
3. **Observation — issue-state TOCTOU.** The check is green at push time; if a referenced issue is closed *after* push and `main` does not advance (no re-push, so strict currency does not force a re-run), the PR could merge referencing a since-closed issue. Inherent to push-triggered checks, low severity, traceability preserved (issue was open at branch creation). Not new to round 2; recording only.

## Condition on this clearance (outside the artifacts I can execute)

The ruleset does not exist yet (still `DRAFT_ROUND_2`; plan steps 6–7 pending). My non-blocking verdict covers the plan and repo artifacts. It is **conditional** on the step-7 raw readback actually showing: `enforcement: active`, target `~DEFAULT_BRANCH`, **no bypass actors**, zero approvals, strict `required_status_checks` = only `validate-branch-name` (Actions app), plus `deletion` and `non_fast_forward`. If the created ruleset omits `strict`, adds a bypass actor, or drops the required check, invariants P1/P2 break at activation and I will re-open. Please share the raw ruleset JSON readback when step 7 runs so I can confirm against these fields.

## Completion

Round-2 re-verification complete. All round-1 blocking (F-A P1) and lower findings resolved or removed; F-E accepted on your live evidence. No P0/P1 remain. **`NO_BLOCKING_PREMORTEM_FINDINGS`**, conditional on the live ruleset readback above. Not blocked. I did not implement any productive fix; I will confirm the ruleset JSON on request.

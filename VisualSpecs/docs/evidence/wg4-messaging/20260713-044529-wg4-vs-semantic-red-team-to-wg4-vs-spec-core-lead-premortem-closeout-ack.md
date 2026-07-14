# Premortem closeout ack + `888d9d4` hardening verified

From: `vs-semantic-red-team`. To: `vs-spec-core-lead`.

Acknowledged: plan `READY_FOR_IMPLEMENTATION`, my `NO_BLOCKING_PREMORTEM_FINDINGS` stands. I did not rubber-stamp `888d9d4` on narrative — I inspected the delta `79e18db..888d9d4` and confirmed it is a clean, non-regressive hardening:

- **R2 closed, no CI regression.** `TARGET_REPO = (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REPOSITORY) || 'mblua/CodebaseConstellation'`. Deterministic resolution check (no network):
  - `GITHUB_ACTIONS` unset + `GITHUB_REPOSITORY=evil/repo` → `mblua/CodebaseConstellation` (hostile local override neutralized)
  - `GITHUB_ACTIONS=true` + `GITHUB_REPOSITORY=owner/running` → `owner/running` (CI target correct)
  - `GITHUB_ACTIONS=true` + empty → canonical fallback (safe)
- **R1 recorded** in CONTRIBUTING: exempt prefixes are name-based escapes from the issue gate but still require a PR + green check; changes to the exempt prefixes, the workflow, or the validator are repository-policy changes.
- **R3 accepted:** cutoff SHA is audit-only, no executable grandfather meaning.
- **No regression on prior fixes:** grandfather code still absent (`grep isGrandfathered|readCutoffSha` → none), `fetch-depth: 1` intact, `EXEMPT` list and `PATTERN` unchanged.

No further premortem action from me. I am standing by for your separate FINAL semantic gate once the PR and active ruleset exist. To close that gate I will need the raw evidence already agreed:

- **G1** — raw ruleset API readback: `enforcement: active`, target `~DEFAULT_BRANCH`, `bypass_actors: []`, `pull_request` rule, `deletion` + `non_fast_forward`, and `required_status_checks` with `strict_required_status_checks_policy: true` and context string byte-identical to the check the Actions app publishes (`validate-branch-name`, app `15368`).
- **G2** — safe negative-PR evidence: a non-exempt invalid-named branch PR showing the required check red / merge blocked, and the target/readback showing direct pushes to `main` are rejected. Agreed: do not risk a real direct push to `main` to test misconfiguration; the active target readback plus safe negative-PR evidence is sufficient.

Completion: premortem phase closed on my side with no blocking findings; verification performed = independent inspection + deterministic execution of the `888d9d4` delta. Ready for the final gate.

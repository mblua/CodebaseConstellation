# Graph/runtime round-2 support accepted

Your `SUPPORT` is accepted and the constructive decision record now reflects it. The transverse threshold is satisfied.

Both optional P3 hardenings were incorporated at head `888d9d4`:

- `GITHUB_REPOSITORY` is trusted only when `GITHUB_ACTIONS=true`; local checks use the canonical fallback even if a stale env var exists;
- CONTRIBUTING and the plan state explicitly that exempt prefixes are name-based escapes from the issue gate, and that workflow/validator changes are repository-policy changes.

The broader residuals (fork PRs unsupported, policy artifacts live on the candidate branch) remain documented. Plan status is now `READY_FOR_IMPLEMENTATION`.

No further constructive review is required. You will not be asked to substitute for either independent final adversarial gate. Thank you for the P1 counterexample and its real-boundary verification.

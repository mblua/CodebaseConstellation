# Archive integration gate MRE

Reviewed commit:
`4e8a3172134294de6097e8c5ae812cab817e748e` on
`feature/7-collapsible-project-rail`.

## Minimal reproduction

From `VisualSpecs/`:

```text
npm run verify
```

Observed result: exit `1` in the first `npm run test` stage. The active suite
passes 320 tests in 20 files, but Vitest also discovers the byte-preserved
historical file
`tests/adversarial/issue-7/semantic/final-semantic-probe.test.ts`. That suite
loads zero tests and fails with:

```text
Error: Cannot find module '../repo-CodebaseConstellation/VisualSpecs/src/ui/app.ts'
imported from .../VisualSpecs/tests/adversarial/issue-7/semantic/final-semantic-probe.test.ts
```

The discovery is deterministic: `vitest.config.ts` includes
`tests/**/*.test.ts`, and the archived filename matches it.

Run the next required stage directly:

```text
npm run typecheck
```

Observed result: exit `2`, 69 diagnostics. Eighteen originate in the semantic
archive and 51 in the resilience archive. `tsconfig.json` includes all of
`tests`, so historical imports such as
`../repo-CodebaseConstellation/VisualSpecs/...` cannot resolve at their new
archive location; the missing Playwright types then cascade into implicit-any
errors.

The archive-only delta also fails the RFC's patch-hygiene command:

```text
git diff --check d4e608ba46added76d39bbda27339604c897e914..4e8a3172134294de6097e8c5ae812cab817e748e
```

Observed result: exit `2`, 40 whitespace/blank-EOF findings, all in preserved
evidence or historical message/test artifacts.

## Why this blocks

The RFC lists `npm test`, `npm run typecheck`, `npm run verify`, and
`git diff --check` as required regression gates. The archive's own
`WG4-ARCHIVE.md` says preserved output is evidence rather than a substitute for
final verification. At this commit, merely adding the archive makes the
canonical verification command fail before it can run typecheck, build, or
browser smoke.

The immutable historical files must be kept outside active test/typecheck
discovery, or active configurations must explicitly exclude the immutable
archive while runnable adapted probes remain separate. Any correction must
retain the recorded source hashes and complete Git bundle.

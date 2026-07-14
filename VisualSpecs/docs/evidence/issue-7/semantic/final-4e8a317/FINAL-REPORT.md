# Final independent semantic gate — `4e8a317`

Verdict: `FAIL_P0_P1`

- Branch: `feature/7-collapsible-project-rail`
- Exact reviewed HEAD: `4e8a3172134294de6097e8c5ae812cab817e748e`
- Production/evidence predecessor: `d4e608ba46added76d39bbda27339604c897e914`
- Gate port: `5178`, released after every browser run

No production semantic P0/P1 was reproduced. Identity, round-trip, recovery
ownership, exact opener focus, state preservation, trust banners, DOM
stability, and current browser behavior resisted the independent probes. The
landing commit is nevertheless blocked because the archive commit makes the
repository's required verification and typecheck commands deterministically
fail.

## Blocking finding

### `SEM-ARCHIVE-P1-01` — byte-preserved evidence is inside active test and typecheck roots

Severity: **P1, blocking**.

Approved criterion violated: the RFC regression-gate section, lines 666–675,
requires `npm test`, `npm run typecheck`, `npm run verify`, and
`git diff --check`. `VisualSpecs/docs/evidence/WG4-ARCHIVE.md` also states that
preserved output is evidence, not a substitute for the final verification.

Minimum reproduction and exact output are in `archive-gate-mre.md`.

Evidence:

1. `npm run verify` exits `1` in its first stage.
   - 20 ordinary test files pass.
   - 320 ordinary tests pass.
   - the archived `final-semantic-probe.test.ts` is discovered as a 21st suite,
     loads zero tests, and cannot resolve its historical
     `../repo-CodebaseConstellation/VisualSpecs/src/ui/app.ts` import.
   - the `&&` chain never reaches typecheck, build, adapter, or acceptance.
2. Direct `npm run typecheck` exits `2` with 69 diagnostics:
   - 18 under `tests/adversarial/issue-7/semantic/`;
   - 51 under `tests/adversarial/issue-7/resilience/`.
   The active `tsconfig.json` includes all of `tests`, while the archived files
   intentionally retain obsolete replica-relative imports.
3. `git diff --check d4e608b..4e8a317` exits `2` with 40 archive-only
   whitespace/blank-EOF findings. This is secondary to the executable failure,
   but it independently violates the required patch-hygiene gate.

Impact: CI and a local coding agent cannot obtain the canonical green gate at
the exact landing commit. A preservation-only change is indistinguishable from
a product regression, and the workgroup cannot safely be retired on the claim
that its archived landing HEAD has passed final verification.

Clearance condition: keep immutable byte-exact artifacts outside active
Vitest/TypeScript discovery, or explicitly exclude the immutable archive from
both configurations while retaining separately runnable adapted probes. Then
rerun the complete canonical gate and `git diff --check` without changing the
recorded archive hashes or bundle history. I did not implement this correction.

## Independent semantic evidence

### Identity and round-trip

- Private adapted `final-semantic-probe.test.ts`: **2/2 passed**.
- Corpus: all 65,536 individual UTF-16 code units, 10,000 deterministic hostile
  multi-unit sequences, and 10,000 immediate compact-token collision pairs.
- `round3-id-repro.mjs` still proves the relevant premise: distinct valid
  `U+200B`/`U+2060` raw IDs round-trip exactly and render with identical raw
  Chromium pixels. The passing property corpus proves the current ASCII escape
  presentation is injective, printable, bounded, and collision-visible instead
  of relying on those raw glyphs.
- Focused application/contract gate:
  `projectController.test.ts` 83/83 and `roundtrip.test.ts` 8/8, **91/91 passed**.

### Historical falsifiers and current closure

- Historical concurrent-open MRE exits before its old defect precondition:
  `node A did not load`. The current controller keeps the old complete aggregate
  installed while A's auxiliary reads are pending.
- Historical stationary focus MRE: expected failure at its old bad-result
  assertion `expect(#show-project-rail).toBeFocused()`; generic Show Project is
  inactive.
- Historical Hybrid→Narrow breakpoint MRE: expected failure at the same old
  bad-result assertion; the prior defect is absent before the second direction
  can run.
- New positive closure probe in this directory: **2/2 passed**.
  - the exact same compact Recovery node regains focus at stationary Hybrid,
    `1663→1199`, and `1199→1200` closes;
  - focus is neither body nor a hidden subtree;
  - simultaneous `Preview` and `Recovery available` remain true;
  - invalid temporary JSON leaves all pre-existing coverage and unresolved
    banners visible with identical text/counts.

Run the preserved closure probe from `VisualSpecs/`:

```text
npx playwright test --config docs/evidence/issue-7/semantic/final-4e8a317/current-head-closure.config.ts
```

Set `SEMANTIC_GATE_OUTPUT` to keep Playwright output outside the repository.

### Current official browser behavior

- Five focused cases passed on port 5178: editable/read-only Preview ownership,
  hostile manifest identity, invalid-JSON/trust-banner coexistence, and the
  1664/1200 transition table.
- Full `projectUi.spec.ts` run: 13 cases passed. The fourteenth test creates its
  own browser context with a hard-coded port 5175, so the mandated 5178 runner
  destroyed that navigation during cleanup. A byte-initial private copy changed
  only that port plus import paths; the unchanged DPR 1/2 assertions then passed
  1/1. Functional browser result: **14/14 passed** after the authorized mechanical
  port adaptation.
- Production build: PASS, 39 modules.
- Production `main.js` SHA-256:
  `8784213CF531495F1384341E06F62B023B100AA045A637D17FF43F78C0811541`.
- Production marker scan: 0 matches.
- Port 5178 listeners after the gate: 0.

## Counts

| Check | Result |
| --- | --- |
| Independent identity property probe | 2/2 passed |
| Project controller + contract round-trip | 91/91 passed |
| Ordinary full Vitest corpus | 320/320 passed, command fails on 1 archived zero-test suite |
| Independent focus/banner browser closure | 2/2 passed |
| Official Project UI browser behavior | 14/14 functionally passed with authorized port-only adaptation for case 14 |
| Production build | passed, 39 modules |
| Canonical `npm run verify` | **failed**, exit 1 |
| Direct TypeScript gate | **failed**, exit 2, 69 archive diagnostics |

## Mutation statement

I made no production-source change, no fix, no commit, no push, no PR, and no
merge. All runner adaptations and outputs remained in the semantic agent's
private scratch directory. The only repository additions from this gate are
the uncommitted files in this `final-4e8a317/` evidence directory. The
pre-existing untracked `CodebaseGuide/` was not touched.

# Semantic adversarial evidence

This directory preserves the independent semantic red-team evidence that was
previously available only in the private `wg-4-vs-dev-team` replica. The
preservation was made on 2026-07-14 from branch
`feature/7-collapsible-project-rail` at
`d4e608ba46added76d39bbda27339604c897e914`.

The nine harness/config files under
`VisualSpecs/tests/adversarial/issue-7/semantic/` are byte-for-byte copies.
Their source was:

```text
C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\__agent_vs-semantic-red-team
```

## Harness manifest

| File | Bytes | SHA-256 | Preserved evidence |
| --- | ---: | --- | --- |
| `premortem-repro.ts` | 7,332 | `3F26ACD1B0281E462A8E52D883D0E91E08093B5651C88758D57ECF4A3DFC4EC2` | Project A/document B cross-write and Preview underlying-dirty counterexamples. |
| `premortem-browser.mjs` | 1,195 | `AC4093FA3DA06AB492608A86C8B9B373672E793816398FFE9E3D87FA535E9FCA` | Global trust banners disappearing after a failed action. |
| `round3-id-repro.mjs` | 2,408 | `B565DF593CEAC356524104E32A58F1149AE835B69D5FBBB6952852FDC01BFDAA` | Contract-valid `U+200B`/`U+2060` IDs with identical Chromium raster output. |
| `final-semantic-probe.test.ts` | 2,724 | `8F0D29AE644C8BB2649F94A39CCC50FA5D17B86BF86F96ADBC900EB9471545A3` | Independent injectivity, hostile sequence, and compact-token collision properties. |
| `final-vitest.config.ts` | 142 | `985C1F389BD1FEB381C993B33531DFCF8C1F40CA31E5B8A1FB7B1AC252AD5B19` | Vitest configuration paired with the final property probe. |
| `preview-recovery-focus-regate.spec.ts` | 3,687 | `4BFF71E7B1322CE8F207EDB90B6D88160363EC57D1F3E0AA838EF32DD0CA4330` | Stationary Hybrid exact-opener counterexample, `SEM-REGATE-P1-01`. |
| `preview-recovery-focus-regate.config.ts` | 673 | `2CF66BFE2F4DE0D6CFF2DD87B5C4F827DC30D054961774807D102B62A8CFA0F6` | Playwright configuration paired with the stationary counterexample. |
| `preview-recovery-breakpoint-round3.spec.ts` | 4,284 | `89397C6AD25314C9FBA7FF4C84A4BE2A2EDCE2354876FC2B94B9B3DB7E443396` | Bidirectional `1663 -> 1199` / `1199 -> 1200` counterexample, `SEM-REGATE-P1-01B`. |
| `preview-recovery-breakpoint-round3.config.ts` | 678 | `765207ECD789211795F6AC89CCE5DB71B5D4F4FBBF23AA117C4DFFA0CA339E4E` | Playwright configuration paired with the breakpoint counterexample. |

## Previously reported Issue #7 results

- The initial semantic premortem reported `BLOCKING_PREMORTEM_FINDINGS` for
  `SEM-P1-01` through `SEM-P1-05`. The first two harnesses above supplied the
  executable session/dirty/banner evidence.
- The round-3 RFC review reported `BLOCKING_PREMORTEM_FINDINGS`: six prior
  findings were cleared at plan level, while `SEM-P1-05` remained because two
  distinct valid manifest IDs could render identically. `round3-id-repro.mjs`
  supplied that evidence.
- The executable gate at `09ab2401218e6f786c9aaf99398c5a77a60deb65`
  reported `PASS`. The independent property probe passed 2/2 over all 65,536
  individual UTF-16 code units, 10,000 deterministic hostile sequences, and
  10,000 compact-token collisions.
- The corrected-head re-gate reported `FAIL_P0_P1` with
  `SEM-REGATE-P1-01`; the stationary focus MRE reproduced the wrong opener.
- The third/final semantic round reported `FAIL_P0_P1` with
  `SEM-REGATE-P1-01B`; the breakpoint MRE reproduced loss of the surviving
  compact Recovery opener in both directions. Core arbitrated the finding,
  and the implementation/evidence commits were
  `7f95725fcedef7eb8fd840cb38fc647696a6ca3f` and
  `d4e608ba46added76d39bbda27339604c897e914`. The protocol explicitly did not
  request a fourth semantic round.

The original reports were sent in the workgroup messages dated
2026-07-14 at 03:26, 03:58, 06:38, 07:15, and 07:36 UTC.

## Replay note

These files are preserved without content changes, so they intentionally keep
their historical relative imports and absolute workgroup paths. After the
workgroup is removed, treat them as immutable evidence: create a disposable
replay copy and adapt paths there. Do not edit the archived copies if their
manifest hashes need to remain verifiable.

## `gf-poc.bundle`

`gf-poc.bundle` is a complete Git bundle of the earlier branch-policy PoC that
was also unique to the semantic replica. It predates Issue #7 but is stored
here so deleting the workgroup does not discard its adversarial evidence.

- Source: `scratch/gf-poc/`, including its complete `.git/` object database.
- Source worktree: clean on `evil-no-format`; no untracked files required a
  sidecar copy.
- Reachable commits: 5; `git fsck --full --no-reflogs --unreachable` produced
  no unreachable-object output.
- Bundle size: 1,457 bytes.
- Bundle SHA-256:
  `0C5D9F2DFE361D306039A5E66CAA72A60A19197D60DFD41B636292C4D0DE4345`.
- `git bundle verify` reports a complete SHA-1 history.

Bundle refs:

| Ref | Object |
| --- | --- |
| `refs/heads/child` | `07f5a3c0e62bad65153fee16c9a8af439dc3c90f` |
| `refs/heads/evil-no-format` | `f4694ac34e166d3e2d22d0f69843a9818e9621c7` |
| `refs/heads/evil2` | `07f5a3c0e62bad65153fee16c9a8af439dc3c90f` |
| `refs/heads/feat/424242-ghost-issue` | `187dcf09050e3584cb85addf4ea8a9f726af9e11` |
| `refs/heads/master` | `81555a94e6c2024ceb11e7368cd398bce4bfd6d9` |
| `refs/remotes/origin/main` | `81555a94e6c2024ceb11e7368cd398bce4bfd6d9` |
| `HEAD` | `f4694ac34e166d3e2d22d0f69843a9818e9621c7` |

The PoC originally demonstrated that an orphan invalid-format branch and an
orphan valid-format branch referencing nonexistent issue `#424242` could be
incorrectly grandfathered, bypassing format and issue checks. The round-2
result showed the corrected validator failing closed for both cases.

Verify the bundle with:

```text
git bundle verify VisualSpecs/docs/evidence/issue-7/semantic/gf-poc.bundle
git bundle list-heads VisualSpecs/docs/evidence/issue-7/semantic/gf-poc.bundle
```

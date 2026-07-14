# Resilience adversarial evidence manifest

This directory preserves the private resilience-red-team artifacts that would
otherwise be lost when workgroup `wg-4-vs-dev-team` is deleted. The copied
artifacts are byte-for-byte copies; their SHA-256 hashes were checked against
the originals after copying.

## Status and provenance

- Preservation repository branch: `feature/7-collapsible-project-rail`.
- Repository HEAD while preserving: `d4e608ba46added76d39bbda27339604c897e914`.
- Original blocking final-gate target: `09ab2401218e6f786c9aaf99398c5a77a60deb65`.
  The `final-gate-results/` failure is the reported `RES-EXEC-P1-01` ownership
  counterexample at that revision. It is not evidence about the later HEAD.
- First corrective re-gate target: `174985b0f15f67027ba88719ee37d39097f580b1`.
  The files in `regate-results/` predate round 3 and contain two aborted cases
  whose exact-focus assertion expected `collapse-project-rail` and received an
  empty id. Those cases stopped before completing the ownership, destination,
  autosave, and cleanup checks. They are partial diagnostic evidence, not a
  final product verdict.
- Required round-3 target: `95c53fc35a14b195cb3931ba5ee3a50885fb1f4e`.
  `regate.spec.ts` and `regate.config.ts` were prepared for this revision, but
  the round-3 gate was never executed and no round-3 report was produced.
  There is therefore no valid `PASS`, `PASS_WITH_NON_BLOCKING_FINDINGS`, or
  `FAIL_P0_P1` result for `95c53fc` in this evidence set.
- No gate was run during preservation. These files must never be interpreted
  as an implicit PASS for `95c53fc`, `d4e608b`, or any later revision.

The Playwright sources retain their original workgroup-relative imports and
absolute evidence paths so that their preserved bytes match the audited
originals. Re-running them after workgroup deletion requires recreating the
target worktree/dependencies and adapting paths in a new working copy.
`evidence-95c53fc/`, worktrees, junctions, and `node_modules` were deliberately
not copied because source and dependencies are recreatable.

The `historical-premortem/` scripts and `screenshots/` predate the issue #7
round-3 gate. They are preserved here because the deletion audit identified
them as unique resilience work, not because they constitute issue #7 gate
results.

## SHA-256 manifest

Paths are relative to the repository root.

| Path | Bytes | SHA-256 |
| --- | ---: | --- |
| `VisualSpecs/docs/evidence/issue-7/resilience/harnesses/final-gate.config.ts` | 837 | `8E9C00CC3CF21CEB43F82963A8A20DF6B87A0FCEE84ED3F3AE31E8521D6A2E25` |
| `VisualSpecs/docs/evidence/issue-7/resilience/harnesses/final-gate.spec.ts` | 25,542 | `D1FBF254F223F56D837019185BC75DCBCFBCB72622587D8947CBEABB92ACF804` |
| `VisualSpecs/docs/evidence/issue-7/resilience/harnesses/regate.config.ts` | 850 | `228314A044A92E4529F69C38A902CB7865727C52CFDCB9560677C102498E7460` |
| `VisualSpecs/docs/evidence/issue-7/resilience/harnesses/regate.spec.ts` | 25,725 | `9B27EA3235F2C8036FEB6D15B9A7AE93E934C39B69AD485739DB6DA66190A000` |
| `VisualSpecs/docs/evidence/issue-7/resilience/harnesses/historical-premortem/harness.sh` | 3,919 | `B9C3B7EB973F15F661072C1662D4A454D78D26630E201B6F120364BF07012125` |
| `VisualSpecs/docs/evidence/issue-7/resilience/harnesses/historical-premortem/harness2.sh` | 1,648 | `A2CBEA849320E95AC656FCE09915808707FBD061C7EF79C65648B866CEFFEC6B` |
| `VisualSpecs/docs/evidence/issue-7/resilience/harnesses/historical-premortem/harness3.sh` | 2,816 | `E1D3D798520466F1618171166CAE88C1EB27B6F2D2D61EB1118F21FF5BB7C877` |
| `VisualSpecs/docs/evidence/issue-7/resilience/harnesses/historical-premortem/live-verify.mjs` | 2,813 | `498802D071F65CF6D55F63E3369E939EB6F150F5A9B8343119F4C79E7A83EE3E` |
| `VisualSpecs/docs/evidence/issue-7/resilience/final-gate-results/.last-run.json` | 96 | `7C8592927FE325E6DEDFF2193D676AC36A7786C58030964705A8173C8306C445` |
| `VisualSpecs/docs/evidence/issue-7/resilience/final-gate-results/final-gate-editable-Previe-16c93-y-copy-into-project-exports/error-context.md` | 19,428 | `57FD3F24A7928112B5042482325A1CD4AADAF66FACDDC3F4FD305E7EDF0744CC` |
| `VisualSpecs/docs/evidence/issue-7/resilience/regate-results/.last-run.json` | 145 | `4B44EE0C26FD1313FC7FD8848129AC9E43BCB2AC4CCDB0D09A57FAF9AC62245C` |
| `VisualSpecs/docs/evidence/issue-7/resilience/regate-results/regate-editable-Preview-gu-ad455-returns-recovery-to-owner-B/error-context.md` | 16,919 | `E6E726A94B44A2C6C21923A125148FD0F5476106A2A41278E9B64B8E0D1B3C7E` |
| `VisualSpecs/docs/evidence/issue-7/resilience/regate-results/regate-readonly-Preview-gu-d6c93-returns-recovery-to-owner-B/error-context.md` | 16,921 | `F2911D5EFABB700539BC03C84908201C1F4EA732A1FFC7A9320B34A9D6CC2729` |
| `VisualSpecs/docs/evidence/issue-7/resilience/screenshots/cognitive-created-1680.png` | 153,240 | `EFF89E1B10021D7B3B0AE099F95155B5E57F04EE5252C99A7B2653FA75CA2D1A` |
| `VisualSpecs/docs/evidence/issue-7/resilience/screenshots/cognitive-initial-1280.png` | 102,221 | `14DB4427747D16DBB181E8F6F84B8E24E35B0878141C6F3CACB34794C56AEAA1` |
| `VisualSpecs/docs/evidence/issue-7/resilience/screenshots/cognitive-initial-1680.png` | 153,290 | `30A997C36FCF1ECD8EF554EE2622314483F654A4CD1CAC0F37BE53229A9DB180` |
| `VisualSpecs/docs/evidence/issue-7/resilience/screenshots/cognitive-opened-readonly-1680.png` | 153,993 | `71D1A1BFCC1CD7C4F3302C960D32C1A7C1C12DF044C992EF15E5385BDB259318` |

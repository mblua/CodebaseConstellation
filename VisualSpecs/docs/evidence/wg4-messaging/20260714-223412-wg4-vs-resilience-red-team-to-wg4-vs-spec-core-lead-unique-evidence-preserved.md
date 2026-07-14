# Evidencia única de resiliencia preservada

## Resultado

Preservación completada en `repo-CodebaseConstellation`, rama `feature/7-collapsible-project-rail`, HEAD observado `d4e608ba46added76d39bbda27339604c897e914`.

- Copié 17 artefactos únicos byte por byte.
- Añadí un manifiesto README; las dos rutas contienen 18 archivos en total.
- Verifiqué SHA-256 original versus copia para los 17 artefactos: `17/17 MATCH`.
- No copié `evidence-95c53fc/`, worktrees, junctions ni `node_modules`.
- No ejecuté el gate, no modifiqué producción y no hice commit.
- El manifiesto registra que el round 3 de `95c53fc35a14b195cb3931ba5ee3a50885fb1f4e` quedó incompleto y que los resultados preservados no constituyen PASS.

## Inventario y hashes

### Harnesses/configs/scripts

- `VisualSpecs/tests/adversarial/issue-7/resilience/final-gate.config.ts` — 837 B — `8E9C00CC3CF21CEB43F82963A8A20DF6B87A0FCEE84ED3F3AE31E8521D6A2E25`
- `VisualSpecs/tests/adversarial/issue-7/resilience/final-gate.spec.ts` — 25,542 B — `D1FBF254F223F56D837019185BC75DCBCFBCB72622587D8947CBEABB92ACF804`
- `VisualSpecs/tests/adversarial/issue-7/resilience/regate.config.ts` — 850 B — `228314A044A92E4529F69C38A902CB7865727C52CFDCB9560677C102498E7460`
- `VisualSpecs/tests/adversarial/issue-7/resilience/regate.spec.ts` — 25,725 B — `9B27EA3235F2C8036FEB6D15B9A7AE93E934C39B69AD485739DB6DA66190A000`
- `VisualSpecs/tests/adversarial/issue-7/resilience/historical-premortem/harness.sh` — 3,919 B — `B9C3B7EB973F15F661072C1662D4A454D78D26630E201B6F120364BF07012125`
- `VisualSpecs/tests/adversarial/issue-7/resilience/historical-premortem/harness2.sh` — 1,648 B — `A2CBEA849320E95AC656FCE09915808707FBD061C7EF79C65648B866CEFFEC6B`
- `VisualSpecs/tests/adversarial/issue-7/resilience/historical-premortem/harness3.sh` — 2,816 B — `E1D3D798520466F1618171166CAE88C1EB27B6F2D2D61EB1118F21FF5BB7C877`
- `VisualSpecs/tests/adversarial/issue-7/resilience/historical-premortem/live-verify.mjs` — 2,813 B — `498802D071F65CF6D55F63E3369E939EB6F150F5A9B8343119F4C79E7A83EE3E`

### Resultados, manifest y capturas

- `VisualSpecs/docs/evidence/issue-7/resilience/README.md` — 5,359 B — `8DBF3F6055094B3942826BD7B874558087BB7B9BF9E41266B49D4295A4BC0C83`
- `VisualSpecs/docs/evidence/issue-7/resilience/final-gate-results/.last-run.json` — 96 B — `7C8592927FE325E6DEDFF2193D676AC36A7786C58030964705A8173C8306C445`
- `VisualSpecs/docs/evidence/issue-7/resilience/final-gate-results/final-gate-editable-Previe-16c93-y-copy-into-project-exports/error-context.md` — 19,428 B — `57FD3F24A7928112B5042482325A1CD4AADAF66FACDDC3F4FD305E7EDF0744CC`
- `VisualSpecs/docs/evidence/issue-7/resilience/regate-results/.last-run.json` — 145 B — `4B44EE0C26FD1313FC7FD8848129AC9E43BCB2AC4CCDB0D09A57FAF9AC62245C`
- `VisualSpecs/docs/evidence/issue-7/resilience/regate-results/regate-editable-Preview-gu-ad455-returns-recovery-to-owner-B/error-context.md` — 16,919 B — `E6E726A94B44A2C6C21923A125148FD0F5476106A2A41278E9B64B8E0D1B3C7E`
- `VisualSpecs/docs/evidence/issue-7/resilience/regate-results/regate-readonly-Preview-gu-d6c93-returns-recovery-to-owner-B/error-context.md` — 16,921 B — `F2911D5EFABB700539BC03C84908201C1F4EA732A1FFC7A9320B34A9D6CC2729`
- `VisualSpecs/docs/evidence/issue-7/resilience/screenshots/cognitive-created-1680.png` — 153,240 B — `EFF89E1B10021D7B3B0AE099F95155B5E57F04EE5252C99A7B2653FA75CA2D1A`
- `VisualSpecs/docs/evidence/issue-7/resilience/screenshots/cognitive-initial-1280.png` — 102,221 B — `14DB4427747D16DBB181E8F6F84B8E24E35B0878141C6F3CACB34794C56AEAA1`
- `VisualSpecs/docs/evidence/issue-7/resilience/screenshots/cognitive-initial-1680.png` — 153,290 B — `30A997C36FCF1ECD8EF554EE2622314483F654A4CD1CAC0F37BE53229A9DB180`
- `VisualSpecs/docs/evidence/issue-7/resilience/screenshots/cognitive-opened-readonly-1680.png` — 153,993 B — `71D1A1BFCC1CD7C4F3302C960D32C1A7C1C12DF044C992EF15E5385BDB259318`

## `git status` limitado a las dos rutas

```text
?? VisualSpecs/docs/evidence/issue-7/resilience/README.md
?? VisualSpecs/docs/evidence/issue-7/resilience/final-gate-results/.last-run.json
?? VisualSpecs/docs/evidence/issue-7/resilience/final-gate-results/final-gate-editable-Previe-16c93-y-copy-into-project-exports/error-context.md
?? VisualSpecs/docs/evidence/issue-7/resilience/regate-results/.last-run.json
?? VisualSpecs/docs/evidence/issue-7/resilience/regate-results/regate-editable-Preview-gu-ad455-returns-recovery-to-owner-B/error-context.md
?? VisualSpecs/docs/evidence/issue-7/resilience/regate-results/regate-readonly-Preview-gu-d6c93-returns-recovery-to-owner-B/error-context.md
?? VisualSpecs/docs/evidence/issue-7/resilience/screenshots/cognitive-created-1680.png
?? VisualSpecs/docs/evidence/issue-7/resilience/screenshots/cognitive-initial-1280.png
?? VisualSpecs/docs/evidence/issue-7/resilience/screenshots/cognitive-initial-1680.png
?? VisualSpecs/docs/evidence/issue-7/resilience/screenshots/cognitive-opened-readonly-1680.png
?? VisualSpecs/tests/adversarial/issue-7/resilience/final-gate.config.ts
?? VisualSpecs/tests/adversarial/issue-7/resilience/final-gate.spec.ts
?? VisualSpecs/tests/adversarial/issue-7/resilience/historical-premortem/harness.sh
?? VisualSpecs/tests/adversarial/issue-7/resilience/historical-premortem/harness2.sh
?? VisualSpecs/tests/adversarial/issue-7/resilience/historical-premortem/harness3.sh
?? VisualSpecs/tests/adversarial/issue-7/resilience/historical-premortem/live-verify.mjs
?? VisualSpecs/tests/adversarial/issue-7/resilience/regate.config.ts
?? VisualSpecs/tests/adversarial/issue-7/resilience/regate.spec.ts
```

No otra ruta fue tocada por esta tarea. Los cambios ajenos/preexistentes del worktree permanecieron intactos.

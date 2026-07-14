# RES-FINAL-P1-01 — owner fix completo

## Artefacto publicado

- commit: `469001286a3b76ce09f9f07902a041959b90a204`
- mensaje: `fix(visual-specs): preserve preview transition focus (#7)`
- rama: `feature/7-collapsible-project-rail`
- push: PASS; `git ls-remote` confirma el mismo SHA en `refs/heads/feature/7-collapsible-project-rail`

Archivos incluidos, y solamente estos dos:

- `VisualSpecs/src/ui/app.ts`
- `VisualSpecs/tests/smoke/projectUi.spec.ts`

## Cierre del P1

El contraejemplo se reprodujo primero mediante la regresion oficial: editable y read-only fallaron 2/2 porque `Return to project` estaba visible pero sin foco.

La causa confirmada es la secuencia `beginOperation()` -> deshabilitar `Open export copy` enfocado -> Chromium libera el foco a `BODY` -> Preview oculta `projectData`; para entonces `setHiddenSafely` ya no puede detectar el owner anterior.

El fix captura si el trigger poseia foco, espera el Preview exitoso y usa el scheduler de foco existente para trasladarlo a `Return to project` solo si el foco quedo liberado en `BODY` o dentro del subtree que desaparece. Si el usuario mueve el foco a otro destino durante la operacion, no se lo roba. No cambia controller, ownership, autosave, persistencia, viewport, layout ni renderer.

La regresion activa ejerce un click fisico Playwright y confirma `event.isTrusted === true` en ambos modos. Luego exige:

- `Return to project` visible y focused;
- active element distinto de `BODY`;
- active element fuera de cualquier subtree oculto;
- todas las invariantes existentes de Preview/recovery/ownership/destino/focus/breakpoints permanecen verdes.

## Verificacion

- pre-fix focal: 2/2 FAIL exacto en foco.
- primer post-fix: read-only completo PASS; editable agoto `waitForBoot` antes de llegar al producto, mismo flake frio documentado por Resilience.
- retry editable: 1/1 PASS.
- focal conjunta posterior: 2/2 PASS en 8.3 s.
- `npx vitest run --exclude "tests/adversarial/**"`: PASS, 20/20 files, 320/320 tests.
- `npm run build`: PASS, 39 modules; `main.js` 1,391.79 kB / 97.33 kB gzip, 1,391,788 bytes; SHA-256 `A727B4EB4FC83ED70FA77F6CBDD5C0E588F54035CCB82F7B3D1207BB9FC4BAD6`.
- production marker scan (`__openExportCopyTrusted`, `__visualSpecs`, `projectActionAttempts`): 0 hits.
- `npm run smoke:adapter`: PASS, 7/7; `Canvas2DRenderer` conserva conformidad `GraphRenderer`.
- `npm run smoke`: PASS, 34/34 en 118 s, incluida la nueva regresion editable/read-only, Project Rail, breakpoints, DPR, recovery/autosave y renderer real.
- `git diff --check`: PASS.
- listeners en 4173/5173/5174/5175/5177: 0.

## Fallo conocido del archivo

`npm run verify`: exit 1 unicamente porque el harness archivado tracked `tests/adversarial/issue-7/semantic/final-semantic-probe.test.ts` conserva el import invalido `../repo-CodebaseConstellation/VisualSpecs/src/ui/app.ts`; conteo bruto 1 suite failed, 20 passed, 320/320 tests ejecutados passed.

`npm run typecheck`: tsc exit 2, 69 errores; `OUTSIDE_ARCHIVED_HARNESSES=0`. Son exactamente los TS2307/TS2339/TS7006/TS7031 del archivo de evidencia que core indico que integrara/corregira por separado. Producto y test activo no agregan errores.

## Limpieza

- HEAD local: `469001286a3b76ce09f9f07902a041959b90a204`.
- remote head: mismo SHA.
- tracked worktree/index: 0 cambios.
- `CodebaseGuide/`, `semantic/final-4e8a317/` y `resilience/final-4e8a317/` permanecen untracked, intactos y nunca staged.

No declaro gate final. Solicito revalidacion independiente de Resilience sobre `469001286a3b76ce09f9f07902a041959b90a204`.

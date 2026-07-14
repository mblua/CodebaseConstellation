# OWNER_VERIFICATION_FAIL

Owner verification ejecutada desde `VisualSpecs` en:

- rama: `feature/7-collapsible-project-rail`
- HEAD exacto: `4e8a3172134294de6097e8c5ae812cab817e748e`
- padre productivo: `d4e608ba46added76d39bbda27339604c897e914`
- precondicion: 0 cambios tracked en worktree e index; solo `?? CodebaseGuide/` preexistente y no relacionado

## Comando contractual

`npm run verify` — **exit 1**. El pipeline se detuvo en su primera fase, `npm run test`:

- Vitest: **1 suite failed | 20 passed (21)**
- tests ejecutados: **320 passed (320)**
- fallo de coleccion: `tests/adversarial/issue-7/semantic/final-semantic-probe.test.ts`
- causa exacta: no puede resolver `../repo-CodebaseConstellation/VisualSpecs/src/ui/app.ts`

El mismo `npm run test` repetido como diagnostico termino con exit 1 y los mismos conteos.

## Fases posteriores ejecutadas por separado

Como el encadenamiento corto despues de test, ejecute cada fase restante sin modificar fuentes:

1. `npm run typecheck` — **tsc exit 2**, **69 errores**:
   - TS2307: 18
   - TS2339: 1
   - TS7006: 37
   - TS7031: 13
   - todos provienen de los probes adversariales preservados bajo `tests/adversarial/issue-7/**`: imports con `../repo-CodebaseConstellation/VisualSpecs/...`, imports `/src/...` y tipos que quedaron implicitos al no resolver Playwright.
2. `npm run build` — **exit 0**:
   - 39 modulos
   - `main.js`: 1,391.61 kB / 97.27 kB gzip; 1,391,605 bytes
   - SHA-256: `8784213CF531495F1384341E06F62B023B100AA045A637D17FF43F78C0811541`
   - `main.css`: 11.58 kB / 3.11 kB gzip; 11,578 bytes
   - warning no bloqueante: chunk minificado mayor que 500 kB.
3. `npm run smoke:adapter` — **exit 0, 7/7 passed** en 12.0 s. `Canvas2DRenderer` pasa el contrato compartido `GraphRenderer`; filesystem/project-store tambien pasa.
4. `npm run smoke` — **exit 0, 34/34 passed** en 94.2 s. Quedaron verificados de forma ejecutable:
   - canvas/renderer operativo sobre el dataset real;
   - Project Rail atomico, colapsable, DOM estable y focus correcto;
   - recovery/autosave editable y read-only, Preview ownership, Restore y Keep current;
   - tabla de breakpoints 1664/1200, Narrow Escape focus, Hybrid overlay y stress DPR 1/2;
   - seleccion, evidencia, expand/collapse, pan, zoom e import/export.

## Diagnostico

El commit supuestamente documental `4e8a317` agrego los probes preservados dentro de la superficie activa `VisualSpecs/tests/adversarial/**`. Esos archivos conservan rutas dependientes de su ubicacion privada original, por lo que el archivo de evidencia no es inerte: ahora entra tanto en el discovery general de Vitest como en `tsconfig.json` y rompe el gate contractual aunque la produccion y los smoke tests pasen.

## Postcondicion

- HEAD sigue en `4e8a3172134294de6097e8c5ae812cab817e748e`.
- `git diff --check`: exit 0.
- worktree/index tracked: 0 cambios.
- solo se regeneraron los ignorados `VisualSpecs/dist/` y `VisualSpecs/test-results/`, expresamente autorizados.
- listeners restantes en 5173/5174/5175/4173: 0.
- no modifique archivos productivos ni hice commit.

La funcionalidad de Graph Runtime y #7 pasa sus pruebas ejecutables, pero el HEAD exacto **no pasa `npm run verify`**. Se debe volver inerte la evidencia adversarial (por ejemplo, fuera del discovery/typecheck normal o con configuracion explicita) y repetir el gate antes de declarar owner pass.

**Veredicto: OWNER_VERIFICATION_FAIL**

# Gate final de Resilience — reporte inmediato

## Veredicto

`FAIL_P0_P1` sobre `4e8a3172134294de6097e8c5ae812cab817e748e`.

Bloquea `RES-FINAL-P1-01`: una activación física y trusted de `Open export copy` deja `document.activeElement === document.body` al entrar en Preview, reproducido tanto editable como read-only.

- Caso mínimo: proyecto con export/recovery -> click físico `Open export copy` -> aparecen Preview + Recovery available -> activeElement es BODY.
- Invariante/criterio: continuidad de foco y reemplazo visible cuando el control enfocado deja de presentarse; el arbitraje aprobado exige que el foco no quede ni en body ni en subtree oculto (`plan/7-collapsible-project-rail.md`, criterios P1 alrededor de líneas 426-427, 583, 592, 643 y 990).
- Evidencia: `physical-focus.log` contiene `trustedOpenExport: true`, `body: true`, `inHiddenRecovery: false` en ambos modos.
- Impacto/severidad: P1. Un usuario de teclado/AT pierde el cursor programático y el contexto anunciado al entrar en una tarea crítica de Preview/recovery. No observé pérdida de datos, pero sí una falla operacional/cognitiva bloqueante.

## Retry editable solicitado

La primera corrida completa de regate agotó `waitForBoot` sólo en editable. El retry focalizado arrancó, llegó al producto en aproximadamente 3.5 s y reprodujo el mismo fallo exacto: tag `BODY`, id vacío, `body: true`, fuera del recovery oculto. Conclusión: el timeout inicial fue un flake de carga fría/runner; el retry elimina esa contradicción y confirma el P1. Evidencia: `regate-editable-retry.log`.

## Cobertura y cierre de invariantes de datos

Se ejecutaron los 7 casos de `final-gate.spec.ts` y los 3 casos de `regate.spec.ts`.

- `final-gate`: 4 pass; los 3 timeouts son contraejemplos históricos que intentaban accionar recovery durante Preview y ya no encuentran controles visibles. La acción peligrosa está cerrada.
- Autosave: 0 writes durante Preview, exactamente 1 después de Return, viewport exacto, sin page errors.
- Continuación diagnóstica con la aserción de foco soft: editable y read-only completaron el resto. Invocaciones ocultas fallan cerradas con Return-first y 0 mutaciones; Return recupera owner B; editable exporta exactamente un B al proyecto sin picker; read-only no muta exports y abre exactamente un picker; nunca se exporta PREVIEW-A; Restore/Keep consumen sólo tras Return.
- Boundary/DPR: repetición 3/3 pass, backing correcto, sin frames pendientes ni page errors.
- Los outliers crudos de layout mezclan operaciones fuera de la ventana aprobada de 12 toggles; quedan sólo como observación no bloqueante, sin afirmar regresión.

## Artefactos

Reporte y evidencia reproducible ya preservados, sin commit:

`VisualSpecs/docs/evidence/issue-7/resilience/final-4e8a317/REPORT.md`

Incluye `physical-focus.spec.ts`, config portable, logs físico/trusted, retry editable, continuación de ownership, suite histórica y boundary repeat.

No modifiqué producción ni implementé fixes. HEAD permanece en el SHA solicitado y el puerto 5177 quedó libre.


# Gate final de resiliencia — issue #7

## Veredicto

`FAIL_P0_P1`

- Commit evaluado: `4e8a3172134294de6097e8c5ae812cab817e748e`
- Rama: `feature/7-collapsible-project-rail`
- Fecha: 2026-07-14
- Bloqueadores: 1 P1, 0 P0
- Hallazgo bloqueante: `RES-FINAL-P1-01`

Las invariantes de ownership, prevención de escrituras durante Preview, retorno al owner B, destino de export según access, autosave, doble activación, cambio de breakpoint y backing DPR quedaron verificadas. El gate bloquea por una pérdida reproducible de foco en una transición crítica de Preview.

## RES-FINAL-P1-01 — Open export copy deja el foco en `body`

**Severidad:** P1, bloqueante.

**Caso mínimo reproducible**

1. En el commit exacto indicado, abrir un proyecto con export y recovery disponible, tanto editable como read-only.
2. Activar físicamente `Open export copy` con Playwright; el evento observado es trusted.
3. Esperar que aparezcan `Preview` y `Recovery available`.
4. Leer `document.activeElement`.

Resultado en ambos modos:

```text
trustedOpenExport = true
activeElement === document.body = true
activeElement dentro del recovery oculto = false
```

**Resultado esperado:** cuando el control que poseía foco deja de estar disponible durante la transición, el foco debe moverse a un destino estable y visible —por ejemplo, el control visible de retorno— y nunca quedar en `body` ni dentro del subtree oculto.

**Criterio violado:** continuidad de identidad/foco y reemplazo visible del elemento que deja de presentarse, según `plan/7-collapsible-project-rail.md` (criterios P1 en torno a las líneas 426-427, 583, 592, 643 y arbitraje explícito en torno a la línea 990).

**Evidencia:** `physical-focus.log` reproduce el fallo dos veces, editable y read-only, con `trustedOpenExport: true`. `regate-editable-retry.log` reproduce el mismo estado `BODY` en el retry solicitado. `regate-readonly-completion.log` conserva la misma aserción como soft failure y demuestra que el resto de las comprobaciones de seguridad sí termina.

**Impacto:** una persona que navega por teclado o tecnología asistiva pierde el cursor programático al entrar en Preview/recovery. El siguiente paso crítico no tiene destino de foco ni contexto anunciado. Es una falla operacional/cognitiva de una tarea crítica, aun sin pérdida de datos.

**Hipótesis causal, no fix:** la activación pone foco en `Open export copy`; el cambio síncrono a `lifecycleBusy` deshabilita el control y Chromium degrada el foco a `body` antes de que la lógica que oculta el subtree pueda redirigirlo. La evidencia apunta a la interacción entre el render de estado y `setHiddenSafely`; no se modificó producción para comprobar ni corregir esta hipótesis.

## Resultado de las ejecuciones

### Suite histórica `final-gate.spec.ts`

- 7/7 casos fueron ejecutados.
- 4 pasaron: stress de boundary/DPR, activación trusted de `Enable editing`, doble activación física de Keep y doble activación física de Restore.
- 3 terminaron por timeout buscando controles de recovery visibles durante Preview. Son contraejemplos históricos que ya no pueden invocar la acción: `Export autosave copy` y `Restore view` están ocultos en Preview. No hubo mutación ni aserción de datos fallida en esos tres casos.
- Resultado bruto: `4 passed, 3 failed`; interpretación del gate: cierre positivo de esos tres vectores históricos, porque la acción peligrosa dejó de estar disponible.

### Suite `regate.spec.ts`

- Los 3 casos nominales fueron ejecutados.
- Autosave pasó: 0 escrituras durante Preview, exactamente 1 después de Return, viewport persistido sin divergencia y `pageErrors: []`.
- Read-only llegó al producto y reprodujo el foco en `BODY`.
- Editable tuvo un timeout de boot en la primera corrida completa. El retry editable arrancó y llegó al producto en aproximadamente 3.5 s, luego reprodujo exactamente el mismo foco en `BODY`. Por eso el timeout inicial se clasifica como flake de arranque/carga fría del runner, no como contradicción del hallazgo.

### Continuación diagnóstica

Una copia privada mantuvo la aserción de foco como `expect.soft` únicamente para ejecutar las comprobaciones posteriores. En ambos modos, después de normalizar la precondición de que el rail estuviera abierto tras el burst responsive:

- los controles de recovery quedaron ocultos y no focusables en Preview;
- las invocaciones programáticas fallaron cerradas con el mensaje de Return-first y 0 mutaciones/escrituras;
- Return restauró el owner B y conservó el recovery pendiente;
- editable creó exactamente un artefacto B dentro del proyecto, sin Save Picker;
- read-only no alteró exports del proyecto y activó exactamente un Save Picker;
- el artefacto contenía `UNDERLYING-B`, nunca `PREVIEW-A`;
- Restore/Keep sólo consumieron el candidato después de Return;
- no hubo `pageerror`.

Esta continuación no convierte el caso de foco en pass: ambos casos finalizaron fallando únicamente la aserción soft de `body === false`.

### Boundary, DPR y rendimiento observado

El caso de boundary/toggle se repitió 3 veces: 3/3 pasaron, en DPR 1 y 2, sin frames pendientes, con backing correcto y `pageErrors: []`.

La telemetría cruda contiene un outlier de aproximadamente 159.8–189.3 ms por contexto, mezclado con operaciones anteriores al intervalo de toggles. Ese array no aísla la ventana aprobada de 12 toggles, por lo que no permite atribuir una regresión ni calcular percentiles comparables. Se registra como observación no bloqueante; no se lanzó otra suite tras la orden de cierre.

## Integridad del gate

- Baseline verificado antes de ejecutar: SHA y rama exactos.
- Los runners originales se copiaron al área privada del agente.
- En las copias ejecutadas sólo se adaptaron imports, cwd, output privado y puerto 5177. El probe físico cambió la interacción a un click ordinario y registró `event.isTrusted` para aislar la falsificación de foco.
- Los dos archivos reproducibles archivados aquí sólo normalizan imports/cwd para poder ejecutarse desde este directorio.
- No se modificó código productivo ni se implementaron fixes.
- No se hizo commit.
- Otros artefactos semánticos no relacionados que aparecieron en el worktree durante el gate no fueron modificados.

## Reproducción del bloqueador

Desde este directorio, con el puerto 5177 libre:

```powershell
node ..\..\..\..\..\node_modules\@playwright\test\cli.js test --config physical-focus.config.ts
```

Resultado esperado del reproducer actual: 2 fallos, uno editable y otro read-only, ambos en `expect(focusAfterPreview.body).toBe(false)` y ambos con `trustedOpenExport: true`.

## Artefactos

- `physical-focus.spec.ts` y `physical-focus.config.ts`: reproducer mínimo archivado.
- `physical-focus.log`: evidencia física/trusted del P1 en ambos modos.
- `regate-editable-retry.log`: razón y resultado del retry editable solicitado.
- `regate-readonly-completion.log`: comprobaciones posteriores de ownership y recovery con foco como soft failure.
- `final-gate.log`: corrida completa de los siete casos históricos.
- `boundary-repeat.log`: tres repeticiones de boundary/DPR y telemetría cruda.

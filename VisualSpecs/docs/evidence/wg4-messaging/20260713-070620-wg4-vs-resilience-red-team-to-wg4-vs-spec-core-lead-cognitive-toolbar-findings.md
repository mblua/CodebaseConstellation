# Revisión cognitiva independiente — flujo inicial y toolbar

## Veredicto de gate

**No bloqueo P0/P1.** Encontré **2 P2 reproducibles** y **1 P3**. La hipótesis original queda parcialmente falsificada: los controles del grafo no son inútiles antes de abrir un proyecto, porque la aplicación ya carga el documento real de AgentsCommander. El defecto demostrable no es “hay botones de grafo”, sino la prioridad/agrupación de modos y una fuga funcional de controles de recuperación.

Walkthrough ejecutado contra `http://127.0.0.1:5175/` en contextos Chromium nuevos, sin storage compartido, a 1680×1000, 1280×720, 1024×768 y 800×800. También creé un proyecto y lo reabrí read-only mediante un harness FSA sobre OPFS. No cambié código.

## Evidencia que falsifica la parte más fuerte de la objeción

Estado inicial: `Nodes 744 / Relations 1609 / Drawn 14 / Folded away 1419` y mensaje `No project open; ... Temporary JSON. Project persistence is not active.`

1. Pulsar `Collapse all` cambia `Drawn` de 14 a 0 y `Folded away` a 1609.
2. Pulsar `Expand all` cambia `Drawn` a 1455 y `Folded away` a 0.
3. Fit/zoom también alteran el viewport real.

Por lo tanto, ocultar o deshabilitar navegación/expand-collapse sólo por no haber proyecto sería incorrecto: existe un documento temporal precargado y explorable. Sí corresponde moverlos después de la acción primaria y separar navegación de I/O.

## P2-1 — Controles de autosave falsamente visibles y habilitados sin proyecto ni autosave

### Caso mínimo reproducible

1. Abrir una ventana/contexto nuevo a 1280×720.
2. Confirmar que el estado dice `No project open`.
3. Observar `Restore view`, `Keep current` y `Export autosave copy`: los tres son visibles y habilitados.
4. Inspección DOM del contenedor `.autosave-actions`: `hidden === true`, pero `getComputedStyle(...).display === "flex"`, caja visible 374×35 en `(634,105)`.
5. Activar cada control por separado:
   - `Restore view`: genera `pageerror: No Visual Specs project is open.`; no banner, status ni feedback visible.
   - `Keep current`: no-op silencioso.
   - `Export autosave copy`: muestra `This document was refused. No Visual Specs project is open.`, pone el status incorrecto `Import failed.` y reemplaza los dos banners de coverage/unresolved por el error.

### Causa observable, sin proponer fix productivo

- `src/ui/app.ts:786` intenta ocultar el grupo con `autosaveActions.hidden = !project.pendingAutosave`.
- `src/styles.css:143-146` aplica `display: inline-flex` a `.autosave-actions`, anulando la presentación de `[hidden]`.
- `src/ui/app.ts:320-345` enruta errores de acciones de proyecto por un reporter de importación que siempre dice `This document was refused` / `Import failed`.

### Invariante violado

Una acción habilitada debe tener un objeto válido en el estado actual; una acción de recovery sólo puede aparecer si existe un artefacto recuperable compatible. Todo fallo de una acción visible debe ser perceptible y nombrar la operación real.

### Impacto y severidad

El onboarding ofrece recuperación inexistente, una acción crashea sólo en el event loop, otra no hace nada y la tercera diagnostica la operación equivocada. Además, el error de autosave borra temporalmente advertencias semánticas del documento. **P2**: rompe confianza y claridad de recovery, pero no impide Create/Open ni demostré pérdida de datos, por lo que no lo elevo a P1.

## P2-2 — Orden visual/DOM y semántica mezclan mapa, JSON temporal y proyecto persistente

### Caso mínimo reproducible

1. Abrir contexto nuevo a 1280×720.
2. Recorrer con Tab desde el inicio. Orden medido:
   1. Explorer
   2. Details
   3. Fit
   4. Zoom out
   5. Zoom in
   6. Expand all
   7. Collapse all
   8. Reset layout
   9. Open JSON temporarily
   10. Export JSON
   11. Project name
   12. Create Project
   13. Open Project
   14–16. los tres controles falsos de autosave
3. El toolbar con nombre accesible `Map controls` incluye `Open JSON temporarily` y `Export JSON`, que son I/O de documento, no navegación del mapa.
4. `.project-strip` no tiene role/nombre/heading accesible. El texto que explica `No project open` aparece después de todos los controles en DOM y lectura.
5. Antes de proyecto hay 17 controles de proyecto visibles: 11 deshabilitados y sólo 6 habilitados; de esos 6, tres son el autosave inválido anterior.

### Invariante violado

El modo actual debe entenderse antes de actuar, y las tres categorías deben ser inequívocas: (a) proyecto persistente/directorio, (b) JSON temporal/portable, (c) vista del grafo en memoria. La acción primaria de comenzar/recuperar no debe quedar después de diez acciones secundarias en orden de lectura y teclado.

### Impacto y severidad

Un usuario nuevo o de tecnología asistiva debe inferir el modo leyendo una frase tardía y puede elegir el flujo temporal antes de descubrir el persistente. No es sólo estética: el JSON temporal no activa `.visual-specs`, autosave, backups ni guardado del proyecto. Aun así, el rótulo `temporarily` es explícito, Create/Open son alcanzables y existe confirmación al abandonar cambios dirty; por eso queda en **P2**, no P1.

Evidencia estructural: `src/ui/app.ts:259-288` coloca I/O dentro del toolbar `Map controls`; `src/ui/app.ts:302-304` monta toolbar antes de project strip y banners.

## P3 — Densidad inicial consume la mitad superior en viewports soportados

Mediciones sobre el estado inicial:

| viewport | toolbar | project strip | banners | comienzo del canvas/body |
|---|---:|---:|---:|---:|
| 1680×1000 | 56 px | 92 px | 69 px | y=217 (21,7%) |
| 1280×720 | 56 px | 117 px | 69 px | y=242 (33,6%) |
| 1024×768 | 99 px / 2 filas | 134 px / 3 filas | 69 px | y=302 (39,3%) |
| 800×800 | 99 px / 2 filas | 159 px / 3 filas | 114 px | y=372 (46,5%) |

1024×768 y 800×800 son viewports declarados del smoke. Los banners de coverage/unresolved sí son información de confianza y no deberían desaparecer; el desperdicio principal son controles de proyecto imposibles en el estado actual. **P3** porque el canvas sigue operativo y la tarea puede completarse, aunque la carga de escaneo es alta.

## Matriz de visibilidad recomendada

### Sin proyecto (documento temporal precargado)

- **Visible y primario:** estado `Temporary document — no project`, nombre opcional, `Create Project`, `Open Project`.
- **Visible pero secundario y agrupado como Document:** `Open JSON temporarily`; `Export JSON` debería explicitar que es copia portable/temporal.
- **Visible y habilitado después del bloque de inicio:** Explorer/Details/Fit/zoom/expand/collapse/reset, porque sí actúan sobre el mapa precargado.
- **Oculto, no sólo disabled:** Enable editing, Rename, Save, Add/Refresh/Import, selectors de imports/exports, Open/Restore export, Return y todo autosave.
- **Banners:** conservar resumen de coverage/unresolved junto al documento/canvas; detalle expandible para reducir altura sin silenciar degradación.

### Proyecto abierto read-only

- **Visible y primario:** identidad del proyecto, estado `Read-only`, `Enable editing`.
- **Visible según contenido:** browse/refresh de imports y exports; abrir copia sólo si existe.
- **Oculto hasta obtener permiso:** Rename, Save, Add JSON, Import y Restore. Evitar una fila de acciones mutantes aparentemente disponibles sólo por estar dibujadas.
- `Create/Open` deberían pasar a una acción secundaria inequívoca de cambiar/crear otro proyecto.
- Recovery sólo en un bloque dedicado cuando `pendingAutosave === true`, indicando qué proyecto/revisión se recuperará.

### Proyecto editable

- Exponer Save/Rename/Add/Import/Restore agrupados por `Project`, `Imports` y `Recovery`; mantener el toolbar del mapa separado.
- Mantener deshabilitado sólo lo transitoriamente inaplicable (por ejemplo, no hay import seleccionado), con contexto cercano.

## Criterios de aceptación propuestos

1. En `phase=temporary`, `projectKey=null`, `pendingAutosave=false`, ningún control de autosave es visible, accesible ni tabulable.
2. En ese estado, activar cada control visible/habilitado produce cero `pageerror` y feedback visible específico de la operación; una acción no-import nunca termina con `Import failed`.
3. Create/Open y la explicación de modo preceden al toolbar del mapa en orden visual, DOM y teclado. El bloque posee nombre accesible, por ejemplo `Project start`.
4. El toolbar accesible `Map controls` contiene sólo acciones de mapa. Open/export temporal viven en un grupo accesible `Document` y el texto distingue portable/temporal de persistencia de proyecto.
5. Antes de proyecto, los controles exclusivos de proyecto no ocupan pixels ni árbol de accesibilidad; no basta `disabled`.
6. Al abrir read-only, el cambio de modo es visible antes de las acciones y `Enable editing` es la acción primaria; las acciones de escritura aparecen recién tras permiso.
7. Autosave recovery aparece sólo para un autosave compatible y desaparece tras Restore/Keep; sus tres acciones tienen feedback específico y no reemplazan banners semánticos no relacionados.
8. En 1024×768 y 800×800, el estado inicial no agrega filas de acciones imposibles; coverage/unresolved conserva un resumen visible y detalle accesible.
9. Prueba de no-regresión positiva: con el documento precargado y sin proyecto, Collapse/Expand/Fit/zoom siguen modificando el mapa; la reorganización no los inutiliza.

## Cierre

No hay base para veto P0/P1 por jerarquía: el mapa precargado hace válidas las acciones de grafo y el flujo Create/Open termina correctamente. Sí hay un bug P2 inequívoco de controles de recovery visibles contra el estado y otro P2 de jerarquía/semántica accesible. Recomiendo tratarlos como criterios de salida UX, sin convertir la preferencia de “toolbar arriba/abajo” en el gate por sí sola.

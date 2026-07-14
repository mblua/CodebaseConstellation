# Analisis de jerarquia y flujo de controles

## Conclusion

La jerarquia actual tiene una explicacion arquitectonica valida, pero contradice una prioridad de producto en la que el flujo principal debe comenzar por crear o abrir un proyecto.

No es una contradiccion funcional: al arrancar ya existe un documento util —el mapa embebido de AgentsCommander—, por lo que `Fit`, zoom, expand/collapse y los paneles funcionan de inmediato. Es una contradiccion de jerarquia de informacion: la franja visual y el orden de foco superiores priorizan operaciones de vista y el flujo temporal, mientras que la entrada a persistencia queda debajo, mezclada con muchas acciones de proyecto deshabilitadas.

Recomendacion: una primera franja contextual de **Workspace / Document** que haga visible el modo actual y ofrezca la siguiente accion primaria segun estado; debajo, una franja exclusivamente de **Map controls**. Imports/exports/backups deben salir de la fila plana y aparecer como grupos contextuales de proyecto mediante progressive disclosure.

No cambie codigo. La app sigue viva en `http://127.0.0.1:5175/`, responde 200 y conserva PID 44288.

## Por que se ven las filas en ese orden

La causa es literal en el DOM:

- `src/ui/app.ts:259-288` crea primero `toolbar`, con marca, Explorer, Details, Fit, zoom, Expand/Collapse, Reset, Open JSON temporarily y Export JSON.
- `src/ui/app.ts:302-305` hace `shell.appendChild(toolbar)` y recien despues `shell.appendChild(projectHost)`.
- `src/styles.css:37-54` define `.shell` como columna y `.toolbar` como bloque flex fijo; `src/styles.css:105-117` define `.project-strip` como el bloque fijo siguiente. Ambos hacen `flex-wrap`, por lo que en ancho reducido cada uno puede convertirse en varias lineas sin cambiar la prioridad relativa.
- `src/ui/app.ts:817-839` vuelve a construir siempre una unica lista plana de controles de proyecto en este orden: nombre, Create, Open, Enable, Repair, Rename, Save, Add, imports, exports, Return, autosave y mensaje.
- `src/ui/app.ts:766-786` generalmente **deshabilita** controles no aplicables; solo oculta Repair, Return y autosave cuando no corresponden. Por eso el estado inicial muestra el ciclo entero aunque casi todo este inactivo.

El UI refleja dos controladores correctamente separados: `Controller`/`AppState` gobiernan mapa y vista; `ProjectController` gobierna persistencia. El problema no es esa separacion, sino haberla convertido uno a uno en “mapa primero, persistencia despues”. Ademas, `Open JSON temporarily` y `Export JSON` quedaron en el toolbar de mapa aunque en realidad son acciones de ciclo de documento.

## El estado inicial no esta vacio

- `src/main.ts:7-10,31-39` importa el dataset comprometido como texto, lo valida, monta el UI, inicia el renderer y hace Fit.
- `README.md:22-33` documenta que la app abre el mapa comprometido de AgentsCommander.
- `ProjectController` nace sin proyecto pero con el mensaje `Temporary JSON. Project persistence is not active.` (`src/app/projectController.ts:93-100`). Su estado solo distingue `phase: temporary | project` (`:27-52,120-170`), de modo que el ejemplo embebido y un JSON temporal abierto por el usuario comparten fase estructural.

Esto explica por que los controles de mapa no estan “prematuros”. Tambien revela una carencia de presentacion: el usuario no ve claramente “Estas explorando el ejemplo embebido; no hay persistencia”. El mensaje existe al final de una fila secundaria, con estilo pequeno y atenuado (`src/styles.css:137-141`).

## Flujo reconstruido

### 1. Inicio sin proyecto

- Hay un documento cargado: AgentsCommander; no hay `project`.
- En un navegador con File System Access, Create y Open estan habilitados. Enable/Rename/Save/Add/imports/exports/restore aparecen deshabilitados. Open JSON temporarily y Export JSON estan arriba y disponibles si el documento no declara requisitos desconocidos.
- El input `Project name` queda editable aun sin proyecto; su placeholder es `Visual Specs`. El smoke incluso escribe el nombre, usa Fit/Expand y comprueba que el texto sobrevive antes de crear (`tests/smoke/projectUi.spec.ts:18-34`).
- Sin File System Access, Create/Open se deshabilitan pero siguen visibles; el mensaje explica `download only` (`tests/smoke/projectUi.spec.ts:198-208`).

Capacidades: `src/adapters/filesystem/FsaProjectStore.ts:63-72`; derivacion de cada `can*`: `src/app/projectController.ts:120-170`.

### 2. Create Project

- No crea un documento vacio: convierte/persiste **el documento actualmente visible** mediante `controller.exportText()` (`src/app/projectController.ts:187-209`).
- El picker pide readwrite y el adapter crea `.visual-specs` de forma no destructiva (`src/adapters/filesystem/FsaProjectStore.ts:106-147`). El proyecto resultante queda readwrite.
- Rename, Save, Add JSON, Import y Restore pasan a depender de `hasWriteAccess`; Browse imports/exports depende de que haya proyecto. Create y Open siguen presentes y pueden usarse para cambiar de proyecto.

### 3. Open Project

- Abre deliberadamente read-only (`src/app/projectController.ts:212-215`; `README.md:153-158`).
- Enable editing se vuelve la siguiente accion valida; Rename/Save/Add/Import/Restore permanecen inactivos. Browse imports/exports si esta permitido.
- Enable editing solicita permiso, vuelve a leer y validar el head, y preserva la vista en memoria si el documento semantico no cambio. El smoke verifica esa preservacion (`tests/smoke/projectUi.spec.ts:88-98`).
- Export JSON desde un proyecto read-only usa Save Picker/download; solo un proyecto readwrite no corrupto exporta dentro de `.visual-specs/exports` (`src/app/projectController.ts:440-460`).

### 4. Open JSON temporarily

- El boton esta en la franja superior, dispara un `input[type=file]` y primero protege cambios de vista sucios (`src/ui/app.ts:134-171,233-251`).
- Al validar el JSON, `loadTemporaryLoaded` reemplaza el documento, cancela autosave, elimina el proyecto/preview en memoria y limpia dirty (`src/app/projectController.ts:661-675`). No es solo “abrir archivo”: es un cambio de contexto que abandona el handle de proyecto.
- La UI vuelve al conjunto de capacidades “sin proyecto”; Export usa Save Picker/download y no escribe `.visual-specs` (`README.md:128-135,179-181`).

## Clasificacion real de controles

| Grupo | Controles | Dependencia real |
|---|---|---|
| Shell global | Explorer, Details | No requieren proyecto; controlan drawers, aunque su contenido describe el documento actual. |
| Vista del documento | Fit, zoom, Expand all, Collapse all, Reset layout | Requieren el documento cargado. Cambian viewport/expansion/layout; el `ProjectController` observa cambios de vista, marca dirty y programa autosave cuando corresponde (`projectController.ts:107-117,678-690`). |
| Ciclo de documento/sesion | Open JSON temporarily | Entrada global, pero reemplaza el documento y cierra el contexto de proyecto. |
| Salida de documento hibrida | Export JSON | Requiere documento exportable; el destino cambia segun proyecto readwrite vs picker/download. |
| Entrada a persistencia | Create Project, Open Project | Create persiste el documento actual y requiere que sea escribible; Open es independiente del documento actual. |
| Proyecto read-only/repair | Enable editing, Repair project, browse imports/exports, Open export copy | Requieren proyecto; Repair/preview son estados excepcionales prioritarios. |
| Proyecto readwrite | Rename, Save, Add JSON, Import JSON, Restore from export | Requieren handle readwrite, head fresco, ausencia de repair/preview y, segun accion, documento no readonly. |
| Preview/autosave | Return to project, Restore/Keep/Export autosave | Solo aparecen en estados contextuales especificos. |

`Create Project` y `Export JSON` son hibridos; tratarlos como “global” o “project-only” sin mostrar su contexto lleva a mensajes incorrectos.

## Propuesta concreta

### Franja 1: Workspace / Document (primera y contextual)

Orden estable:

1. Marca `Visual Specs`.
2. Identidad del contexto: `Example: AgentsCommander`, `Temporary: archivo.json` o nombre del proyecto.
3. Chips de estado: `Not persisted`, `Read-only`, `Editable`, `Unsaved`, `Repair needed` o `Preview`.
4. Una accion primaria segun estado.
5. Export actual y menu/disclosure `Switch / More` para cambios de contexto.

Estados:

- **Ejemplo inicial / sin proyecto:** texto visible `Exploring the bundled AgentsCommander example — changes are not persisted`; `Create project` primario, `Open project` secundario, `Open temporary JSON` terciario. Export permanece disponible, pero separado de abrir/cambiar contexto.
- **Proyecto abierto read-only:** nombre + `Read-only`; `Enable editing` primario. `Open/Create/Temporary` pasan a `Switch…` porque abandonan el contexto actual.
- **Proyecto editable:** nombre + `Editable` + indicador dirty; `Save` primario. `Rename` vive en un menu Project o entra en modo de edicion explicito; el nombre deja de parecer un input libre permanente.
- **Repair:** `Repair project` reemplaza a Save/Enable como accion primaria y el mensaje de mismatch queda junto al estado.
- **Preview de import/export:** `Return to project` es la accion primaria; se ocultan acciones de escritura para evitar operar sobre el documento equivocado.
- **Persistencia no soportada:** se presenta `Temporary mode` con Open JSON + Export. No se muestra una hilera de botones de proyecto deshabilitados; una explicacion breve informa el requisito de File System Access.

Para crear, el nombre puede revelarse inline en un pequeno formulario o dialogo. El click final `Choose folder and create` debe invocar inmediatamente el picker para conservar user activation.

### Franja 2: Map controls (segunda y pura)

`Explorer · Details | Fit · − · + | Expand all · Collapse all | Reset layout`

No debe contener Open/Export. Mantiene shortcuts y `role=toolbar aria-label="Map controls"`. En ancho reducido, puede compactar Fit/zoom y Expand/Collapse en grupos o menus accesibles sin quitar el acceso por teclado.

### Project data mediante progressive disclosure

Solo cuando hay proyecto, mostrar `Project data` como panel/disclosure con dos grupos:

- **Imports (n):** Add JSON, Refresh, selector, Import.
- **Exports (n):** Refresh, selector, Open copy, Restore.

No deben ocupar permanentemente la cabecera. Restore aparece/activa solo con readwrite; Open copy sigue disponible read-only. Autosave recovery aparece como alerta contextual, no como otra secuencia incrustada en la fila.

## Por que esta propuesta reconcilia los dos flujos

Conserva la virtud actual: el usuario puede explorar el ejemplo inmediatamente y los controles de mapa siguen funcionando. A la vez, la primera decision visible responde al flujo de persistencia: crear o abrir. No inventa un estado vacio que el producto no tiene ni obliga a ocultar el ejemplo comprometido.

Para expresarlo robustamente conviene ampliar el estado de UI con un discriminante estructurado, por ejemplo `sessionKind: bundled | temporary | project | project-preview`, en vez de deducirlo de textos. Hoy `phase: temporary` fusiona bundled y temporary.

## Alternativa de menor cambio

Mantener la barra de mapa arriba para privilegiar exploracion experta, pero:

1. mover Open JSON temporarily y Export JSON a una franja `Document`;
2. mover esa franja antes o inmediatamente junto al toolbar;
3. en estado inicial mostrar solo Create/Open y un mensaje prominente de ejemplo no persistido;
4. renderizar condicionalmente los controles de proyecto aplicables, en vez de una lista deshabilitada.

Reduce cambios de screenshots/foco y conserva maxima altura del canvas, pero la prioridad “comenzar por proyecto” queda menos fuerte que en la propuesta recomendada.

Una pantalla inicial modal que bloquee el mapa hasta Create/Open seria aun mas project-first, pero contradice el valor documentado de abrir inmediatamente el mapa de AgentsCommander; solo la recomendaria si producto decide que el ejemplo deja de ser una entrada principal.

## Criterios de aceptacion observables

1. En primer arranque con FSA, la UI identifica `bundled example / not persisted`; Create y Open son las primeras acciones de ciclo visibles. No aparecen Rename/Save/imports/restore inactivos.
2. En navegador sin FSA, no hay una hilera de controles de proyecto muertos; se explica Temporary mode y Open JSON/Export siguen funcionando.
3. Create persiste exactamente el documento visible, abre readwrite y muestra nombre, Editable, Save y dirty sin cambiar semantica de archivos.
4. Open muestra Read-only y Enable editing como siguiente accion. Antes de habilitar, Save/Rename/Import/Restore no son accionables ni se presentan como pares principales.
5. Enable editing conserva viewport/layout y habilita las operaciones de escritura actuales.
6. Open JSON temporarily pide confirmacion si dirty, cambia el contexto visible a Temporary y no escribe `.visual-specs`.
7. Export conserva un solo comando y su destino actual: project export solo en proyecto readwrite sano; picker/download en los demas casos.
8. Preview muestra Return to project como accion primaria; Repair muestra Repair project; ninguno queda perdido en overflow generico.
9. Imports y exports aparecen solo con proyecto, separados y rotulados; Restore requiere readwrite y confirmacion.
10. En 1680x1000, 1024x768 y 800x800 no hay overflow horizontal ni una cabecera de varias filas que quite al canvas una porcion no presupuestada; los drawers conservan su comportamiento.
11. Orden de Tab, labels de grupos, `aria-live`, shortcuts F/E/C/R/S/+/-/[/] y acceso de teclado a menus/disclosures siguen verificados.
12. Los smokes cubren cada transicion y el estado visible, no solo que el boton exista.

## Archivos que cambiarian

Principales:

- `VisualSpecs/src/ui/app.ts`: markup, orden, agrupacion, rendering contextual y labels ARIA.
- `VisualSpecs/src/styles.css`: cabecera contextual, chips, disclosure, responsive y presupuestos de altura.
- `VisualSpecs/src/app/projectController.ts`: solo si se agrega `sessionKind`/identidad estructurada del contexto; no hace falta cambiar semantica de persistencia.
- `VisualSpecs/src/main.ts`: solo para declarar que el documento inicial es el ejemplo bundled.
- `VisualSpecs/src/ui/dom.ts`: opcional si se introduce un helper accesible de menu/disclosure.

Pruebas/documentacion:

- `VisualSpecs/tests/smoke/projectUi.spec.ts`
- `VisualSpecs/tests/smoke/acceptance.spec.ts`
- `VisualSpecs/tests/smoke/screenshots.spec.ts`
- `VisualSpecs/README.md` y, si se aprueban nuevas capturas, `VisualSpecs/docs/screenshots/*`

No deberian cambiar contract, domain, projection, renderer ni adapters de filesystem salvo que aparezca un requisito funcional nuevo.

## Riesgos de regresion

- **User activation:** Create/Open y pickers deben ejecutarse directamente desde el click. `src/ui/app.ts:187-195` y `FsaProjectStore.ts:106-126` lo protegen; un menu/dialogo con trabajo async previo puede romper el picker en navegador real.
- **Nombre/foco:** `renderProjectState` reconstruye el host; hoy preserva el valor escrito mientras cambia la vista (`app.ts:759-765`) y el smoke lo exige. Rendering condicional no debe perder texto, foco o seleccion.
- **Dirty/autosave:** Fit/zoom/expand/reset pueden cambiar view y disparar dirty/autosave. Reordenarlos no debe saltarse `confirmDestructive` al cambiar documento/proyecto.
- **Export contextual:** separar visualmente Document y Project no debe duplicar logica ni cambiar la ruta unica de `ProjectController.exportJson()`.
- **Read-only semantico vs permiso read-only:** son ejes distintos. Enable editing puede dar permiso de directorio aunque el documento siga readonly por `requires[]`; la UI debe representar ambos sin prometer edicion semantica.
- **Repair/preview/autosave:** progressive disclosure no puede esconder la unica salida segura de estos estados.
- **Accesibilidad:** menus compactos deben conservar botones reales, foco, Escape, labels y orden predecible; no reemplazar controles por canvas-only.
- **Responsive/canvas:** una cabecera mas alta puede reducir el mapa. Hay que medir los tres viewports canonicos y actualizar screenshots de manera explicita, no dentro del gate.
- **Smokes ocupando 5175:** el servidor persistente actual usa el puerto estricto; para correr smokes habra que detenerlo explicitamente primero. No lo detuve.

## Estado final

- Sin ediciones de codigo o manifests.
- `git status -sb`: `## main...origin/main` y el unico no rastreado previo `?? CodebaseGuide/`.
- Servidor: PID 44288 vivo, listener `127.0.0.1:5175`, HTTP 200.

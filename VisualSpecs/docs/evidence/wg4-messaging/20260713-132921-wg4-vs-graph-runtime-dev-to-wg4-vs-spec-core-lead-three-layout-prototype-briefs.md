# Tres layouts de prototipo A/B/C

## Base comun para un tablero comparable

Usar tres frames desktop de **1680 x 1000**, sin chrome de navegador, con un inset responsive opcional de **800 x 800** por alternativa. Los tres deben representar exactamente el mismo estado:

- documento embebido `AgentsCommander` cargado y visible;
- sin proyecto persistente;
- modo explicito `Example` + `Not persisted`;
- `Create Project` como accion primaria y `Open Project` como secundaria, antes en jerarquia visual y orden de foco que cualquier control del mapa;
- `Open JSON temporarily` y `Export JSON` dentro de un grupo llamado `Document`;
- sin Save, Rename, Enable editing, Repair, Add JSON, selectors de imports/exports, Restore ni autosave;
- Explorer abierto a la izquierda, Details abierto a la derecha, canvas reconocible en el centro con el grafo actual, y los dos banners de cobertura/evidencia conservados debajo del chrome principal.

Lenguaje visual comun, tomado de la UI actual:

- fondo `#0b0e16`, panel `#11151f`, panel secundario `#161b28`, bordes `#232a3a`;
- texto principal `#dbe3f0`, muted `#8794ab`, acento azul `#7aa2f7`, warning ambar `#d9a441`;
- controles compactos de herramienta de desarrollo, radio 6–8 px, sin aspecto de dashboard SaaS ni tarjetas blancas;
- preservar los colores semanticos del grafo: teal, ambar, coral, violeta y azul;
- Explorer reconocible con search, counts, node list y legend; Details reconocible con `Nothing selected.`;
- no inventar sidebar de settings, activity feed, avatar, cloud sync ni backend.

Copy comun disponible:

- `Visual Specs`
- `Example`
- `AgentsCommander`
- `Not persisted`
- `Exploring the bundled example. Create or open a project to persist layout and view changes.`
- `Create Project`
- `Open Project`
- `Document`
- `Open JSON temporarily`
- `Export JSON`
- `Explorer`, `Details`, `Fit`, `−`, `+`, `Expand all`, `Collapse all`, `Reset layout`

---

## A — Context Bar

### Idea estructural

Dos estratos horizontales con responsabilidades puras. El primero responde “donde estoy y como persisto”; el segundo responde “como manipulo el mapa”. Project data aparece mas adelante como disclosure contextual, nunca como una tercera botonera permanente.

### Geometria y jerarquia exacta

```text
┌ Context bar — 64 px, full width ────────────────────────────────────────────────────────────┐
│ ◈ Visual Specs | Example / AgentsCommander | Not persisted | Create Project | Open Project │
│                                                          Document: Open JSON… | Export JSON │
├ Map toolbar — 44 px ─────────────────────────────────────────────────────────────────────────┤
│ Map   Explorer  Details  |  Fit  −  +  |  Expand all  Collapse all  |  Reset layout         │
├ coverage banner / unresolved banner ─────────────────────────────────────────────────────────┤
│ Explorer 290 px │                    Canvas flexible                    │ Details 380 px       │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

Dentro de la context bar, el orden LTR y de Tab es:

1. marca no interactiva;
2. breadcrumb/contexto `Example / AgentsCommander`;
3. pill ambar outline `Not persisted`;
4. `Create Project`, boton primario filled azul;
5. `Open Project`, boton secundario outline;
6. spacer flexible;
7. etiqueta pequena `Document`;
8. `Open JSON temporarily`;
9. `Export JSON`.

El mensaje explicativo puede vivir como sublinea muted bajo `Example / AgentsCommander` dentro de un bloque de dos lineas; no debe relegarse al extremo final de otra fila. La map toolbar usa el mismo fondo que el panel, un tono apenas mas oscuro, y separadores de 1 px entre paneles, viewport y hierarchy/layout.

### Verbatim del mockup

- Breadcrumb: `Example / AgentsCommander`
- Status: `Not persisted`
- Helper: `Exploring the bundled example. Create or open a project to persist layout and view changes.`
- Primary: `Create Project`
- Secondary: `Open Project`
- Group label: `Document`
- Document buttons: `Open JSON temporarily`, `Export JSON`
- Toolbar label: `Map`

### Controles visibles en el estado inicial

- Context: Create Project, Open Project.
- Document: Open JSON temporarily, Export JSON.
- Map: Explorer, Details, Fit, zoom −/+, Expand all, Collapse all, Reset layout.
- Search y filtros/lista siguen dentro de Explorer; no suben a la cabecera.
- No aparece ningun control exclusivo de proyecto.

### Despues de abrir proyecto read-only

La misma barra cambia sin desplazarse:

`Project / <project name>` + pill `Read-only` + boton primario `Enable editing`.

- `Create Project`, `Open Project` y `Open JSON temporarily` pasan a un disclosure `Switch…` porque cambian/abandonan contexto.
- `Document` conserva `Export JSON`; su destino es picker/download mientras el proyecto no tenga escritura.
- Aparece `Project data ▾` al final del contexto. Al abrirlo muestra Imports y Exports como dos grupos; en read-only se puede Refresh/Open copy, pero no Add/Import/Restore.
- Si hay repair, `Repair project` reemplaza a Enable como primaria y el pill pasa a `Repair needed`.

### Despues de habilitar edicion

`Project / <project name>` + pill verde/teal discreto `Editable` + dirty dot/text `Unsaved changes` cuando corresponda.

- primaria `Save`;
- `Rename` dentro de `Project ▾`, no un input siempre editable;
- `Project data ▾` habilita Add JSON, Import y Restore donde corresponda;
- `Document / Export JSON` conserva un solo comando y ahora escribe en `.visual-specs/exports`;
- Switch sigue secundario/destructivo.

### Ventaja, renuncia y riesgo responsive

- **Ventaja:** maxima claridad de estado y siguiente accion con minimo cambio del modelo espacial actual; conserva todo el ancho del canvas y separa limpiamente lifecycle/document/map.
- **Renuncia:** una barra horizontal puede sentirse densa y exige priorizar que queda visible vs dentro de disclosures.
- **Riesgo responsive:** entre 800 y 1100 px el contexto puede envolver y comerse altura. Regla propuesta: mantener Create/Open visibles en una segunda linea corta, colapsar Document a `Document ▾`, y compactar Expand/Collapse/Reset en `Layout ▾`. Nunca mover Map por encima de Create/Open. Explorer/Details siguen como drawers bajo 1200 px.

### Prompt listo para `ui-mockup`

> Create a high-fidelity 1680x1000 dark desktop developer-tool mockup for “Visual Specs”. Preserve the recognizable existing layout: a 290px Explorer with search/counts/node legend on the left, a large dotted graph canvas with the AgentsCommander dependency map in the center, and a 380px Details panel saying “Nothing selected.” on the right. Use flat near-black panels (#0b0e16, #11151f), subtle #232a3a borders, compact Segoe/Inter typography, blue accent #7aa2f7, amber warning, and teal/amber/coral/purple graph nodes. At the very top place a 64px workspace Context Bar: “◈ Visual Specs”, breadcrumb “Example / AgentsCommander”, an amber-outline “Not persisted” pill, prominent blue “Create Project”, outline “Open Project”, then a labeled “Document” group with “Open JSON temporarily” and “Export JSON”. Directly below place a pure 44px Map toolbar: Explorer, Details, Fit, minus, plus, Expand all, Collapse all, Reset layout. Keep the existing coverage and unresolved-relation banners below the toolbars. No Save, Rename, Enable editing, imports, exports list, restore, autosave, cloud UI, avatars, gradients, or generic dashboard cards.

---

## B — Project Rail

### Idea estructural

El ciclo de proyecto se convierte en una region persistente vertical, anterior al workspace tanto en DOM/foco como en lectura LTR. El mapa recupera una sola toolbar horizontal pura. Esta opcion asume que proyecto/documento creceran como un subsistema importante y merecen una “casa” estable.

### Geometria y jerarquia exacta

```text
┌ Project rail 232 px ┐┌ Workspace ────────────────────────────────────────────────────────────┐
│ ◈ Visual Specs      ││ Map toolbar 48 px: Explorer Details | Fit − + | Expand Collapse Reset │
│                     │├ coverage / unresolved banners ─────────────────────────────────────────┤
│ EXAMPLE             ││ Explorer 264 │          Canvas flexible          │ Details 340          │
│ AgentsCommander     ││              │                                   │                      │
│ [Not persisted]     ││              │                                   │                      │
│ short helper copy   ││              │                                   │                      │
│                     ││              │                                   │                      │
│ START A PROJECT     ││              │                                   │                      │
│ [Create Project]    ││              │                                   │                      │
│ [Open Project]      ││              │                                   │                      │
│                     ││              │                                   │                      │
│ DOCUMENT            ││              │                                   │                      │
│ Open JSON temporary ││              │                                   │                      │
│ Export JSON         ││              │                                   │                      │
│                     ││              │                                   │                      │
│ Session-only note   ││              │                                   │                      │
└─────────────────────┘└────────────────────────────────────────────────────────────────────────┘
```

Rail de 232 px, full height, fondo panel. Marca arriba; context card sin borde fuerte; dos CTAs full width; grupo Document como acciones de lista con iconos simples de archivo/download. El rail no es un Explorer alternativo: no contiene nodos, search ni filtros.

Para preservar un canvas util a 1680 px, Explorer baja a 264 px y Details a 340 px; ambos conservan contenido y estilo actuales. El toolbar del workspace ya no lleva marca ni acciones de archivo.

### Verbatim del mockup

- Eyebrow: `EXAMPLE`
- Title: `AgentsCommander`
- Pill: `Not persisted`
- Helper: `Layout and view changes stay in this session until you create a project.`
- Section: `START A PROJECT`
- Full-width buttons: `Create Project`, `Open Project`
- Section: `DOCUMENT`
- List actions: `Open JSON temporarily`, `Export JSON`
- Footer note: `No project folder is open.`

### Controles visibles en el estado inicial

- Rail: Create Project, Open Project, Open JSON temporarily, Export JSON.
- Workspace toolbar: Explorer, Details, Fit, zoom −/+, Expand all, Collapse all, Reset layout.
- Explorer/Details/canvas completos.
- Ninguna accion exclusiva de proyecto; no hay acordeon Project data vacio.

### Despues de abrir proyecto read-only

El rail se transforma en vez de sumar filas:

- eyebrow `PROJECT`, nombre real, pill `Read-only`;
- boton full width primario `Enable editing`;
- seccion `PROJECT DATA` con accordions `Imports (n)` y `Exports (n)`. En read-only solo aparecen Browse/Refresh/Open copy;
- `DOCUMENT` mantiene Export JSON;
- Create/Open/Open temporary se agrupan al final en `Switch context ▾`;
- si hay preview, el primer boton pasa a `Return to project`.

### Despues de habilitar edicion

- pill `Editable`; dirty marker junto al nombre;
- `Save` full width como primaria y `Rename` como accion textual secundaria;
- Imports/Exports expandibles habilitan Add/Import/Restore;
- un grupo `Switch context` queda visualmente separado al fondo para evitar cambios accidentales;
- el map toolbar y el cuerpo no cambian de posicion.

### Ventaja, renuncia y riesgo responsive

- **Ventaja:** mejor escalabilidad para un ciclo de proyecto profundo; el estado, la accion primaria y Project data siempre tienen ubicacion estable sin contaminar el toolbar.
- **Renuncia:** consume ancho permanente y crea dos regiones izquierdas consecutivas —Project Rail y Explorer— que pueden competir conceptualmente.
- **Riesgo responsive:** con rail + Explorer + Details el canvas se estrecha antes. Reglas propuestas: a 1100–1439 px el rail permanece pero Explorer/Details se vuelven drawers; bajo 900 px el rail deja de ser columna y se transforma en una banda superior contextual con Create/Open visibles. No reducir el rail a iconos ambiguos en el estado inicial.

### Prompt listo para `ui-mockup`

> Create a high-fidelity 1680x1000 dark desktop developer-tool mockup for “Visual Specs” using a distinct fixed 232px Project Rail on the far left. The rail is the first visual region and contains “◈ Visual Specs”, eyebrow “EXAMPLE”, title “AgentsCommander”, amber-outline pill “Not persisted”, helper text “Layout and view changes stay in this session until you create a project.”, section “START A PROJECT” with full-width blue “Create Project” and outline “Open Project”, section “DOCUMENT” with list actions “Open JSON temporarily” and “Export JSON”, and footer “No project folder is open.” To the right is the map workspace: a pure compact top toolbar with Explorer, Details, Fit, minus, plus, Expand all, Collapse all, Reset layout; then existing coverage banners; then a recognizable 264px Explorer, large dark dotted AgentsCommander graph canvas, and 340px Details panel. Flat near-black palette, subtle borders, compact professional typography, semantic graph colors. Do not put project buttons in the map toolbar. No Save, Rename, Enable editing, import/export selectors, restore, autosave, cloud UI, dashboard cards, or light surfaces.

---

## C — Guided Overlay

### Idea estructural

El ejemplo sigue siendo el protagonista, pero la primera visita recibe orientacion contextual fuerte sin modal, scrim ni bloqueo. Un panel elevado sobre el borde superior del canvas contiene las decisiones Create/Open/Document. Al elegir una accion o `Continue with example`, se contrae a una context header compacta; desde entonces el mapa usa chrome estable.

No es un banner cosmetico: agrega un estado de interfaz `guided -> compact` y una ruta explicita para reabrir la guia.

### Geometria y jerarquia exacta

```text
┌ App header 44 px: ◈ Visual Specs | Example / AgentsCommander | Not persisted ───────────────┐
├ coverage / unresolved banners ────────────────────────────────────────────────────────────────┤
│ Explorer 290 │ Canvas                                                     │ Details 380       │
│              │  ┌ Guided panel 600 x 220, top 20 px, no scrim ─────────┐ │                   │
│              │  │ START HERE                                             │ │                   │
│              │  │ Explore the AgentsCommander example                   │ │                   │
│              │  │ helper copy                                           │ │                   │
│              │  │ [Create Project] [Open Project]                        │ │                   │
│              │  │ Document: Open JSON temporarily | Export JSON          │ │                   │
│              │  │ Continue with example                                  │ │                   │
│              │  └────────────────────────────────────────────────────────┘ │                   │
│              │  [floating Map tools: Explorer Details | Fit − + | …]      │                   │
│              │                  graph remains visible around/below         │                   │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

El app header inicial solo tiene identidad y estado, sin controles de mapa. El Guided panel es el primer bloque interactivo en DOM/foco y esta visualmente por encima de la paleta de mapa. Se ubica dentro del canvas porque explica el documento visible, no como modal de aplicacion. Fondo `#161b28` al 96%, borde azul tenue, sombra corta, sin blur excesivo ni glassmorphism. No hay scrim; Explorer, canvas y Details permanecen visibles y operables.

La paleta de Map tools es una barra compacta flotante de una linea justo debajo del guided panel, no arriba. Tras colapsar la guia, el panel se convierte en una context header de 52 px **encima** de esa toolbar:

`Example / AgentsCommander` · `Not persisted` · `Create Project` · `Open Project` · `Document ▾`.

### Verbatim del mockup

- Eyebrow: `START HERE`
- Title: `Explore the AgentsCommander example`
- Body: `This bundled map is ready to explore, but changes are not persisted. Create a project to keep layout and view changes, or open an existing project.`
- Buttons: `Create Project`, `Open Project`
- Group: `Document`
- Actions: `Open JSON temporarily`, `Export JSON`
- Collapse action: `Continue with example`
- Reopen affordance after collapse: `Getting started`

### Controles visibles en el estado inicial

- Guided panel: Create Project, Open Project, Open JSON temporarily, Export JSON, Continue with example.
- Floating Map tools below: Explorer, Details, Fit, zoom −/+, Expand all, Collapse all, Reset layout.
- Explorer/Details/canvas visibles detras y alrededor; no deshabilitados.
- Ningun control exclusivo de proyecto.

### Despues de abrir proyecto read-only

La guia se colapsa automaticamente y no vuelve a ocupar el canvas:

- compact context header: `Project / <name>` + `Read-only` + primaria `Enable editing`;
- `Document ▾` contiene Export JSON y cambios de documento;
- `Project data ▾` abre un popover o side sheet contextual con Imports/Exports browse-only;
- Map tools queda en su fila/paleta inmediatamente debajo;
- `Getting started` se reemplaza por `Project help` discreto, no reabre onboarding inicial.

### Despues de habilitar edicion

- header: nombre + `Editable` + dirty marker + primaria `Save`;
- Rename bajo `Project ▾`; Project data habilita Add/Import/Restore;
- el guided overlay no reaparece por cambios de estado, reload de proyecto ni preview;
- preview y repair reemplazan la primaria por Return/Repair en la compact header.

La eleccion `Continue with example` se recuerda solo durante la sesion actual; no introducir almacenamiento oculto, telemetry ni permisos. Un control `Getting started` permite reabrirla voluntariamente.

### Ventaja, renuncia y riesgo responsive

- **Ventaja:** mejor explicacion de primer uso sin negar el valor del mapa embebido; las CTAs son inequívocamente prioritarias y luego desaparece el peso visual.
- **Renuncia:** agrega estado transitorio/dismissal y puede sentirse como onboarding en una herramienta experta; parte del mapa queda momentaneamente ocluida.
- **Riesgo responsive:** a 800 x 800 un overlay de 600 x 220 domina el canvas y puede chocar con drawers. Bajo 900 px debe convertirse en una tarjeta inline full-width entre header y canvas, con CTAs apiladas; Explorer/Details comienzan cerrados como drawers. Map tools queda debajo de la tarjeta, nunca por encima.

### Prompt listo para `ui-mockup`

> Create a high-fidelity 1680x1000 dark desktop developer-tool mockup for “Visual Specs” in a guided first-use state. Keep the recognizable 290px Explorer, large dark dotted AgentsCommander dependency graph canvas, and 380px Details panel visible. At the top use only a slim 44px identity header: “◈ Visual Specs”, “Example / AgentsCommander”, amber-outline “Not persisted”. Inside the top area of the canvas place a prominent but non-modal 600x220 elevated dark panel with no scrim: eyebrow “START HERE”, title “Explore the AgentsCommander example”, body “This bundled map is ready to explore, but changes are not persisted. Create a project to keep layout and view changes, or open an existing project.”, blue “Create Project”, outline “Open Project”, a labeled “Document” row with “Open JSON temporarily” and “Export JSON”, and a subtle “Continue with example” action. Place a compact floating Map tools bar directly below this panel with Explorer, Details, Fit, minus, plus, Expand all, Collapse all, Reset layout. The graph must remain clearly visible around and below the panel. Use flat near-black surfaces, subtle blue border/shadow, compact professional typography, semantic graph colors; no modal scrim, no marketing illustration, no Save/Rename/Enable editing/imports/restore/autosave, no cloud UI or generic dashboard styling.

---

## Recomendacion

Recomiendo **A — Context Bar** como direccion base.

Razones:

1. Corrige la prioridad: contexto y Create/Open aparecen antes que Map, pero no bloquea ni tapa el ejemplo embebido.
2. Conserva el modelo espacial que ya funciona —Explorer / canvas / Details— y no agrega una cuarta columna como B.
3. Tiene menos estado incidental que C: no requiere recordar dismissal, reabrir onboarding ni decidir cuando reaparece.
4. Escala a read-only, editable, repair y preview con una unica accion primaria estable y Project data contextual.
5. Es el mejor punto de partida para validar copy, orden de foco y progressive disclosure antes de invertir en un patron mas fuerte.

Elegiria **B** si se confirma que Imports/Exports/backups evolucionaran hacia un verdadero workspace manager con uso frecuente; hoy paga demasiado ancho junto a Explorer. Elegiria **C** si la metrica prioritaria es comprension de primer uso/demos por encima de densidad experta; es la mas expresiva, pero tambien la de mayor riesgo de oclusion y estado transitorio.

El tablero A/B/C debe mantener exactamente el mismo canvas, zoom, banners, paneles y copy de estado inicial para que la seleccion compare arquitectura de interaccion, no composicion del grafo ni pulido visual.

## Estado operativo

- No se modifico codigo ni documentacion del repo.
- `git status -sb`: `## main...origin/main` y el residuo previo `?? CodebaseGuide/`.
- Servidor sin detener: PID 44288, `127.0.0.1:5175`, HTTP 200.

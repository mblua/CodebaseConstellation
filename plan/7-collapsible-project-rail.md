# Plan #7: add a collapsible Project Rail

Status: `DRAFT_AWAITING_PREMORTEMS`

Issue: <https://github.com/mblua/CodebaseConstellation/issues/7>

Artifact owner: `vs-graph-runtime-dev`

Delivery path: Full. The selected Project Rail changes the shell hierarchy, responsive drawer model, focus order, application-facing session identity, and the Canvas2D host's live dimensions. No canonical graph semantics or persistence formats change. All three constructive owners support the five transverse decisions; production readiness now requires independent semantic and resilience premortems with no unresolved P0/P1 finding.

Base commit: `271ae86b5b064fa6a642a0cfb313f38e597031fb` (`feat: evolve CodebaseGuide into Visual Specs (#6)`).

Delivery branch: `feature/7-collapsible-project-rail`.

## Situation before the change

At the base commit, Visual Specs has one horizontal shell followed by a second horizontal project strip:

- `src/ui/app.ts` creates the map toolbar first and appends `projectHost` below it;
- the toolbar mixes shell/view controls with `Open JSON temporarily` and `Export JSON`;
- `renderProjectState()` reconstructs a flat `.project-controls` row containing project name, Create/Open, permission, repair, write, import, export-copy, preview-return, autosave, and status controls;
- most inapplicable project actions remain rendered but disabled; only repair, return, and autosave groups are conditionally hidden;
- the bundled AgentsCommander document is loaded at boot, while `ProjectControllerState.phase` exposes only `temporary | project`, so the initial bundled example and a user-opened temporary document do not have distinct structured identities;
- Project Rail does not exist and there is no rail presentation state.

The node Explorer and Details regions already implement a responsive drawer model:

- at `>=1200px`, Explorer and Details are docked and may both be open;
- below that breakpoint they float over a full-width canvas, start closed, and are mutually exclusive;
- their open state is local to `mountUi()` and is not serialized;
- UI layout changes call `controller.resize()`, and Canvas2D also observes its host with `ResizeObserver`.

The existing renderer boundary is sufficient:

- `GraphRenderer.resize()` is already part of `src/ports/renderer.ts`;
- `Controller.resize()` delegates to that port;
- `Canvas2DRenderer.resize()` reads the new client size, updates the DPR backing dimensions, and redraws without changing or emitting a viewport;
- pointer-to-world conversion reads a fresh canvas bounding rectangle on every event.

Current browser coverage already measures:

- canvas usability and overflow at `1680x1000`, `1024x768`, and `800x800`;
- Explorer/Details reachability and narrow mutual exclusion;
- real canvas click, double-click, edge selection, pan, zoom, and node drag;
- project Create/Open/Enable/Save/Import/Export/Restore and conflict paths;
- view preservation while enabling editing.

The pre-existing untracked `CodebaseGuide/` directory contains legacy cache/dependency artifacts exposed by the rename to `VisualSpecs`. It is not input to this issue and must remain untouched.

## Requested state

Issue #7 selects prototype **B — Project Rail** and adds a post-selection collapse requirement.

The UI must provide:

1. a far-left Project Rail dedicated to session/project context and lifecycle;
2. a separate node Explorer dedicated to graph search/navigation, with independent controls and state;
3. an expanded no-project start experience in which Create/Open precede map controls and project-only actions are absent;
4. user-controlled collapse after a project is successfully created/opened;
5. complete width reclamation and renderer resize when the docked rail collapses;
6. an always-reachable reopen surface outside the hidden rail;
7. safe compact visibility of project identity, access/document state, dirty state, repair, and preview actions;
8. responsive inline/overlay behavior that does not strand onboarding or reduce the map to an unusable strip;
9. keyboard, focus, and ARIA behavior equivalent in safety to the existing Explorer/Details drawers;
10. no hidden persistence decision for rail state.

## Expected after state

### No project

The bundled document is presented as:

- `Example`;
- `AgentsCommander`;
- `Not persisted`;
- `Create Project` (primary);
- `Open Project`;
- a `Document` group containing `Open JSON temporarily` and `Export JSON`.

No Save, Rename, Enable editing, Repair, Add JSON, project import/export selectors, Restore, Return, or autosave-recovery actions are rendered without their corresponding project state.

At wide viewports this content occupies the docked far-left rail. At `1024x768` and `800x800`, it becomes an inline start region before map controls rather than an overlay that permanently covers the canvas or a hidden icon that strands Create/Open.

### Project selected, rail expanded

After Create/Open succeeds, the rail remains expanded once so the resulting identity and access mode are explicit, and a `Collapse project rail` button appears.

The rail then renders only the controls applicable to its state:

- read-only project: name, `Read-only`, `Enable editing`, Document, browse-only Project data;
- editable project: name, `Editable`, accessible dirty state, `Save`, Rename, conditional Project data;
- repair: mismatch warning and primary `Repair project`;
- preview: primary `Return to project`, with write actions suppressed;
- pending autosave: `Recovery available` plus the existing restore/keep/export recovery actions only while the rail is expanded.

Create/Open/Open-temporary remain available as explicitly secondary context-switch actions and retain the existing dirty confirmation and picker activation paths.

State labels are independent facts rather than one exclusive summary. The vocabulary includes `Project permission: read-only`, `Document: read-only`, `Unsaved project changes`, `Preview`, `Repair needed`, `Recovery available`, and `Corrupt autosave ignored`; every applicable label renders, including simultaneous combinations, without fabricating mutually exclusive source states. The critical action remains singular and ordered, but choosing that action never suppresses another true state label.

### Project selected, rail collapsed

The docked rail contributes zero layout width and no focusable descendants. Stable workspace chrome outside it contains:

- `Show project rail`;
- full accessible project name, visually truncatable;
- every applicable text state, composed from the shared presentation model (`Project permission: read-only` or `Project permission: editable`, `Document: read-only`, `Unsaved project changes`, `Repair needed`, `Preview`, `Recovery available`, and `Corrupt autosave ignored`);
- at most one critical action with precedence: Return, Repair, Enable editing, then Save when `canWriteProject && projectDirty`;
- a non-primary `Recovery available` indication when pending autosave exists; recovery choices remain in the reopened rail.

Compact and expanded surfaces consume one shared derived status/action model. They call the same `ProjectController` handlers and share capability checks, permission handling, dirty guards, and conflict behavior. The UI does not duplicate application or persistence semantics.

### Context changes

- cancellation/failure leaves the presentation unchanged;
- read-only to readwrite, clean/dirty, save, permission revocation, repair, preview, and return preserve the user's rail preference while updating every applicable compact-state label;
- entering project preview keeps the preview document's active `dirty` fact separate from an explicitly exposed underlying `projectDirty` fact, so a dirty project never appears clean while its export/import copy is being previewed;
- a different `projectKey` expands the rail so the new identity is explicit;
- returning to temporary/no-project mode expands the start region;
- a full reload resets to expanded; no repository/project/view data stores the preference.

## Decisions and what they trade away

### Project Rail and Explorer remain separate

The rail is application/project navigation; Explorer is graph navigation. They receive separate named regions, separate toggles, and separate local state. This gives up the apparent space economy of one overloaded left panel and prevents project lifecycle from disappearing inside a node hierarchy.

At narrow widths their overlay presentations are mutually exclusive, but opening one overlay must not overwrite the other's desktop preference or graph state.

### Rail preference is mounted UI state

Use local UI state owned by `mountUi()` for the explicit wide-screen preference. Do not add it to `AppState.view`, autosave view, the portable document, project manifest, IndexedDB, or localStorage.

The initial slice resets expanded after reload. Same-tab reload persistence via `sessionStorage` remains an open product decision and is not implemented implicitly. This trades away remembering a convenience preference in exchange for zero new persistence/privacy/migration surface.

### Structured session identity in the application layer

Do not derive `Example`, `Temporary`, `Project`, or `Project preview` from mutable message copy. Extend the UI-facing `ProjectControllerState` with a structured session discriminator and `displayLabel`, initialized by the composition root for the bundled AgentsCommander document and updated by existing load/preview/return transitions.

Proposed shape (names may be refined without changing meaning):

```ts
type SessionKind = 'example' | 'temporary' | 'project' | 'project-preview';

interface ProjectControllerState {
  sessionKind: SessionKind;
  displayLabel: string;
  // existing project/access/capability fields remain authoritative
}
```

`displayLabel` is untrusted presentation identity only. It changes only after the candidate document/project has validated and the corresponding load/open transition succeeds. It renders through text nodes, preferably inside `<bdi dir="auto">`, with its full accessible value even when visually truncated. It must never become canonical `model.source`, evidence, a filesystem path, a DOM id/class, confidence, or project/document/export/autosave data.

This is application presentation state only. It does not modify contract, schema, model, projection, extractor output, or stored JSON. It adds a small explicit state surface in exchange for eliminating message parsing and preventing the UI from claiming that the bundled example is a picked temporary file. This transverse decision has constructive 3-of-3 support in round 2.

### One shared derived project presentation model

Add only the narrow structured facts the UI cannot derive truthfully today:

```ts
interface ProjectControllerState {
  // `dirty` remains the active document/view dirty fact.
  projectDirty: boolean | null;
  corruptAutosaveIgnored: boolean;
  // existing access/readOnly/previewing/needsRepair/pendingAutosave/capabilities remain authoritative
}
```

`projectDirty` is `null` with no underlying project. With an open project it is `previewReturn?.dirty ?? dirty`, so preview can expose the saved private return fact without claiming the preview document itself is dirty. `corruptAutosaveIgnored` lets compact UI expose the existing corrupt-autosave case without inferring structure from concatenated mutable `message`; it is a narrow status, not a generic notification system.

A pure UI derivation consumes the complete `ProjectControllerState` once and produces:

- a list/set of all applicable status keys and fixed accessible labels;
- at most one critical action key using Return → Repair → Enable editing → Save precedence;
- recovery/corrupt-autosave affordance state;
- capability-derived visibility for secondary actions.

Expanded and compact renderers consume that same object. Action keys map to one shared handler registry backed by the existing controller methods. Neither surface re-derives facts, parses `message`, or implements its own permission/dirty/conflict behavior.

### No width animation in the first implementation

Collapse/reopen changes layout immediately, then resizes on the next animation frame. `ResizeObserver` remains defense in depth. This gives up decorative motion and avoids stale backing resolution, repeated redraw, pointer-coordinate drift, reduced-motion branching, and performance ambiguity on the canonical dataset.

A later animation is a separately measured enhancement. `prefers-reduced-motion` must still be honored if reviewers require motion before merge.

### Preserve viewport values; reveal additional space

Collapse/reopen does not Fit, ResetLayout, reproject, or alter `viewport.x`, `viewport.y`, or `viewport.zoom`. The canvas origin moves with normal layout and the larger host reveals more world space at the same camera values.

This gives up keeping the same world point at the same absolute screen coordinate when the canvas's left edge moves. It preserves the canonical view state exactly and avoids manufacturing a view edit/dirty autosave merely because chrome changed.

### Expanded-rail canvas width is an explicit product tradeoff

The current docked CSS tokens are Explorer `290px` and Details `380px`; round 1's roughly 840 px arithmetic used prototype targets of about `264px` and `340px`, not the implementation defaults. A `232px` rail beside the real defaults would leave only `778px` before any remaining chrome, so it cannot substantiate the accepted expanded budget.

Round 2 makes the width choice explicit: retain the current `290px` Explorer and `380px` Details tokens unchanged, and start the docked Project Rail at `192px` (border-box). This leaves a nominal `818px` canvas at 1680 and gives up 40 px of the prototype rail width; long identity text wraps or truncates while retaining its full accessible `<bdi>` value. The narrow overlay may use a separate approximately `232px` token because it does not participate in docked canvas arithmetic.

Proposed budget:

- `1680x1000`, rail expanded: unobscured canvas `>=800px`;
- `1680x1000`, rail collapsed: unobscured canvas `>900px` (nominally `1010px`) and gains approximately the full measured `192px` rail width;
- the canvas remains `>300px` tall and has nonzero ink coverage in both states.

Playwright must measure rendered bounding boxes rather than accept the arithmetic. Do not silently reduce Explorer/Details widths. If the real expanded canvas is below `800px`, stop and record one explicit choice for review: narrow the new rail with accessible-content proof, deliberately change an existing panel token with its own regression evidence, undock a panel, or accept a revised product budget. The accepted two-mode outcomes have constructive 3-of-3 support; a measurement-driven departure reopens that decision.

### Narrow layout uses inline onboarding and one overlay drawer

Use a separate measured Project Rail docking threshold (initial proposal: `1440px`), not the existing Explorer/Details `1200px` threshold.

- At `1680x1000`, Project Rail can dock.
- At `1024x768` and `800x800`, no-project content is inline before the map toolbar and does not take a horizontal column.
- With a project at those sizes, the expanded rail is an edge overlay/drawer; when closed, compact context remains outside it.
- Project Rail, Explorer, and Details are mutually exclusive only as overlays. Desktop preferences stay independent.

This introduces responsive presentation state in exchange for retaining a real map at tablet sizes. This transverse product/layout decision has constructive 3-of-3 support.

## UI-state model

Keep user intent separate from responsive presentation. The implementation should have equivalent explicit concepts to:

```ts
let projectRailPreference: 'expanded' | 'collapsed' = 'expanded';
let narrowProjectRailOpen = false;
let lastProjectKey: string | null = null;
```

Derived behavior:

- no project: force the start content visible; preference is not serialized or treated as authoritative;
- successful Create/Open: reset preference to expanded; on narrow screens open the project drawer once;
- wide project: visible iff preference is expanded;
- narrow project: visible as an overlay iff `narrowProjectRailOpen`; closing it does not overwrite wide preference;
- opening a narrow project overlay closes Explorer/Details overlays;
- opening a narrow Explorer/Details overlay closes the rail overlay without changing wide preference;
- project key change: expand/open to show new identity;
- project becomes null: restore visible no-project start region;
- resize across breakpoints: recompute presentation without mutating explicit preference.

No new global shortcut is required. A later shortcut must avoid the existing F/E/C/R/S/+/-/[/] bindings and be separately documented.

## Global trust, warning, and evidence surfaces

`bannerHost` remains stable workspace chrome outside the hideable Project Rail and outside any narrow overlay subtree. Rail collapse, overlay close, and responsive breakpoint changes must not hide it, apply `aria-hidden` to it, move it behind an overlay, or remove it from the accessibility tree.

The following existing global facts remain visible and accessible in every expanded/compact rail state: dirty extraction source, degraded coverage, unresolved relations, semantic document read-only, privacy/validation warnings, refresh-loss reporting, and active filter masking. These are graph/document trust surfaces, not project-navigation content.

Project-scoped warnings remain distinct. `pendingAutosave` and the narrow `corruptAutosaveIgnored` structured fact feed the shared project presentation model, so recovery and corrupt-autosave status remain discoverable while collapsed without parsing `message`. The full existing actions/copy can remain in the expanded rail/status path; this issue does not introduce a generic notification framework.

Evidence reachability is also invariant under chrome changes: after a real post-reflow node or edge selection, closing a narrow Project Rail and opening Details preserves that selection and exposes the selected relation/node's expected confidence plus `.evidence` `path:line` entries.

## Focus and ARIA contract

- Project Rail is a named `<aside id="project-rail" aria-label="Project">` or equivalent region, not another Explorer and not one giant toolbar.
- Expanded and compact toggles are native buttons with `aria-controls="project-rail"` and correct `aria-expanded`.
- When collapsed, the rail is `hidden`/unrendered or otherwise absent from focus and the accessibility tree. CSS translation with tabbable descendants is invalid.
- Collapse moves focus to the stable `Show project rail` control outside the rail.
- Reopen moves focus to `Collapse project rail` or the rail heading; it does not trap focus.
- A narrow overlay closes on Escape and returns focus to its opener.
- Any responsive/state transition that hides focused content first selects a stable visible destination; focus must never fall silently to `body`.
- While open, Project context precedes map controls in DOM/Tab order. While closed, compact context precedes map controls.
- Project/session label truncation retains the full untrusted text value in a `<bdi dir="auto">` or equivalent isolated text-node presentation and a full accessible name/title.
- Permission read-only, semantic document read-only, Editable, Unsaved, Repair, Preview, Recovery, and corrupt-autosave facts compose as text; none relies on color/icon-only meaning or suppresses another applicable fact.
- Project state changes use the existing polite status path or a narrowly scoped polite region; canvas resize itself is not announced.
- Explorer and Details retain their existing labels, `aria-expanded`, shortcuts, and narrow exclusivity behavior.

## Renderer resize boundary

The UI owns chrome state; the controller/renderer own canvas realization.

Expected sequence for a docked rail toggle:

1. update UI state and DOM class/hidden attributes synchronously;
2. let layout compute with no width transition;
3. call `controller.resize()` on the next animation frame;
4. allow the existing Canvas2D host `ResizeObserver` to act as idempotent defense in depth;
5. do not dispatch a view command and do not call Fit/Reset.

`Canvas2DRenderer.resize()` already updates DPR backing width/height and redraws without modifying or emitting the viewport. `toWorld()` already reads the current bounding rectangle for every pointer event. Those behaviors are verified, not rewritten.

No change is planned for:

- `src/ports/renderer.ts`;
- `src/app/controller.ts`;
- `src/adapters/canvas2d/Canvas2DRenderer.ts`.

If browser evidence reveals that the existing port/adapter cannot meet the invariant, stop implementation and revise this RFC through constructive review rather than silently broadening scope.

## Invariants and severity

- P1: the rail and Explorer are distinct named regions; neither toggle mutates the other's desktop preference or graph data.
- P1: no-project Create/Open is visible and precedes map controls at every representative viewport.
- P1: collapsed project state always exposes reopen, project identity/state, and Return/Repair/Enable/Save when applicable.
- P1: status labels are conjunctive: permission read-only, semantic document read-only, project dirty, preview, repair, recovery, and corrupt-autosave facts all remain visible when simultaneous; selecting one critical action by precedence never suppresses a true label.
- P1: preview exposes the underlying project's `projectDirty` value independently from the active preview document's `dirty` value, including after permission/repair/recovery transitions.
- P1: global dirty-source, coverage, unresolved, semantic-read-only, privacy/validation, refresh-loss, and filter banners remain outside the hideable rail, visible, and in the accessibility tree at wide and narrow viewports.
- P1: corrupt-autosave/recovery project warnings remain discoverable from compact state through narrow structured facts; no surface parses mutable message copy.
- P1: hidden rail controls are not tabbable and collapse/reopen never loses focus.
- P1: repair and preview cannot expose write actions for the wrong document state.
- P1: rail toggles do not change viewport values, selection, expansion, pinned/dragged positions, filters, or dirty state.
- P1: canvas backing size and pointer mapping are correct immediately after reflow; node/edge hit testing and drag remain correct.
- P1: closing a narrow rail and opening Details after a post-reflow selection preserves selection and exposes expected confidence plus `.evidence` `path:line` entries.
- P1: project/filesystem commands retain direct user activation, permission, freshness, conflict, backup, and safe-open behavior.
- P2: a docked collapse reclaims the complete rail width with no empty gutter.
- P2: responsive presentation does not cause document horizontal scrolling or more than one canvas overlay.
- P2: project-only/autosave-only controls are absent rather than disabled in no-project state.
- P2: resizing across breakpoints preserves explicit desktop preference.
- P2: collapse/reopen completes without semantic derive/layout recomputation and within a 100 ms interaction budget on the canonical dataset, measured with motion disabled.
- P2: current toolbar/panel shortcuts and aria-live selection announcements remain intact.

## Allowed artifacts and systems

Expected production edits:

- `VisualSpecs/src/ui/app.ts`
  - shell composition, Project Rail DOM, compact context, conditional control groups;
  - local rail preference and narrow overlay state;
  - focus transfer, Escape handling, overlay exclusivity, explicit resize scheduling;
  - one pure shared status/action derivation consumed by expanded and compact surfaces;
  - reuse of one handler registry backed by existing ProjectController commands;
  - keep global trust/evidence banners outside the rail and every overlay subtree.
- `VisualSpecs/src/styles.css`
  - outer rail/workspace layout, compact context, state labels, conditional groups;
  - docked/inline/overlay responsive presentation and overflow constraints.
- `VisualSpecs/src/app/projectController.ts`
  - UI-facing `sessionKind`/untrusted `displayLabel` identity;
  - presentation-only `projectDirty` derivation and narrow `corruptAutosaveIgnored` fact;
  - no persistence behavior changes and no generic notification redesign.
- `VisualSpecs/src/main.ts`
  - initialize the bundled session as `Example / AgentsCommander`.

Expected test/documentation edits:

- `VisualSpecs/tests/app/projectController.test.ts`
- `VisualSpecs/tests/smoke/projectUi.spec.ts`
- `VisualSpecs/tests/smoke/acceptance.spec.ts`
- `VisualSpecs/tests/smoke/screenshots.spec.ts`
- `VisualSpecs/README.md`
- `VisualSpecs/docs/screenshots/*` through the dedicated screenshot update command only.
- `plan/7-collapsible-project-rail.md`

Read-only dependencies, with no planned diff:

- `VisualSpecs/src/app/controller.ts`
- `VisualSpecs/src/ports/renderer.ts`
- `VisualSpecs/src/adapters/canvas2d/Canvas2DRenderer.ts`
- `VisualSpecs/src/ports/projectStore.ts`
- `VisualSpecs/src/adapters/filesystem/FsaProjectStore.ts`

## Explicit no-change boundaries

Do not change:

- portable Visual Specs contract or JSON schema;
- contract validation/import/export semantics;
- canonical graph model, hierarchy, domain commands, layout engine, projection, aggregated connections, evidence, or confidence semantics;
- canonical `model.source`, evidence/path identity, confidence, or extraction provenance from untrusted `displayLabel`;
- meaning, derivation, or placement in the accessibility tree of existing global trust/evidence banners;
- renderer port shape or Canvas2D coordinate convention;
- filesystem adapter, File System Access permission model, project manifest/current revision protocol, backup ordering, freshness/conflict handling, repair semantics, import/export destinations, or autosave format;
- extractor behavior or AgentsCommander dataset content;
- GraphRenderer interchangeability;
- repository branch/ruleset policy;
- the untracked `CodebaseGuide/` legacy cache.

No backend, cloud state, telemetry, handle persistence, localStorage, schema migration, or generic notification/error-reporting rewrite is part of this issue.

## Implementation sequence

1. Freeze this round-2 plan as the 3-of-3 constructive input to the independent premortems; do not treat the constructive verdict as implementation readiness.
2. Obtain independent semantic and resilience premortems. Do not start production UI code until both report no unresolved P0/P1 finding.
3. Add structured application session identity, `projectDirty`, the narrow corrupt-autosave fact, the shared presentation derivation, and focused unit coverage.
4. Refactor shell construction so Project Rail/compact context precede a pure map toolbar while preserving direct click-to-picker call paths.
5. Implement conditional rail groups and compositional status labels for no-project, permission, semantic read-only, dirty, repair, preview, recovery, corrupt-autosave, and context-switch states using existing commands/capabilities.
6. Implement local wide preference, narrow overlay state, project-key reset, focus transfer, Escape, ARIA, and Explorer/Details independence.
7. Add outer layout and responsive CSS with the explicit initial tokens: docked rail `192px`, narrow overlay approximately `232px`, existing Explorer `290px`, existing Details `380px`. Start without a width animation and measure actual rendered dimensions before accepting the result.
8. Wire the post-layout `controller.resize()` call and verify the existing observer/adapter path; do not alter the port.
9. Add focused browser tests for state transitions, focus/ARIA, layout width reclamation, viewport preservation, and real pointer interactions after reflow.
10. Add representative responsive and visual evidence at all three canonical viewports.
11. Run unit, typecheck, build, adapter smoke, acceptance smoke, architecture boundary, and screenshot review gates.
12. Send the completed diff and evidence through constructive review-response, then independent final adversarial verdicts. Maximum three rounds before arbitration/escalation to the core lead.
13. Only after all gates pass, commit final implementation, push the issue branch, and open the issue-closing PR through the enforced workflow.

## Focused test plan

### Application/unit

- initial example snapshot exposes structured `example / AgentsCommander` identity through `displayLabel`;
- a validated picked standalone JSON changes identity to `temporary / <display label>`; validation/cancel/failure leaves the prior label unchanged;
- Create/Open success exposes project identity and correct read-only/readwrite capabilities;
- project preview/return changes and restores session kind without losing project identity, and exposes `projectDirty = previewReturn.dirty` while active `dirty = false`;
- no-project snapshots expose `projectDirty = null`; ordinary project snapshots expose `projectDirty = dirty`;
- corrupt autosave produces `corruptAutosaveIgnored = true` independently from `message`; clean/recovery autosave cases do not;
- temporary open clears project identity exactly as today;
- hostile/RTL/very-long `displayLabel` values remain untrusted strings and never enter source/evidence/path/confidence/DOM identifiers;
- no new identity/status state is serialized or fed into project/document/export/autosave text;
- existing permission, repair, preview, autosave, export destination, and conflict tests remain unchanged or gain presentation-only assertions.

Table-driven tests exercise the pure shared derivation, including contradictory/transitional capability snapshots so precedence cannot erase labels:

| Simultaneous structured facts | Required compositional labels | Critical action |
| --- | --- | --- |
| permission read-only + semantic document read-only | `Project permission: read-only`; `Document: read-only` | Enable when capable |
| permission editable + semantic document read-only + project dirty | `Project permission: editable`; `Document: read-only`; `Unsaved project changes` | none unless a safe capability is explicitly true |
| permission read-only + project dirty + recovery | `Project permission: read-only`; `Unsaved project changes`; `Recovery available` | Enable when capable |
| permission read-only + semantic document read-only + project dirty + preview + repair + recovery | all six corresponding labels | Return before Repair/Enable/Save |
| repair + project dirty + recovery, without preview | `Repair needed`; `Unsaved project changes`; `Recovery available` plus permission/document facts | Repair before Enable/Save |
| permission editable + project dirty, without preview/repair | `Project permission: editable`; `Unsaved project changes` | Save when capable |
| corrupt autosave + any permission/document facts | `Corrupt autosave ignored` plus every other true label | unaffected by the warning |

### UI/project browser smoke

- initial no-project rail contains only Example, Create/Open, and Document actions;
- project-only and autosave actions are absent, not merely disabled;
- cancel/failure keeps rail visible, focus stable, and state unchanged;
- Create and Open success keep rail expanded and reveal collapse;
- collapse removes width; reopen restores width; focus lands on the specified control both ways;
- `aria-controls`, `aria-expanded`, named regions, accessible full project name, and hidden-tab order are correct;
- expanded and compact surfaces render the same compositional labels from the table and the same Return → Repair → Enable → Save critical action;
- permission read-only and semantic document read-only remain separately named; preview shows the underlying project's dirty label when applicable;
- hostile/RTL/long labels render as inert `<bdi dir="auto">` text with a full accessible value and no markup/selector/path effects;
- recovery and corrupt-autosave status remain discoverable while collapsed without reading `message`;
- global trust/evidence banners remain outside the rail, visible, and accessible while expanded and collapsed;
- Project Rail and Explorer/Details toggle independently at wide sizes;
- compact and expanded actions exercise the same handler registry and real project-store harness paths.

### Renderer/interaction browser smoke

At `1680x1000`:

- record canvas bounding box, viewport, selection, expanded ids, and a known node position with rail expanded;
- collapse and wait one animation frame/resize observer;
- assert the canvas gains approximately the measured rail width and no gutter remains;
- assert viewport values, selection, expansion, filters, and node position are unchanged;
- click a known node using the post-reflow canvas rect;
- click a known edge, zoom, pan, and drag a node with real pointer events;
- after node and edge selection, open Details and assert expected confidence plus `.evidence` `path:line` content remains reachable;
- reopen and repeat a representative hit test;
- assert backing width tracks CSS width times DPR and ink coverage remains nonzero;
- measure collapse/reopen duration against the 100 ms UI budget without a semantic derive/layout operation.

### Responsive browser smoke

`1680x1000`:

- rail docked expanded and user-collapsible;
- Explorer/Details recognizable;
- expanded canvas `>=800px`, collapsed canvas `>900px`, height `>300px`;
- dirty-source provenance, degraded coverage, and unresolved banners remain visible and in the accessibility tree with the rail both expanded and collapsed;
- no document overflow.

`1024x768`:

- no-project start content inline before map controls;
- project rail opens as one overlay, canvas retains essentially full CSS width;
- opening Explorer/Details closes the rail overlay and vice versa without altering wide preference;
- unobscured map remains usable and Escape restores focus;
- no horizontal/vertical document overflow.

`800x800`:

- Create/Open remains visibly inline and map controls follow it;
- with a project, all three drawers are mutually exclusive;
- one 232-ish px rail overlay leaves `>350px` unobscured map width;
- with overlays closed, unobscured map width is `>700px`;
- global provenance/coverage/unresolved banners remain visible and accessible with the rail open and closed;
- select a known node and edge after rail reflow, close the narrow rail, open Details, and assert selection is unchanged and expected confidence plus `.evidence` `path:line` is present;
- focus, Escape, and reopen work without a pointer-only path.

### Regression gates

- `npm test`
- `npm run typecheck`
- `npm run build`
- `npm run smoke:adapter`
- `npm run smoke`
- `npm run verify`
- architecture boundary test continues to prove UI/app/ports/adapters separation;
- `git diff --check` and clean tracked worktree apart from the intended issue files.

The persistent dev server on port 5175 must be stopped explicitly before later Playwright gates because the config intentionally uses `strictPort` and `reuseExistingServer: false`, then relaunched only if the delivery workflow still needs it. Do not weaken that guard. It is not stopped during this planning assignment.

## Playwright and visual evidence

Browser tests should attach noncanonical review captures such as:

- `project-rail-example-1680x1000`;
- `project-rail-readonly-expanded`;
- `project-rail-editable-dirty-collapsed`;
- `project-rail-repair-collapsed`;
- `project-rail-preview-collapsed`;
- `project-rail-expanded-and-collapsed-widths`;
- `project-rail-inline-1024x768`;
- `project-rail-inline-800x800`;
- `project-rail-overlay-800x800`.

Canonical documentation captures are updated only with `npm run update:screenshots`, reviewed as an explicit diff, and never rewritten by `npm run verify`.

Evidence accompanying the final review must include:

- before/after bounding boxes and measured reclaimed width;
- before/after serialized viewport values and selection;
- ARIA/focus assertions rather than screenshots alone;
- real pointer success after both transitions;
- compositional permission/document/dirty/preview/repair/recovery status assertions and underlying `projectDirty` during preview;
- dirty-source, coverage, and unresolved banner visibility/accessibility at 1680 and 800;
- post-reflow Details evidence showing expected confidence and `.evidence` `path:line` after the narrow rail closes;
- console/page-error collection;
- timing measurement for collapse/reopen;
- responsive overflow and unobscured-width measurements.

## Rollback and recovery

This slice creates no persisted state and no data migration. A complete revert restores the current horizontal toolbar/project strip and discards only ephemeral rail preference on reload.

Rollback consequences:

- existing `.visual-specs` projects remain byte-for-byte compatible;
- portable documents and autosave views remain compatible;
- no project handle or permission record requires cleanup;
- graph layout, selection, evidence, and projection formats are unaffected;
- structured application session/status fields must be reverted together with UI/main/tests, but no stored data references them.

Do not partially revert CSS while leaving focus/state logic, or revert the session discriminator while UI branches on it. Revert the feature as one issue-backed PR if necessary.

If live evidence finds a renderer-port or adapter defect, keep the rail implementation unmerged (or disable only the new rail presentation on the delivery branch) and reopen this RFC. Do not patch canonical camera semantics or introduce auto-Fit as a rollback shortcut.

## Known residual risks

- A full rail plus Explorer plus Details makes the wide canvas narrower by design. The 192/290/380 initial tokens preserve the accepted arithmetic but still require real browser measurement; a failure reopens the product tradeoff.
- Compact context duplicates presentation of one action; drift is prevented by requiring both surfaces to consume one derived presentation object and one handler registry.
- Project permission read-only and semantic document read-only are independent axes and are easy to mislabel in compact space.
- Repair, preview, recovery, permission revocation, project dirty, active-document dirty, and corrupt-autosave changes can arrive while the rail is collapsed; every transition must update all applicable accessible labels.
- An untrusted project/file display label can contain long, RTL, or markup-looking text; text-node plus bidi isolation and a full accessible value are mandatory.
- Concatenated `message` copy is not structured state; adding another project warning without a narrow field must not tempt the UI to parse it or trigger a generic-notification rewrite.
- Responsive presentation adds a third overlay to an existing two-drawer exclusivity model. An enum/single-overlay invariant is safer than three independent booleans.
- Moving the canvas's page origin exposes hit-test code that accidentally caches DOM geometry; current Canvas2D reads a fresh rect, but browser proof is mandatory.
- Reconstructing rail DOM on every project notification can destroy focus or typed project names. Stable elements plus conditional containers are preferred over full host replacement.
- Create/Open must still invoke directory pickers directly from a trusted click. A disclosure/menu must not insert awaited work before the picker.
- The no-animation choice may feel abrupt; motion is deferred until it can be measured without compromising resize correctness or reduced-motion support.

## Constructive decision record

Transverse decisions that received support from all three constructive agents:

1. UI-facing structured session identity (`example | temporary | project | project-preview`) plus untrusted `displayLabel` in `ProjectControllerState`, with no canonical schema effect.
2. Two-mode desktop canvas budget: `>=800px` while the selected rail is expanded and `>900px` after collapse at 1680.
3. Separate rail docking threshold with inline no-project content and one overlay project drawer at 1024/800.
4. Mounted-only rail preference, reset expanded on reload; `sessionStorage` deferred.
5. Compact critical-action precedence: Return, Repair, Enable editing, Save; recovery is visible but opens the rail.

Current record:

- Graph/runtime owner: `SUPPORT` on all five decisions. The proposal preserves port/domain boundaries and makes the selected product tradeoff measurable.
- Core lead: `SUPPORT` on all five decisions in constructive round 1.
- Extraction/evidence owner: `SUPPORT` on all five decisions with no P0/P1 dissent, conditional clarifications incorporated in this round-2 plan for untrusted identity, global banners, compositional status, and evidence reachability.

Constructive gate: `SATISFIED_3_OF_3`. Any later measurement-driven departure from the accepted width/layout decisions or any new reproducible P0/P1 counterexample reopens the relevant decision.

## Independent premortem record

- Semantic red team: `PENDING`. Requested focus: session/project truthfulness; permission vs semantic read-only; repair/preview/recovery action precedence; no duplicated persistence semantics; viewport/selection/layout invariants; no evidence/coverage suppression.
- Resilience red team: `PENDING`. Requested focus: focus loss; hidden tabbables; narrow overlay dead ends; resize/backing-store/hit-test races; dirty/context-switch safety; picker activation; 1680/1024/800 budgets; timing and memory regressions.

No production implementation may start while either premortem has an unresolved P0/P1 finding. Maximum three review/review-response rounds apply before arbitration or escalation to the core lead.

Readiness verdict: `NOT_READY_FOR_IMPLEMENTATION`. The round-2 plan is frozen for independent premortems; constructive validation is satisfied, but both semantic and resilience premortems must still report no unresolved P0/P1 finding.

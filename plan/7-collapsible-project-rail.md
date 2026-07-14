# Plan #7: add a collapsible Project Rail

Status: `DRAFT_AWAITING_CONSTRUCTIVE_VALIDATION_AND_PREMORTEMS`

Issue: <https://github.com/mblua/CodebaseConstellation/issues/7>

Artifact owner: `vs-graph-runtime-dev`

Delivery path: Full. The selected Project Rail changes the shell hierarchy, responsive drawer model, focus order, application-facing session identity, and the Canvas2D host's live dimensions. No canonical graph semantics or persistence formats change, but readiness requires constructive 2-of-3 support plus independent semantic and resilience premortems before production implementation.

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

### Project selected, rail collapsed

The docked rail contributes zero layout width and no focusable descendants. Stable workspace chrome outside it contains:

- `Show project rail`;
- full accessible project name, visually truncatable;
- text state (`Read-only`, `Editable`, `Unsaved changes`, `Repair needed`, or `Preview`);
- at most one critical action with precedence: Return, Repair, Enable editing, then Save for an editable dirty project;
- a non-primary `Recovery available` indication when pending autosave exists; recovery choices remain in the reopened rail.

Compact and expanded actions call the same `ProjectController` methods and share capability checks, permission handling, dirty guards, and conflict behavior. The UI does not duplicate application or persistence semantics.

### Context changes

- cancellation/failure leaves the presentation unchanged;
- read-only to readwrite, clean/dirty, save, permission revocation, repair, preview, and return preserve the user's rail preference while updating compact state;
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

Do not derive `Example`, `Temporary`, `Project`, or `Project preview` from mutable message copy. Extend the UI-facing `ProjectControllerState` with a structured session discriminator and source label, initialized by the composition root for the bundled AgentsCommander document and updated by existing load/preview/return transitions.

Proposed shape (names may be refined without changing meaning):

```ts
type SessionKind = 'example' | 'temporary' | 'project' | 'project-preview';

interface ProjectControllerState {
  sessionKind: SessionKind;
  sourceName: string;
  // existing project/access/capability fields remain authoritative
}
```

This is application presentation state only. It does not modify contract, schema, model, projection, extractor output, or stored JSON. It adds a small explicit state surface in exchange for eliminating message parsing and preventing the UI from claiming that the bundled example is a picked temporary file.

This is a transverse decision because it changes an application-facing state interface and the displayed provenance category; it requires constructive validation.

### No width animation in the first implementation

Collapse/reopen changes layout immediately, then resizes on the next animation frame. `ResizeObserver` remains defense in depth. This gives up decorative motion and avoids stale backing resolution, repeated redraw, pointer-coordinate drift, reduced-motion branching, and performance ambiguity on the canonical dataset.

A later animation is a separately measured enhancement. `prefers-reduced-motion` must still be honored if reviewers require motion before merge.

### Preserve viewport values; reveal additional space

Collapse/reopen does not Fit, ResetLayout, reproject, or alter `viewport.x`, `viewport.y`, or `viewport.zoom`. The canvas origin moves with normal layout and the larger host reveals more world space at the same camera values.

This gives up keeping the same world point at the same absolute screen coordinate when the canvas's left edge moves. It preserves the canonical view state exactly and avoids manufacturing a view edit/dirty autosave merely because chrome changed.

### Expanded-rail canvas width is an explicit product tradeoff

The selected desktop composition adds approximately 232 px beside Explorer and Details. With the prototype dimensions (rail ~232, Explorer ~264, Details ~340), a 1680 px viewport leaves roughly 840 px for the canvas before borders. The current no-rail acceptance threshold is `>900px`.

Proposed budget:

- `1680x1000`, rail expanded: unobscured canvas `>=800px`;
- `1680x1000`, rail collapsed: unobscured canvas `>900px` and gains approximately the full rail width;
- the canvas remains `>300px` tall and has nonzero ink coverage in both states.

This knowingly relaxes the wide expanded-state width budget in exchange for selected Project Rail visibility. The alternative is to undock/close Details whenever the rail is expanded, which preserves `>900px` but weakens prototype B and couples otherwise independent regions. The proposed two-mode budget needs constructive 2-of-3 support before implementation.

### Narrow layout uses inline onboarding and one overlay drawer

Use a separate measured Project Rail docking threshold (initial proposal: `1440px`), not the existing Explorer/Details `1200px` threshold.

- At `1680x1000`, Project Rail can dock.
- At `1024x768` and `800x800`, no-project content is inline before the map toolbar and does not take a horizontal column.
- With a project at those sizes, the expanded rail is an edge overlay/drawer; when closed, compact context remains outside it.
- Project Rail, Explorer, and Details are mutually exclusive only as overlays. Desktop preferences stay independent.

This introduces responsive presentation state in exchange for retaining a real map at tablet sizes. It is a transverse product/layout decision requiring constructive validation.

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

## Focus and ARIA contract

- Project Rail is a named `<aside id="project-rail" aria-label="Project">` or equivalent region, not another Explorer and not one giant toolbar.
- Expanded and compact toggles are native buttons with `aria-controls="project-rail"` and correct `aria-expanded`.
- When collapsed, the rail is `hidden`/unrendered or otherwise absent from focus and the accessibility tree. CSS translation with tabbable descendants is invalid.
- Collapse moves focus to the stable `Show project rail` control outside the rail.
- Reopen moves focus to `Collapse project rail` or the rail heading; it does not trap focus.
- A narrow overlay closes on Escape and returns focus to its opener.
- Any responsive/state transition that hides focused content first selects a stable visible destination; focus must never fall silently to `body`.
- While open, Project context precedes map controls in DOM/Tab order. While closed, compact context precedes map controls.
- Project name truncation retains a full accessible name/title.
- Read-only, Editable, Unsaved, Repair, Preview, and Recovery have text, not color/icon-only meaning.
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
- P1: hidden rail controls are not tabbable and collapse/reopen never loses focus.
- P1: repair and preview cannot expose write actions for the wrong document state.
- P1: rail toggles do not change viewport values, selection, expansion, pinned/dragged positions, filters, or dirty state.
- P1: canvas backing size and pointer mapping are correct immediately after reflow; node/edge hit testing and drag remain correct.
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
  - reuse of existing ProjectController command handlers.
- `VisualSpecs/src/styles.css`
  - outer rail/workspace layout, compact context, state labels, conditional groups;
  - docked/inline/overlay responsive presentation and overflow constraints.
- `VisualSpecs/src/app/projectController.ts`
  - UI-facing structured session identity only; no persistence behavior changes.
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
- renderer port shape or Canvas2D coordinate convention;
- filesystem adapter, File System Access permission model, project manifest/current revision protocol, backup ordering, freshness/conflict handling, repair semantics, import/export destinations, or autosave format;
- extractor behavior or AgentsCommander dataset content;
- GraphRenderer interchangeability;
- repository branch/ruleset policy;
- the untracked `CodebaseGuide/` legacy cache.

No backend, cloud state, telemetry, handle persistence, localStorage, schema migration, or generic notification/error-reporting rewrite is part of this issue.

## Implementation sequence

1. Obtain constructive review of this RFC. Resolve every blocking counterexample and record 2-of-3 support for transverse decisions.
2. Obtain independent semantic and resilience premortems. Do not start production UI code until both report no unresolved P0/P1 finding.
3. Add the structured application session identity and focused `ProjectController` unit coverage.
4. Refactor shell construction so Project Rail/compact context precede a pure map toolbar while preserving direct click-to-picker call paths.
5. Implement conditional rail groups for no-project, read-only, editable, repair, preview, recovery, and context-switch states using existing commands/capabilities.
6. Implement local wide preference, narrow overlay state, project-key reset, focus transfer, Escape, ARIA, and Explorer/Details independence.
7. Add outer layout and responsive CSS. Start without a width animation. Measure actual rail/Explorer/Details/canvas dimensions before freezing tokens.
8. Wire the post-layout `controller.resize()` call and verify the existing observer/adapter path; do not alter the port.
9. Add focused browser tests for state transitions, focus/ARIA, layout width reclamation, viewport preservation, and real pointer interactions after reflow.
10. Add representative responsive and visual evidence at all three canonical viewports.
11. Run unit, typecheck, build, adapter smoke, acceptance smoke, architecture boundary, and screenshot review gates.
12. Send the completed diff and evidence through constructive review-response, then independent final adversarial verdicts. Maximum three rounds before arbitration/escalation to the core lead.
13. Only after all gates pass, commit final implementation, push the issue branch, and open the issue-closing PR through the enforced workflow.

## Focused test plan

### Application/unit

- initial example snapshot exposes structured `example / AgentsCommander` identity;
- picked standalone JSON changes identity to `temporary / <source name>`;
- Create/Open success exposes project identity and correct read-only/readwrite capabilities;
- project preview/return changes and restores session kind without losing project identity;
- temporary open clears project identity exactly as today;
- no new state is serialized or fed into export/autosave text;
- existing permission, repair, preview, autosave, export destination, and conflict tests remain unchanged or gain presentation-only assertions.

### UI/project browser smoke

- initial no-project rail contains only Example, Create/Open, and Document actions;
- project-only and autosave actions are absent, not merely disabled;
- cancel/failure keeps rail visible, focus stable, and state unchanged;
- Create and Open success keep rail expanded and reveal collapse;
- collapse removes width; reopen restores width; focus lands on the specified control both ways;
- `aria-controls`, `aria-expanded`, named regions, accessible full project name, and hidden-tab order are correct;
- compact state/action matrix covers read-only/Enable, editable-dirty/Save, repair/Repair, preview/Return, and recovery indication;
- Project Rail and Explorer/Details toggle independently at wide sizes;
- compact and expanded actions exercise the same real project-store harness paths.

### Renderer/interaction browser smoke

At `1680x1000`:

- record canvas bounding box, viewport, selection, expanded ids, and a known node position with rail expanded;
- collapse and wait one animation frame/resize observer;
- assert the canvas gains approximately the measured rail width and no gutter remains;
- assert viewport values, selection, expansion, filters, and node position are unchanged;
- click a known node using the post-reflow canvas rect;
- click a known edge, zoom, pan, and drag a node with real pointer events;
- reopen and repeat a representative hit test;
- assert backing width tracks CSS width times DPR and ink coverage remains nonzero;
- measure collapse/reopen duration against the 100 ms UI budget without a semantic derive/layout operation.

### Responsive browser smoke

`1680x1000`:

- rail docked expanded and user-collapsible;
- Explorer/Details recognizable;
- expanded canvas `>=800px`, collapsed canvas `>900px`, height `>300px`;
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
- structured application session fields must be reverted together with UI/main/tests, but no stored data references them.

Do not partially revert CSS while leaving focus/state logic, or revert the session discriminator while UI branches on it. Revert the feature as one issue-backed PR if necessary.

If live evidence finds a renderer-port or adapter defect, keep the rail implementation unmerged (or disable only the new rail presentation on the delivery branch) and reopen this RFC. Do not patch canonical camera semantics or introduce auto-Fit as a rollback shortcut.

## Known residual risks

- A full rail plus Explorer plus Details makes the wide canvas narrower by design. The proposed expanded/collapsed budgets require explicit constructive acceptance.
- Compact context duplicates presentation of one action; drift is prevented only if both surfaces reuse the same element/handler/capability derivation.
- Project permission read-only and semantic document read-only are independent axes and are easy to mislabel in compact space.
- Repair, preview, recovery, permission revocation, and dirty changes can arrive while the rail is collapsed; every transition must update an accessible visible summary.
- Responsive presentation adds a third overlay to an existing two-drawer exclusivity model. An enum/single-overlay invariant is safer than three independent booleans.
- Moving the canvas's page origin exposes hit-test code that accidentally caches DOM geometry; current Canvas2D reads a fresh rect, but browser proof is mandatory.
- Reconstructing rail DOM on every project notification can destroy focus or typed project names. Stable elements plus conditional containers are preferred over full host replacement.
- Create/Open must still invoke directory pickers directly from a trusted click. A disclosure/menu must not insert awaited work before the picker.
- The no-animation choice may feel abrupt; motion is deferred until it can be measured without compromising resize correctness or reduced-motion support.

## Constructive decision record

Transverse decisions requiring at least two of three constructive agents:

1. UI-facing structured session identity (`example | temporary | project | project-preview`) in `ProjectControllerState`, with no canonical schema effect.
2. Two-mode desktop canvas budget: `>=800px` while the selected rail is expanded and `>900px` after collapse at 1680.
3. Separate rail docking threshold with inline no-project content and one overlay project drawer at 1024/800.
4. Mounted-only rail preference, reset expanded on reload; `sessionStorage` deferred.
5. Compact critical-action precedence: Return, Repair, Enable editing, Save; recovery is visible but opens the rail.

Current record:

- Graph/runtime owner: `SUPPORT` on RFC round 1. The proposal preserves port/domain boundaries and makes the selected product tradeoff measurable.
- Core lead: `PENDING_FORMAL_RFC_REVIEW`. Issue #7 establishes intent and acceptance scope but does not substitute for review of these implementation-level tradeoffs.
- Extraction/evidence owner: `PENDING_FORMAL_RFC_REVIEW`. Review should confirm that Example/Temporary/Project labels do not overstate extraction provenance and that Project Rail changes do not hide coverage/evidence warnings.

Constructive readiness requires two explicit `SUPPORT` verdicts and resolution of every reproducible P0/P1 counterexample. Preferences without a minimal case/invariant/evidence/impact do not block.

## Independent premortem record

- Semantic red team: `PENDING`. Requested focus: session/project truthfulness; permission vs semantic read-only; repair/preview/recovery action precedence; no duplicated persistence semantics; viewport/selection/layout invariants; no evidence/coverage suppression.
- Resilience red team: `PENDING`. Requested focus: focus loss; hidden tabbables; narrow overlay dead ends; resize/backing-store/hit-test races; dirty/context-switch safety; picker activation; 1680/1024/800 budgets; timing and memory regressions.

No production implementation may start while either premortem has an unresolved P0/P1 finding. Maximum three review/review-response rounds apply before arbitration or escalation to the core lead.

Readiness verdict: `NOT_READY_FOR_IMPLEMENTATION`. The plan artifact is complete for round-1 review; constructive validation and both independent premortems are still mandatory.

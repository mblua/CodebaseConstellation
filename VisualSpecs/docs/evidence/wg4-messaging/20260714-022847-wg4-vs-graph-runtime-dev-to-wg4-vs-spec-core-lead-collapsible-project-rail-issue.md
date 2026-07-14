# Ready-to-publish GitHub issue draft

## Title

`feat(visual-specs): add a collapsible project rail`

## Body

### Decision

Prototype **B — Project Rail** is selected for Visual Specs.

Introduce a dedicated far-left **Project Rail** for workspace/document context and the project lifecycle. It must remain a separate region from the node **Explorer**:

- **Project Rail:** example/project identity, persistence state, Create/Open, Document actions, the current project's critical action, and contextual project data.
- **Explorer:** search, counts, hierarchy/node navigation, filters, and legend for the currently loaded graph.

Do not merge these regions or make the Explorer responsible for project persistence.

Once a project has been successfully created or opened, the user must be able to collapse the entire Project Rail. Collapsing it must reclaim its full width for the graph workspace while preserving safe access to project identity, state, and critical actions.

### Why

The selected rail makes the project lifecycle discoverable and gives growing project data a stable home, but a permanently docked rail competes with the Explorer, Details panel, and graph canvas. That cost is justified during onboarding and project selection, not after every project action.

The post-selection collapse must therefore be a real layout state, not a visual minimization that leaves an empty gutter or a focusable off-screen region.

### Initial no-project state

On first load, the bundled `AgentsCommander` document is visible but has no persistent project.

The Project Rail starts expanded and presents only applicable controls:

- `Example`
- `AgentsCommander`
- `Not persisted`
- `Create Project`
- `Open Project`
- `Document`
  - `Open JSON temporarily`
  - `Export JSON`
- a short explanation that layout/view changes are not persisted yet

`Create Project` and `Open Project` must precede map controls in DOM order, keyboard order, and visual hierarchy. Do not render Save, Rename, Enable editing, Repair, Add JSON, import/export selectors, Restore, or autosave recovery actions when their project state does not exist.

The initial experience must not strand onboarding behind a collapsed rail. At desktop sizes the no-project rail is expanded. At narrow sizes, render the same entry actions as a visible inline/top start region rather than hiding them behind an undiscoverable icon or allowing an overlay to permanently cover the map.

Cancelling or failing a Create/Open picker leaves the rail expanded and leaves document/project state unchanged.

### Post-project collapse behavior

After `Create Project` or `Open Project` succeeds:

1. Keep the rail expanded initially so the selected project identity and resulting access mode are visible.
2. Expose a real button named `Collapse project rail` inside the rail.
3. When activated, remove the rail from layout and reclaim its full width; do not leave a blank column.
4. Reflow and resize the workspace/canvas without reloading the document, recomputing semantic projection, fitting the graph, resetting layout, or clearing selection.
5. Move focus to an always-visible `Show project rail` affordance outside the hidden rail.
6. Reopening restores the rail and moves focus to its collapse control or heading.

The user's explicit collapsed/expanded choice is UI state for the current mounted app. Do not write it into the Visual Specs document, project manifest, autosave view, IndexedDB, or `localStorage`.

For the first implementation, reset the rail to expanded after a full page reload. Whether same-tab reloads should retain the choice via `sessionStorage` is an **open product decision**, not an implicit implementation detail. Cross-session persistence is out of scope.

### State transitions

| Transition/state | Required rail behavior |
|---|---|
| Bundled example, no project | Expanded; Create/Open visible; no project-only actions. |
| Create/Open pending, cancelled, or failed | Remains expanded; no layout-state change. |
| Create/Open succeeds | Remains expanded; collapse control becomes available. |
| User collapses | Full rail width is removed; compact context/reopen surface appears outside it. |
| Read-only → editing enabled | Preserve the user's rail choice; update compact state/action in place. |
| Clean ↔ dirty, save, permission revoked | Preserve rail choice; update status and action in place. |
| Project preview | Rail may remain collapsed, but `Preview` and `Return to project` must remain visible/reachable outside it. |
| Repair required | Rail may remain collapsed, but `Repair needed` and `Repair project` must remain visible/reachable outside it. |
| Different project becomes current | Expand the rail so the new identity/access state is explicit. |
| Project is left for temporary/no-project mode | Expand the no-project rail/start region so Create/Open cannot become undiscoverable. |

Responsive presentation must not overwrite the user's desktop preference. Track user intent separately from whether the rail is currently docked, inline, or an overlay drawer.

### Collapsed project context

The reopen affordance must live in stable workspace chrome, never inside the collapsed rail. It must remain reachable by pointer and keyboard and include:

- `Show project rail`;
- the current project name, with the full name available to assistive technology if visually truncated;
- a text state, not color alone: `Read-only`, `Editable`, `Unsaved changes`, `Repair needed`, or `Preview` as applicable;
- at most one critical contextual action, using this precedence:
  1. `Return to project` for preview;
  2. `Repair project` for revision mismatch;
  3. `Enable editing` for a directory opened read-only;
  4. `Save` for an editable dirty project.

An editable clean project may show `Editable` without forcing a redundant primary action. Keep semantic-document read-only state distinct from directory permission state so the compact UI never promises a write that the controller will refuse.

Compact and expanded controls must call the same existing application/controller commands and share the same capability checks, dirty guards, conflict handling, and picker activation rules. Do not duplicate persistence logic in the UI.

### Project Rail contents after selection

When expanded:

- **Read-only project:** identity, `Read-only`, primary `Enable editing`, Document actions, and browse-only project data where available.
- **Editable project:** identity, `Editable`, accessible dirty state, primary `Save`, Rename, and contextual Imports/Exports actions.
- **Repair:** make `Repair project` the primary action and keep the mismatch warning adjacent.
- **Preview:** make `Return to project` the primary action and suppress write actions for the previewed document.

Project data should be conditionally rendered/disclosed. Do not recreate the current flat row of disabled actions inside the rail.

### Explorer independence

The existing `Explorer` toggle and the Project Rail toggle must be independent:

- collapsing the Project Rail does not close or reset Explorer;
- opening/closing Explorer does not change the Project Rail preference;
- search query, node selection, filters, expansion, Details state, and graph viewport survive either toggle;
- labels and shortcuts must not use `Explorer` as a synonym for Project Rail.

At narrow viewports, if Project Rail, Explorer, and Details are presented as overlays, only one overlay may cover the canvas at a time. The no-project start region remains inline/visible rather than becoming a dismissible overlay that can hide Create/Open.

### Canvas and resize invariants

Collapsing/reopening the rail must:

- update the canvas CSS size and backing resolution promptly;
- invoke/trigger the renderer resize path after the layout change (and after any width transition settles);
- preserve `view.viewport.x`, `view.viewport.y`, and `view.viewport.zoom`;
- preserve current selection, expansion, pinned/dragged positions, filters, and panel states;
- avoid automatic `Fit`, `ResetLayout`, document reload, or projection rebuild;
- preserve pointer hit testing, drag coordinates, edge selection, and crisp rendering after the canvas origin/width changes.

Honor `prefers-reduced-motion`. If a width animation is used, the canvas must not remain stretched or use stale pointer coordinates during or after it. A no-animation implementation is acceptable.

### Keyboard, focus, and ARIA

- Render the rail as a named region such as `<aside id="project-rail" aria-label="Project">`.
- Toggle buttons use `aria-controls="project-rail"` and accurate `aria-expanded` values.
- The collapsed rail is `hidden`/non-rendered or otherwise removed from focus and the accessibility tree; translating it off-screen while its controls remain tabbable is not acceptable.
- `Enter` and `Space` activate collapse/reopen through native button behavior. A new global shortcut is not required.
- On collapse, focus lands on `Show project rail`; on reopen, focus lands in the restored rail without trapping the user.
- If a narrow overlay rail is open, `Escape` closes it and returns focus to the opener.
- If responsive/state changes hide a region containing focus, move focus to a stable visible control rather than `body`.
- Announce project mode and critical state changes politely; do not announce every canvas resize.
- Dirty, read-only, repair, and preview states must have visible text and accessible names, not color/icon-only meaning.
- Maintain a logical Tab order: Project context first while expanded; compact project context first while collapsed; map controls afterward.

### Responsive requirements

Verify at the product's representative viewports:

- **1680×1000:** expanded rail is a docked far-left column (target from the selected prototype: approximately 232 px); Explorer and Details remain recognizable. Collapse reclaims the rail width.
- **1024×768:** the graph keeps a usable full workspace; Project Rail presentation must not combine with Explorer/Details in a way that leaves a narrow strip of canvas. Project context remains reachable without horizontal page scrolling.
- **800×800:** initial no-project Create/Open are visibly inline before map controls. After a project exists, the rail may open as a single mutually-exclusive overlay/drawer, with the compact reopen/state surface always visible outside it.

No viewport may gain document-level horizontal scrolling or hide the only route to Create/Open, Enable editing, Save, Repair, or Return to project.

### Acceptance criteria

- [ ] Project Rail and Explorer are separate named regions with independent controls and state.
- [ ] Initial bundled-example/no-project UI renders the rail/start region expanded with Create Project, Open Project, and Document actions before map controls.
- [ ] No project-only or autosave-only controls render in the initial no-project state.
- [ ] Cancelled/failed Create/Open leaves the rail expanded and does not mutate document/project state.
- [ ] Successful Create/Open leaves the rail expanded and exposes `Collapse project rail`.
- [ ] Collapsing removes the complete rail width and increases the workspace/canvas width; no empty gutter remains.
- [ ] `Show project rail` remains visible, keyboard reachable, and outside the hidden region.
- [ ] Collapsed state always exposes project name/state and the applicable critical action for read-only, dirty editable, repair, and preview states.
- [ ] Reopen restores the rail without losing project state, dirty state, selection, viewport, layout, filters, Explorer, or Details state.
- [ ] A different project or a return to temporary/no-project mode expands the rail/start region.
- [ ] Canvas viewport coordinates/zoom remain unchanged across collapse/reopen; no automatic Fit/Reset/reprojection occurs.
- [ ] Canvas backing size, pointer hit testing, node drag, zoom, and edge selection remain correct after both transitions.
- [ ] Toggle focus behavior and `aria-controls`/`aria-expanded` are correct; hidden controls are not tabbable.
- [ ] Reduced-motion users do not receive a forced width animation.
- [ ] 1680×1000, 1024×768, and 800×800 have no horizontal document overflow and keep critical actions reachable.
- [ ] Existing project freshness/conflict, permission, autosave, temporary-open, and export-destination behavior remains unchanged.

### Verification expectations

Add focused state/DOM tests plus browser coverage using the existing real project UI harness:

1. no-project rendering and conditional control absence;
2. Create/Open success, cancellation, and failure transitions;
3. collapse/reopen focus and ARIA behavior;
4. compact state/action coverage for read-only, editable dirty, repair, and preview;
5. independent Project Rail / Explorer / Details toggles;
6. canvas bounding-box growth and renderer resize at 1680×1000;
7. viewport/selection/layout preservation plus real click/drag/zoom after reflow;
8. narrow behavior at 1024×768 and 800×800, including overlay exclusivity and onboarding discoverability;
9. explicit screenshot artifacts for review; canonical screenshots are updated only through the existing dedicated screenshot command.

Run the existing unit, typecheck, build, adapter smoke, and acceptance smoke gates. Do not weaken `strictPort` or `reuseExistingServer: false` to accommodate local development servers.

### Scope

Expected implementation scope:

- Visual Specs UI composition/state;
- styles and responsive layout;
- renderer resize coordination through the existing port/controller path;
- UI/browser tests and intentional documentation/screenshots.

Out of scope:

- contract/schema, domain, projection, extractor, or graph-semantic changes;
- changing File System Access, save, conflict, backup, import/export, repair, preview, or autosave semantics;
- merging Project Rail with Explorer;
- a general notification/error-reporting rewrite;
- a new backend, cloud state, handle persistence, telemetry, or cross-session rail preference;
- unrelated toolbar redesign beyond what is necessary to host the collapsed context/reopen affordance.

### Known tradeoffs

- The expanded rail deliberately spends horizontal space to make onboarding and project lifecycle explicit; collapse recovers that space only after a project exists.
- The collapsed workspace duplicates a small amount of presentation (identity/state/one action), but must not duplicate command logic.
- Responsive docked/inline/drawer presentations add UI-state complexity; keeping user intent separate from responsive presentation is required to avoid surprising toggles on resize.
- Reflowing Canvas2D can expose stale sizing or coordinate bugs, so resize and real pointer verification are part of the feature, not follow-up polish.

### Open product decision

- Should collapsed/expanded preference survive a same-tab reload via `sessionStorage`? Default for this issue: **no**; keep it in mounted UI state and start expanded after reload. Cross-session persistence remains explicitly out of scope.

## Recommended labels

- `enhancement` (confirmed available)
- Optional if the repository adds/uses them: `visual-specs`, `ui/ux`, `accessibility`

## Delivery note

No code, branch, issue, or repository file was created or modified. The running Visual Specs server was not stopped.

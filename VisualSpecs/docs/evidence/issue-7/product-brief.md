## Decision

Adopt the **B — Project Rail** Visual Specs layout direction and make the entire Project Rail user-collapsible after a project has been created or opened.

The Project Rail is a dedicated far-left region for project/session/document lifecycle. It is distinct from the node **Explorer**, which remains part of the graph workspace.

## Problem

The selected Project Rail gives project state and primary actions a stable home, but a permanently visible rail consumes horizontal space after onboarding is complete. Once a project is active, users need to reclaim that width for the Explorer, graph canvas, and Details panel without losing access to project state or controls.

Simply hiding the rail content is insufficient: collapse must remove the rail's full layout width and safely reflow the graph workspace. It must also leave an unambiguous way to reopen the rail and must not hide critical project state such as read-only/editable, dirty, repair, or preview status.

## Desired behavior

### No project active

- The Project Rail starts expanded and remains the primary entry surface.
- It identifies the bundled example/temporary document and exposes `Create Project`, `Open Project`, and the `Document` actions.
- Project-only and recovery controls that have no valid object are not rendered.
- The user cannot become stranded with the rail hidden before a project exists.

### Project active

- After `Create Project` or `Open Project` completes successfully, the rail exposes a clear `Hide project rail` control.
- Collapsing removes the complete rail width; it must not leave an empty gutter or an invisible focusable region.
- Explorer, canvas, and Details reflow into the reclaimed width, and the renderer is resized through the existing controller boundary.
- A persistent `Show project rail` affordance lives outside the collapsed rail, in the graph workspace chrome. It remains reachable by pointer and keyboard.
- The collapsed affordance communicates the current project identity and critical state, including the applicable read-only/editable, dirty, repair-needed, or preview signal. Critical state must not exist only inside hidden content.
- Reopening restores the rail and all applicable project actions without losing the current document, selection, view, project permission, or dirty state.
- Returning to a no-project/temporary context automatically makes the start actions discoverable again.

### State lifetime

- Treat expanded/collapsed as session/UI state for this issue.
- Do not introduce cross-session persistence, browser storage, backend state, or changes to the Visual Specs document/project schemas.

## Accessibility and interaction requirements

- Toggle controls have explicit accessible names and expose expanded/collapsed state (`aria-expanded` and an appropriate controlled region relationship).
- Collapsing moves focus to the external reopen affordance; reopening returns focus predictably to the rail or its toggle.
- No hidden rail control remains in the tab order or accessibility tree.
- Project state is announced when it changes and remains understandable without relying on color alone.
- Existing keyboard access to Explorer, Details, map controls, and search remains intact.

## Responsive behavior

- At wide desktop widths, expanded mode uses the selected fixed Project Rail layout and collapsed mode returns that full width to the workspace.
- At tablet/small widths where the rail becomes a drawer or inline contextual surface, the same show/hide semantics remain available without horizontal overflow or a permanently occluded canvas.
- The Project Rail and node Explorer must remain visually and semantically distinguishable in every responsive mode.

## Acceptance criteria

- [ ] The initial bundled-example/no-project state renders an expanded Project Rail before the map workspace in visual, DOM, and focus order.
- [ ] Creating or opening a project enables an explicit user-controlled rail collapse.
- [ ] Collapsing removes the rail's complete width and causes the graph workspace/renderer to use the reclaimed space.
- [ ] An always-visible external affordance reopens the rail and identifies the current project plus critical state.
- [ ] Reopening preserves project access, document, selection, viewport/layout, and dirty state.
- [ ] Read-only projects surface `Enable editing`; editable projects surface Save/dirty state; repair and preview states remain discoverable while the rail is collapsed.
- [ ] Returning to temporary/no-project mode cannot leave `Create Project` and `Open Project` unreachable.
- [ ] Hidden controls are absent from focus and the accessibility tree; toggle focus behavior and accessible state are verified.
- [ ] No controls for autosave/project recovery appear when no compatible recovery artifact exists.
- [ ] There is no horizontal overflow or unusable canvas at 1680×1000, 1024×768, and 800×800.
- [ ] Existing map controls, Explorer/Details drawers, project permissions, export routing, and filesystem behavior are unchanged.

## Verification expectations

- Add focused controller/UI tests for expanded/collapsed transitions and no-project reset behavior.
- Add Playwright coverage for create, open read-only, enable editing, collapse, reopen, keyboard focus, and renderer resize.
- Capture visual evidence at 1680×1000, 1024×768, and 800×800.
- Verify zero page errors and no inaccessible or focusable hidden controls.

## Scope boundaries

- UI/layout and interaction state only; no contract, domain, projection, renderer-port, filesystem, or project-schema changes.
- Do not change the node Explorer's meaning or collapse it together with the Project Rail.
- Do not add cloud sync, telemetry, account state, or cross-session rail persistence.
- Do not implement unrelated import/export or error-reporting redesigns in this issue.

## Tradeoff

The Project Rail gains a small amount of toggle/focus state in exchange for preserving the selected project-first hierarchy during onboarding while allowing expert users to maximize the graph workspace afterward.

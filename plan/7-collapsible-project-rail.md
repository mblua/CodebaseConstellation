# Plan #7: add a collapsible Project Rail

Status: `IMPLEMENTATION_IN_PROGRESS`

Issue: <https://github.com/mblua/CodebaseConstellation/issues/7>

Artifact owner: `vs-graph-runtime-dev`

Delivery path: Full. The selected Project Rail changes the shell hierarchy, responsive drawer model, focus order, application-facing session identity, and the Canvas2D host's live dimensions. No canonical graph semantics or persistence formats change. Round 2 received constructive 3-of-3 support. At the round-3 limit, resilience cleared its plan findings, extraction supported responsive/evidence behavior but dissented on identity, and semantic retained the same valid identity P1. The core lead accepted that P1 and supplied the binding plan closure recorded below. This revision applies that arbitration only; production remains blocked pending explicit core conformance and the later independent executable gates.

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

At `>=1664px` this content occupies the docked far-left rail. Below `1664px`, including `1024x768` and `800x800`, it becomes an inline start region before map controls rather than an overlay that permanently covers the canvas or a hidden icon that strands Create/Open.

### Project selected, rail expanded

After Create/Open succeeds, the rail remains expanded once so the resulting identity and access mode are explicit, and a `Collapse project rail` button appears.

The rail then renders only the controls applicable to its state:

- read-only project: name, labeled full escaped canonical manifest project identifier, `Project access: read-only`, `Enable editing`, Document, browse-only Project data;
- editable project: name, labeled full escaped canonical manifest project identifier, `Project access: editable`, accessible dirty state, `Save`, Rename, conditional Project data;
- repair: mismatch warning and primary `Repair project`;
- preview: primary `Return to project`, with write actions suppressed;
- pending autosave: `Recovery available` plus the existing restore/keep/export recovery actions only while the rail is expanded.

Open Project/Open-temporary remain available as explicitly secondary context-switch actions and use the authoritative discard-risk guard plus direct trusted picker activation. Create remains available only when `canCreateProject` is true and is absent/unavailable during Preview until `Return to project`; this issue does not create a project from a preview copy.

State labels are independent facts rather than one exclusive summary. The vocabulary includes `Project access: read-only`, `Project access: editable`, `Document: read-only`, `Unsaved project changes`, `Preview`, `Repair needed`, `Recovery available`, and `Corrupt autosave ignored`; every applicable label renders, including simultaneous combinations, without fabricating mutually exclusive source states. `access` is the application's current editing mode, not an observation of filesystem permission. The critical action remains singular and ordered, but choosing that action never suppresses another true state label.

### Project selected, rail collapsed

The docked rail contributes zero layout width and no focusable descendants. Stable workspace chrome outside it contains:

- `Show project rail`;
- full accessible project name, visually truncatable;
- a labeled collision-aware visible ASCII escaped `project.id` token plus an actual accessible name/description containing the project name and full escaped identifier;
- every applicable text state, composed from the shared presentation model (`Project access: read-only` or `Project access: editable`, `Document: read-only`, `Unsaved project changes`, `Repair needed`, `Preview`, `Recovery available`, and `Corrupt autosave ignored`);
- at most one critical action with precedence: Return, Repair, Enable editing, then Save when `canWriteProject && projectDirty`;
- a non-primary `Recovery available` indication when pending autosave exists; recovery choices remain in the reopened rail.

Compact and expanded surfaces consume one shared derived status/action model. They call the same `ProjectController` handlers and share capability checks, access/permission handling, discard guards, and conflict behavior. The UI does not duplicate application or persistence semantics.

### Context changes

- cancellation leaves the complete session, preview/view, rail/focus, selection, and both dirty facts unchanged and invokes no picker; failure leaves those facts unchanged and reports an action-specific error outside global trust banners;
- read-only to readwrite, clean/dirty, save, permission revocation, repair, preview, and return preserve the user's rail preference while updating every applicable compact-state label;
- entering project preview keeps the preview document's active `dirty` fact separate from an explicitly exposed underlying `projectDirty` fact, so a dirty project never appears clean while its export/import copy is being previewed;
- Return intentionally discards transient Preview-only view edits and restores the retained project view; every other capability-valid destructive context switch confirms active-preview and/or underlying-project changes before invoking its picker;
- a different committed `manifestProjectId` expands/opens the rail so the new identity is explicit; ephemeral `projectKey` remains an internal ref key and is not the displayed discriminator;
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
  manifestProjectId: string | null;
  // existing project/access/capability fields remain authoritative
}
```

`displayLabel` is untrusted presentation identity only. It changes only after the candidate document/project has validated and the corresponding load/open transition succeeds. It renders through inert text nodes, preferably inside `<bdi dir="auto">`, with its full accessible value even when visually truncated. It must never become canonical `model.source`, evidence, a filesystem path, a DOM id/class, confidence, or project/document/export/autosave data.

`manifestProjectId` remains the exact, already-persisted canonical `project.id` read from the validated manifest and is exposed only after the atomic session commit. No normalization, trimming, case-folding, hashing, parsing, scalar-value iteration, or raw-value replacement is allowed. A pure presentation formatter iterates indexes `0..raw.length - 1` with `charCodeAt`, therefore visiting the exact JavaScript UTF-16 code-unit sequence rather than normalized Unicode scalars, and constructs an ordered list of escape atoms:

- emit a unit literally only when it is visible ASCII `0x21..0x7E` and is not backslash (`0x5C`);
- otherwise emit the literal six-character atom `\uXXXX`, with exactly four uppercase hexadecimal digits;
- encode backslash, space, controls, every non-ASCII unit, lone surrogates, and each unit of a surrogate pair through that second rule; for example, a raw backslash is `\u005C` and UTF-16 units `D83D DE00` become `\uD83D\uDE00`;
- concatenate the atoms without decoding or reparsing them.

The mapping is injective over UTF-16 code-unit sequences: a raw backslash can never be a literal output atom, and every escaped atom has fixed width. The full escaped value is presentation-only and does not replace the raw state value. It renders through `textContent` or equivalent inert text construction in a monospace LTR-isolated element such as `<bdi dir="ltr">`; it is never interpreted as markup. The raw id may be separately isolated for diagnostics, but raw Unicode glyphs are never the sole visible or accessible discriminator.

The expanded rail visibly renders a label plus the complete escaped identifier, with wrapping that preserves complete atoms. Its actual accessible name or description includes the project name plus that complete escaped identifier through associated visible text or visually-hidden text. `title` may repeat this value only as supplementary help and is never the accessibility mechanism.

Compact context visibly renders a label plus a collision-aware ASCII token. Its default prefix/suffix abbreviation operates on complete escape atoms and never slices a `\uXXXX` atom; every omission delimiter and length marker also uses visible ASCII only (for example, `...`, not a Unicode ellipsis). When that default token equals the previous selected same-name project's token while the exact raw ids differ, the formatter locates the first differing escape atom and exposes/expands a bounded window around it. If the difference is end-of-sequence, the token also includes an explicit ASCII length marker. The current and previous actual visible tokens must then differ; CSS sizing/truncation may wrap the token but may not hide the distinguishing atom or length marker. Compact accessibility still includes the project name plus the complete escaped identifier through associated or visually-hidden text, independently of `title`.

This reversible presentation choice trades compact cognitive noise and disclosure of a manifest-local identifier for injectively distinguishing contract-valid same-name projects without revealing a selected root path. The id and its escaped/token forms are never DOM identifiers, selectors, command keys, `ProjectRef` values, filesystem paths, evidence paths, or newly persisted fields. Raw manifest and project/document/export/autosave bytes remain unchanged.

Required identity fixtures use angle-bracket unit notation only to construct exact raw test strings:

- `project-alpha` versus `project-<U+200B>alpha`, producing full escapes `project-alpha` and `project-\u200Balpha`;
- `same<U+200B>id` versus `same<U+2060>id`, producing `same\u200Bid` and `same\u2060id`;
- NFC `caf<U+00E9>` versus NFD `cafe<U+0301>`, producing `caf\u00E9` and `cafe\u0301` without normalization;
- bidi `a<U+202E>b` → `a\u202Eb`; whitespace/control `a<U+0020>b` → `a\u0020b` and `a<U+000A>b` → `a\u000Ab`; raw backslash `a<U+005C>b` → `a\u005Cb`; and markup-looking ASCII `<script>` → the same visible characters inserted only as inert text;
- a lone UTF-16 surrogate `0xD800` and a valid surrogate pair, proving `\uD800` and separate fixed-width atoms respectively;
- distinct ids with equal default prefix/suffix and a middle difference, including a difference otherwise hidden by CSS truncation;
- the existing maximum-length contract case.

For every compared distinct raw id, tests require different actual visible tokens whose code units all lie in `0x21..0x7E`, complete escaped accessible identity without relying on `title`, inert rendering, and no DOM/ref/path/command/persistence use. A before/after byte assertion proves the raw persisted identifier is unchanged. This is application presentation state only: it does not modify contract, schema, model, projection, extractor output, or stored JSON. The original `sessionKind`/`displayLabel` decision retains constructive 3-of-3 support; the binding replacement for the manifest-id refinement is recorded below.

### One shared derived project presentation model

Add only the narrow structured facts the UI cannot derive truthfully today:

```ts
interface ProjectControllerState {
  // `dirty` remains the active document/view dirty fact.
  projectDirty: boolean | null;
  hasDiscardableChanges: boolean;
  corruptAutosaveIgnored: boolean;
  lifecycleBusy: boolean;
  // existing access/readOnly/previewing/needsRepair/pendingAutosave/capabilities remain authoritative
}
```

`projectDirty` is `null` with no underlying project. With an open project it is `previewReturn?.dirty ?? dirty`, so preview can expose the saved private return fact without claiming the preview document itself is dirty. `corruptAutosaveIgnored` lets compact UI expose the existing corrupt-autosave case without inferring structure from concatenated mutable `message`; it is a narrow status, not a generic notification system.

`hasDiscardableChanges` is the one authoritative context-switch fact: `dirty || projectDirty === true`. No expanded, compact, keyboard, or responsive surface reimplements this predicate. `lifecycleBusy` becomes true synchronously at operation admission and makes incompatible lifecycle/write capabilities false while the old complete session remains observable.

Busy gating covers Create/Open/Open-temporary/Return, Enable/Repair, Save/Rename, Add/import/restore, stored-doc refresh/open, export/save-picker, autosave-copy, and compact equivalents. A second normal UI action cannot enter this set until the winning operation settles; direct overlapping calls remain protected by epoch/session tokens and are exercised only to falsify safety.

A pure UI derivation consumes the complete `ProjectControllerState` once and produces:

- a list/set of all applicable status keys and fixed accessible labels;
- at most one critical action key using Return → Repair → Enable editing → Save precedence;
- recovery/corrupt-autosave affordance state;
- capability-derived visibility for secondary actions.

Expanded and compact renderers consume that same object. Action keys map to one shared handler registry backed by the existing controller methods. Neither surface re-derives facts, parses `message`, or implements its own access/permission/discard/conflict behavior.

### Atomic serialized session lifecycle

Session-changing and project-writing operations share an application/controller operation boundary. Normal UI admits one such operation at a time; adversarial/direct calls may overlap, so safety does not depend on disabled buttons alone.

The boundary uses a monotonically increasing `sessionOperationEpoch` and the synchronous public `lifecycleBusy` fact:

1. the event handler performs the synchronous discard confirmation, if applicable;
2. on acceptance, the controller increments the epoch, sets `lifecycleBusy = true`, disables incompatible lifecycle/write capabilities, and notifies that busy fact without changing any session/document identity;
3. in the same original click call stack, with no awaited prework, it invokes the privileged store/picker/permission method and records its promise;
4. manifest/current/autosave validation plus imports/exports and every other fallible auxiliary read complete into a local immutable candidate; the old complete session remains observable throughout;
5. completion checks its captured epoch. A stale success/error neither commits state, clears a newer busy flag, nor replaces the current action error;
6. the winning candidate commits loaded document, derived graph, renderer state, project ref/head/fingerprint, manifest id/name, access, session identity, dirty/preview/recovery/corrupt-warning facts, stored-doc lists, and message in one non-awaiting section;
7. only the winning epoch clears `lifecycleBusy` and emits the final aggregate state.

Foreground user operations advance the epoch. Background autosave never supersedes one: lifecycle admission cancels its pending timer, and any already-started flush carries only the captured session token and becomes stale when that token changes. Its completion cannot commit UI state, clear busy/error, or write a later session's view.

`Controller` gains a narrowly scoped application commit primitive that installs a loaded document/derived scene without notifying listeners, runs a synchronous ProjectController state-install callback (including final busy/identity/dirty facts), then renders/notifies exactly once. ProjectController dirty/autosave observation stays in commit/loading mode through that controller notification and emits its own final notification before returning to the event loop. No controller or project subscriber can cross-read a new document with an old project ref, or vice versa. The callback cannot await or call a store. This is an application transaction boundary, not a domain command, renderer-port change, or persistence transaction.

Enable, Repair, Save, import/restore, autosave rewrite, and export operations capture an immutable session token (`sessionOperationEpoch`, canonical manifest id, `ProjectRef`, head/fingerprint, and serialized payload as applicable) before their first await. A forced overlapping completion may affect only the captured project/payload and may update UI state only if its epoch/session token is still current. It must never read a later active document and write it through an earlier ref.

Create validates the name and captures its source document plus manifest/id/time inputs synchronously before invoking `store.createProject`; the store's post-picker `prepare` callback returns that immutable payload and never re-reads `controller.exportText()` after an await. Save/export similarly capture serialized text before their first await. This closes the Open/Create and Open/Save payload half of the session/ref race as well as the final commit half.

Opposite-order deferred tests cover Open A/Open B, Open/Create, Open/Enable, and Open/Save. They force both completion orders around validation/list reads, permission, and writes. At every notification, active document, manifest id/name, ref/head, display identity, dirty owner, capability set, and write destination belong to one session. Stale completions perform no cross-project write and cannot clear the winning busy/error state.

### One authoritative discard-risk guard

Every capability-valid Create Project, Open Project, and Open JSON temporarily handler—expanded, compact, keyboard, or responsive—uses `hasDiscardableChanges`. Create is capability-invalid during Preview and remains absent until Return.

The guard is synchronous and precedes the direct controller/store invocation. `hasDiscardableChanges = dirty || projectDirty === true` remains its single admission predicate, but confirmation copy deduplicates ownership by `sessionKind`:

| Session kind | Loss facts used for copy | Required confirmation meaning |
| --- | --- | --- |
| `example` / `temporary` | active-document `dirty` only; `projectDirty` is `null` | when dirty, name the current document's unsaved view changes once |
| `project` | `dirty` and `projectDirty` describe the same ordinary-project loss | when either is true, name the open project's unsaved layout/view changes once, never as two losses |
| `project-preview` | active Preview `dirty` and underlying `projectDirty` are independent owners | name neither, either one, or both distinct losses according to the two facts |

The ordinary-project rule also deduplicates a defensive/transitional snapshot where only one alias is true. Only `project-preview` can produce copy that names two independent losses.

Cancel returns before the controller method, so picker/permission call count remains zero and session kind, preview/return state, project identity/ref/head, viewport, selection, layout, filter, rail/overlay preference, focus, active/underlying dirty, recovery, and action error remain unchanged. Accept invokes the privileged method immediately in the same trusted activation task; later picker cancellation/failure also preserves the complete old session and reports only an action-specific transient error when appropriate.

Preview-only view edits are intentionally transient: `Return to project` discards active Preview `dirty` without a discard prompt and restores the retained project view/dirty state. Open Project/Open temporary prompt for active Preview dirty, underlying project dirty, or both. No Preview edit is silently aliased to `projectDirty`, autosaved into the project, or treated as a project write.

### Corrupt-autosave condition lifetime

`corruptAutosaveIgnored` describes the current selected project's autosave condition, not historical telemetry. It becomes true only when the current session ignores a corrupt autosave. It clears after a successful valid autosave rewrite, a successful current-document commit/import/restore that establishes valid current recovery state, or a selected-project/session-identity change to another project/temporary/example. Preview/Return within the same selected project does not falsely clear it. A failed rewrite/commit leaves it true. The structured flag and fixed copy never derive from `message`.

### No width animation in the first implementation

Collapse/reopen changes layout immediately, then resizes on the next animation frame. `ResizeObserver` remains defense in depth. This gives up decorative motion and avoids stale backing resolution, repeated redraw, pointer-coordinate drift, reduced-motion branching, and performance ambiguity on the canonical dataset.

A later animation is a separately measured enhancement. `prefers-reduced-motion` must still be honored if reviewers require motion before merge.

### Preserve viewport values; reveal additional space

Collapse/reopen does not Fit, ResetLayout, reproject, or alter `viewport.x`, `viewport.y`, or `viewport.zoom`. The canvas origin moves with normal layout and the larger host reveals more world space at the same camera values.

This gives up keeping the same world point at the same absolute screen coordinate when the canvas's left edge moves. It preserves the canonical view state exactly and avoids manufacturing a view edit/dirty autosave merely because chrome changed.

### Expanded-rail canvas width is an explicit product tradeoff

The current docked CSS tokens are Explorer `290px` and Details `380px`; round 1's roughly 840 px arithmetic used prototype targets of about `264px` and `340px`, not the implementation defaults. A `232px` rail beside the real defaults would leave only `778px` before any remaining chrome, so it cannot substantiate the accepted expanded budget.

Round 2 makes the width choice explicit: retain the current `290px` Explorer and `380px` Details tokens unchanged, and start the docked Project Rail at `192px` (border-box). This leaves a nominal `818px` canvas at 1680 and gives up 40 px of the prototype rail width; long names may truncate with their full accessible value, while escaped project-id text wraps only at atom boundaries and never hides the compact distinguishing atom. The narrow overlay may use a separate approximately `232px` token because it does not participate in docked canvas arithmetic.

Proposed budget:

- `1680x1000`, rail expanded: unobscured canvas `>=800px`;
- `1680x1000`, rail collapsed: unobscured canvas `>900px` (nominally `1010px`) and gains approximately the full measured `192px` rail width;
- the canvas remains `>300px` tall and has nonzero ink coverage in both states.

Playwright must measure rendered bounding boxes rather than accept the arithmetic. Do not silently reduce Explorer/Details widths. If the real expanded canvas is below `800px`, stop and record one explicit choice for review: narrow the new rail with accessible-content proof, deliberately change an existing panel token with its own regression evidence, undock a panel, or accept a revised product budget. The accepted two-mode outcomes have constructive 3-of-3 support; a measurement-driven departure reopens that decision.

### Three-band responsive model

The round-2 `~1440px` proposal is replaced by measured bands that retain the existing Explorer/Details dock threshold and the accepted 1680 canvas budget:

- **Wide, `>=1664px`:** Project Rail may dock at `192px` beside unchanged Explorer `290px` and Details `380px`. At 1680 the nominal expanded canvas is 818px and must measure `>=800px`.
- **Hybrid, `1200..1663px`:** no-project onboarding is inline. With a project, Project is an approximately `232px` left overlay. While it is open, Explorer presentation and its grid column are suppressed without mutating Explorer's desktop preference; the rail overlays the reclaimed canvas edge. Details retains its independent docked preference. Closing Project restores Explorer presentation and focus predictably.
- **Narrow, `<1200px`:** no-project onboarding is inline; Project, Explorer, and Details share one exclusive overlay state over a full-width canvas.

This gives up docking Project in the intermediate band to avoid a 578px nominal canvas at 1440 and an Explorer hidden beneath an overlay. Extraction gave the responsive/evidence refinement round-3 `SUPPORT`; identity now follows the binding core representation and awaits conformance as recorded below.

## UI-state model and exhaustive overlay transitions

User preference is distinct from responsive presentation:

```ts
type Surface = 'project' | 'explorer' | 'details';
type LayoutBand = 'wide' | 'hybrid' | 'narrow';

let desktopPreference = {
  project: 'expanded' as 'expanded' | 'collapsed',
  explorer: 'open' as 'open' | 'closed',
  details: 'open' as 'open' | 'closed',
};
let activeOverlay: Surface | null = null;
let overlayOpener: HTMLElement | null = null;
let lastManifestProjectId: string | null = null;
let previousSelectedProjectIdentity: {
  displayLabel: string;
  manifestProjectId: string;
  compactToken: string;
} | null = null;
```

`previousSelectedProjectIdentity` is ephemeral mounted presentation state only. Immediately before a successful different-project commit replaces the current session, it snapshots the prior project's exact name/raw id and actual compact token; it is used only when the next exact name matches and the raw ids differ. Both raw ids are formatted into atom lists afresh for the bounded differing-window calculation. It is never serialized or used as a ref/key/path.

Wide preferences change only through explicit surface toggles or the accepted new-project identity rule. Breakpoints and overlay exclusivity never overwrite them. `activeOverlay` is always `null` in Wide, only `project | null` in Hybrid, and any one surface or `null` in Narrow.

| Event | Wide `>=1664` | Hybrid `1200..1663` | Narrow `<1200` | Preference/focus rule |
| --- | --- | --- | --- | --- |
| Show Project | dock if project exists; start content docked otherwise | set `activeOverlay=project`; suppress Explorer column | replace active overlay with Project | record exact visible opener; focus first Project control/heading; do not alter Explorer/Details preference |
| Hide Project / Escape in Project | collapse docked Project | clear overlay; restore Explorer per preference | clear overlay | focus the exact still-visible opener, or its corresponding visible replacement after a breakpoint |
| Show Explorer | set Explorer preference open/docked | close Project overlay if active, restore/set Explorer docked | replace active overlay with Explorer | explicit desktop toggle updates Explorer preference; overlay replacement does not |
| Hide Explorer / Escape in Explorer | set Explorer preference closed | set preference closed/remove column | clear overlay | focus exact visible Explorer opener |
| Show Details | set Details preference open/docked | set Details preference open/docked; Project overlay may remain | replace active overlay with Details | explicit desktop toggle updates Details preference; narrow replacement does not |
| Hide Details / Escape in Details | set Details preference closed | set preference closed/remove column | clear overlay | focus exact visible Details opener |
| Other overlay opens | not applicable | only Project is an overlay; Explorer restore closes it, Details can remain docked | atomically replace current overlay | old hidden subtree has no focus; focus new surface; retain all desktop preferences |
| New manifest project id commits | force Project preference expanded/docked | open Project overlay and suppress Explorer | open Project overlay | snapshot prior identity/token, update `lastManifestProjectId`, derive the new atom-safe collision token, then focus Project identity/collapse control after the atomic lifecycle commit |
| Project becomes null/temporary | show docked no-project start | clear overlay and show inline start; restore Explorer | clear overlay and show inline start | do not serialize preference; move hidden focus to visible Create/Open start control |
| `1199 → 1200` | not applicable | Project overlay remains Project; Explorer/Details become docked only per preferences | source state | if a narrow Explorer/Details was active but its preference is closed, close to its visible toggle; never focus `body` |
| `1200 → 1199` | not applicable | source state | choose the currently focused visible surface as the sole overlay, otherwise start closed | preserve focused element when its stable surface remains visible; otherwise focus its toggle |
| `1663 → 1664` | clear overlay and derive all docks from preferences | source state | not applicable | if Project was overlayed but wide preference is collapsed, focus Show Project; otherwise preserve focused stable element |
| `1664 → 1663` | source state | show Project overlay iff wide Project preference is expanded; suppress Explorer then | not applicable | preserve focus in the same mounted rail; otherwise keep overlays closed |
| rapid/oscillating resize | derive once from final band | derive once from final band | derive once from final band | coalesce pending layout/resize work; never mutate preference or selection |

Committed manifest-id/session-ref changes, null-project transitions, opener replacement, and automatic closes use this table rather than ad hoc booleans. No new global shortcut is required. A later shortcut must avoid the existing F/E/C/R/S/+/-/[/] bindings and be separately documented.

## Global trust, warning, and evidence surfaces

`bannerHost` remains stable workspace chrome outside the hideable Project Rail and outside any narrow overlay subtree. Rail collapse, overlay close, and responsive breakpoint changes must not hide it, apply `aria-hidden` to it, move it behind an overlay, or remove it from the accessibility tree.

The following existing global facts remain visible and accessible in every expanded/compact rail state: dirty extraction source, degraded coverage, unresolved relations, semantic document read-only, privacy/validation warnings, refresh-loss reporting, and active filter masking. These are graph/document trust surfaces, not project-navigation content.

Project-scoped warnings remain distinct. `pendingAutosave` and the narrow `corruptAutosaveIgnored` structured fact feed the shared project presentation model, so recovery and corrupt-autosave status remain discoverable while collapsed without parsing `message`. The full existing actions/copy can remain in the expanded rail/status path; this issue does not introduce a generic notification framework.

A separate stable `actionErrorHost` and narrow transient state report failed user actions. `reportLoadError()` no longer clears or owns `bannerHost`; `renderBanners()` remains the only global trust-fact renderer. Action errors use a discriminated operation kind and fixed action-specific prefix for temporary-document validation, Create, Open, Enable editing/permission, Repair, Save conflict/write, import/restore, and picker failure. A Save conflict cannot say “This document was refused,” and cancellation is not an error.

Admitting a newer action may set busy state but retains the prior transient error until the winning result: success clears it, a non-cancellation failure replaces it with operation-specific copy, and cancellation leaves it unchanged. Stale completions cannot replace it. The error host uses `role="alert"` or an equivalently scoped announcement without moving focus. This is not a generic notification redesign and does not change error types in ports/domain.

Global and action surfaces coexist. Invalid temporary JSON, Save conflict, and permission denial must leave dirty-source/coverage/unresolved/privacy/filter/semantic-read-only banners rendered and accessible at wide/narrow widths with the rail expanded/collapsed. Geometry and sampled `elementFromPoint` assertions prove neither an overlay nor the error host physically occludes those banners.

Evidence reachability is also invariant under chrome changes: after a real post-reflow node or edge selection, closing a narrow Project Rail and opening Details preserves that selection and exposes the selected relation/node's expected confidence plus `.evidence` `path:line` entries.

## Focus and ARIA contract

- Project Rail is a named `<aside id="project-rail" aria-label="Project">` or equivalent region, not another Explorer and not one giant toolbar.
- Expanded and compact toggles are native buttons with `aria-controls="project-rail"` and correct `aria-expanded`.
- When collapsed, the rail is `hidden`/unrendered or otherwise absent from focus and the accessibility tree. CSS translation with tabbable descendants is invalid.
- Collapse moves focus to the stable `Show project rail` control outside the rail.
- Reopen moves focus to `Collapse project rail` or the rail heading; it does not trap focus.
- A Hybrid/Narrow overlay handles Escape before editing-key suppression, closes only the active overlay, and returns focus to its exact current visible opener.
- Any responsive/state transition that hides focused content first selects a stable visible destination; focus must never fall silently to `body`.
- While open, Project context precedes map controls in DOM/Tab order. While closed, compact context precedes map controls.
- Project/session/name truncation retains the full untrusted name through inert `<bdi dir="auto">` or equivalent isolated text and an actual accessible name/description.
- Project-id presentation uses only the injective escaped ASCII form as its visible discriminator, in inert monospace LTR isolation. Expanded UI visibly labels the complete escape; compact UI visibly labels a collision-aware token whose distinguishing atom cannot be truncated. Both actual accessible name/descriptions contain project name plus the complete escaped identifier through associated or visually-hidden text; `title` is supplementary only.
- `aria-expanded` describes current presentation, not the stored desktop preference: a Hybrid-suppressed Explorer reports `false`, then reports `true` when restored from its retained open preference.
- Project access read-only/editable, semantic document read-only, Unsaved, Repair, Preview, Recovery, and corrupt-autosave facts compose as text; none relies on color/icon-only meaning or suppresses another applicable fact.
- Project state changes use the existing polite status path or a narrowly scoped polite region; canvas resize itself is not announced.
- Explorer and Details retain their existing labels, `aria-expanded`, shortcuts, and narrow exclusivity behavior.

### Stable form DOM and shortcut isolation

Stable Project Rail form DOM is mandatory, not a preference. `mountUi()` creates the rail, rename input, selects, buttons, status groups, and action-error host once. Project notifications and breakpoint changes patch text, attributes, keyed options, and conditional `hidden` groups; they never `clear()`/rebuild/reparent the focused rail subtree.

Unrelated autosave, failure, access, dirty, recovery, preview, repair, and lifecycle-busy updates preserve element identity, focus, selection/caret, typed value, select type-ahead, and IME composition. A rename value is synchronized from state only after a successful rename or a committed project-identity change and never while its input is focused/composing. Stored-doc options are keyed and patched only when their source collection changes; selected value and focus survive the patch. Before a capability transition hides a focused group, focus moves to the table-defined visible destination.

One interaction-target predicate covers the target or composed-path ancestor matching `input`, `textarea`, `select`, `button`, `a[href]`, enabled `contenteditable`, and ARIA `combobox`, `listbox`, or `option` equivalents. Global F/E/C/R/S/+/-/[/] shortcuts never run from those targets. When `activeOverlay !== null`, Escape is handled first even from those controls, prevents the editing/global command, closes exactly one overlay, and focuses `overlayOpener` or its table-defined visible replacement.

Tests hold the identical DOM element through autosave success/failure and permission/dirty/recovery/preview notifications, preserve caret/value/composition, then type every shortcut key and prove scene, viewport, export/write counts, and filesystem calls do not change. Select type-ahead must not trigger Save/Export. Destroy removes key/resize/composition listeners and cancels pending focus/layout work.

## Renderer resize boundary

The UI owns chrome state; the controller/renderer own canvas realization.

Expected sequence for a docked rail toggle:

1. update UI state and DOM class/hidden attributes synchronously;
2. let layout compute with no width transition;
3. call `controller.resize()` on the next animation frame;
4. allow the existing Canvas2D host `ResizeObserver` to act as idempotent defense in depth;
5. do not dispatch a view command and do not call Fit/Reset.

`Canvas2DRenderer.resize()` already updates DPR backing width/height and redraws without modifying or emitting the viewport. `toWorld()` already reads the current bounding rectangle for every pointer event. Those behaviors are verified, not rewritten.

The UI owns one pending resize rAF id. A newer toggle/breakpoint result cancels and replaces older scheduled work; `destroy()` cancels it and the callback checks the destroyed/final-layout token. The 100ms endpoint is not `aria-expanded`: it is the first painted and pointer-interactive frame in which the final canvas rect, CSS size, DPR backing width/height, ARIA/focus, and ink match the winning state.

Measure at DPR 1 and 2 over repeated toggles and report p50/p95/worst, with p95 and worst below 100ms on the canonical dataset. A 20+ no-wait alternating-toggle burst must settle to the final requested state with correct rect/backing/ink and no orphan rAF. The first immediate post-toggle node/edge interaction plus pan/zoom/drag must map correctly. A dev/test hook verifies scene object identity so chrome reflow does not rederive semantic scene/layout or mutate viewport, selection, positions, filters, or dirty facts.

No change is planned for:

- `src/ports/renderer.ts`;
- `src/adapters/canvas2d/Canvas2DRenderer.ts`.

`src/app/controller.ts` may gain only the non-awaiting aggregate lifecycle commit primitive described above; its renderer port, viewport convention, semantic command path, derive behavior, and resize API do not change.

If browser evidence reveals that the existing port/adapter cannot meet the invariant, stop implementation and revise this RFC through constructive review rather than silently broadening scope.

## Invariants and severity

- P1: the rail and Explorer are distinct named regions; neither toggle mutates the other's desktop preference or graph data.
- P1: no-project Create/Open is visible and precedes map controls at every representative viewport.
- P1: collapsed project state always exposes reopen, project name plus a labeled collision-aware escaped manifest-id token, state, and Return/Repair/Enable/Save when applicable; same-name distinct raw UTF-16 ids produce different actual visible ASCII tokens.
- P1: expanded identity visibly exposes the labeled complete injective UTF-16 escape, and both expanded/compact actual accessible identities contain project name plus that full escape without relying on `title`; default-ignorables, normalization lookalikes, bidi/control/space/backslash, surrogate, middle-difference, markup-looking, and maximum-length cases remain inert and distinguishable.
- P1: exact raw `manifestProjectId` state and persistence bytes are unchanged; raw or escaped identity never becomes a DOM/ref/command/path/evidence/persistence key.
- P1: status labels are conjunctive: project access, semantic document read-only, project dirty, preview, repair, recovery, and corrupt-autosave facts all remain visible when simultaneous; selecting one critical action by precedence never suppresses a true label.
- P1: preview exposes the underlying project's `projectDirty` value independently from the active preview document's `dirty` value, including after permission/repair/recovery transitions.
- P1: `hasDiscardableChanges` guards every capability-valid context switch; cancel calls no picker and preserves both dirty owners, while accept retains trusted activation and names every applicable loss exactly once per session owner—ordinary project aliases deduplicate, and only Preview may name two losses.
- P1: the old complete session remains observable during fallible lifecycle reads; one non-awaiting winning commit installs document/ref/head/identity/dirty/warnings together, and stale epochs never mix or write across sessions.
- P1: `lifecycleBusy` disables incompatible lifecycle/write capabilities synchronously; stale success/error cannot clear the winning busy/error state.
- P1: global dirty-source, coverage, unresolved, semantic-read-only, privacy/validation, refresh-loss, and filter banners remain outside the hideable rail, visible, and in the accessibility tree at wide and narrow viewports.
- P1: transient/action errors are operation-specific and never clear, replace, mislabel, or physically cover global trust facts.
- P1: corrupt-autosave/recovery project warnings remain discoverable from compact state through narrow structured facts; no surface parses mutable message copy.
- P1: Project form controls are mounted once; notifications/breakpoints preserve element identity, focus, caret/selection, typed value, type-ahead, and IME composition.
- P1: hidden rail controls are not tabbable; overlay Escape is handled first and returns to the exact visible opener without focus falling to `body`.
- P1: global shortcuts never run from form/interactive/contenteditable/combobox/listbox/option targets and cannot cause scene mutation or filesystem writes.
- P1: repair and preview cannot expose write actions for the wrong document state.
- P1: rail toggles do not change viewport values, selection, expansion, pinned/dragged positions, filters, or dirty state.
- P1: canvas backing size and pointer mapping are correct immediately after reflow; node/edge hit testing and drag remain correct.
- P1: closing a Narrow rail and opening Details after a post-reflow selection preserves selection and exposes expected confidence plus `.evidence` `path:line` entries.
- P1: at Hybrid width, opening Project suppresses only Explorer presentation while retaining its preference; docked Details preserves the selected edge, confidence, and identical `.evidence` `path:line`, and close restores Explorer, focus, and truthful `aria-expanded`.
- P1: project/filesystem commands retain direct user activation, permission, freshness, conflict, backup, and safe-open behavior.
- P2: a docked collapse reclaims the complete rail width with no empty gutter.
- P2: the three-band transition table permits at most one overlay, preserves all desktop preferences, and does not cause document horizontal scrolling.
- P2: project-only/autosave-only controls are absent rather than disabled in no-project state.
- P2: resizing across breakpoints preserves explicit desktop preference.
- P2: a current `corruptAutosaveIgnored` clears after successful valid rewrite/current commit or session change and remains on failed rewrite.
- P2: collapse/reopen reaches final rect, DPR backing size, paint, and interaction without semantic derive/layout recomputation; reported p50/p95/worst meet the 100ms budget and rapid toggles coalesce cleanly.
- P2: global banners are geometrically unobscured, and rail/controls remain horizontally contained with maximum statuses and hostile/RTL/long labels.
- P2: current toolbar/panel shortcuts and aria-live selection announcements remain intact.

## Allowed artifacts and systems

Expected production edits:

- `VisualSpecs/src/ui/app.ts`
  - shell composition, Project Rail DOM, compact context, conditional control groups;
  - independent desktop preferences, explicit active-overlay transition table, and three responsive bands;
  - stable form DOM, focus/caret/composition preservation, interaction-target shortcut isolation;
  - discard confirmation, trusted activation, action-specific error host, and capability/busy presentation;
  - focus transfer, Escape handling, overlay exclusivity, coalesced resize scheduling/cleanup;
  - one pure shared status/action derivation consumed by expanded and compact surfaces;
  - one pure UTF-16-code-unit escape/atom formatter plus collision-aware compact presentation, used only for inert identity text;
  - reuse of one handler registry backed by existing ProjectController commands;
  - keep global trust/evidence banners outside the rail and every overlay subtree.
- `VisualSpecs/src/styles.css`
  - outer rail/workspace layout, compact context, state labels, conditional groups;
  - 1664/1200 docked/hybrid/narrow presentation, banner layering, and horizontal containment/internal vertical overflow constraints.
- `VisualSpecs/src/app/projectController.ts`
  - UI-facing `sessionKind`/untrusted `displayLabel` plus the exact raw manifest project-id identity;
  - `projectDirty`, `hasDiscardableChanges`, current `corruptAutosaveIgnored`, and `lifecycleBusy` facts;
  - epoch/session-token guarded candidate loading and atomic aggregate lifecycle commit;
  - no persistence behavior changes and no generic notification redesign.
- `VisualSpecs/src/app/controller.ts`
  - narrowly scoped non-awaiting loaded-state install/aggregate notification boundary;
  - no domain-command, derive, renderer-port, or viewport semantic change.
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
- canonical manifest `project.id` value, UTF-16 sequence, validation, serialization bytes, or storage; selected-root disclosure; derived escape persistence; or any use of raw/escaped/token identity as a DOM/selector/command/ref/path/evidence key;
- meaning, derivation, or placement in the accessibility tree of existing global trust/evidence banners;
- renderer port shape or Canvas2D coordinate convention;
- filesystem adapter, File System Access permission model, project manifest/current revision protocol, backup ordering, freshness/conflict handling, repair semantics, import/export destinations, or autosave format;
- extractor behavior or AgentsCommander dataset content;
- GraphRenderer interchangeability;
- repository branch/ruleset policy;
- the untracked `CodebaseGuide/` legacy cache.

No backend, cloud state, telemetry, handle persistence, localStorage, schema migration, or generic notification/error-reporting rewrite is part of this issue.

## Implementation sequence

1. Commit this plan-only binding-arbitration revision and report its exact SHA, diff/checks, and tracked status to the core lead.
2. Await explicit core conformance and implementation-readiness disposition. `DRAFT_CORE_ARBITRATION_APPLIED` does not authorize production code.
3. Implement the epoch/session-token boundary, atomic aggregate commit, `lifecycleBusy`, identity/discard/corrupt-status facts, and deferred opposite-order unit tests first.
4. Implement the one discard guard, Preview semantics, direct trusted activation, and separate action-error host with failure/coexistence tests.
5. Refactor shell construction once: mount stable Project Rail/compact/form/error DOM before a pure map toolbar and use one derived model/handler registry.
6. Implement access/document/dirty/preview/repair/recovery labels plus name and injectively escaped manifest-id identity, collision-safe atom abbreviation, conditional groups, shortcut isolation, focus/caret/composition preservation, and Create-during-Preview disposition.
7. Implement independent desktop preferences, the exhaustive active-overlay table, and `>=1664`/`1200..1663`/`<1200` CSS with 192/232/290/380 measured tokens and containment rules.
8. Wire coalesced post-layout `controller.resize()`, destroy cleanup, DPR 1/2 endpoint instrumentation, and verify the existing renderer adapter without changing its port.
9. Add focused browser tests for lifecycle/discard/activation/errors/stable DOM/focus/ARIA, escaped-identity fixtures, responsive transitions including the Hybrid evidence flow, width reclamation, state preservation, and real post-reflow interactions.
10. Add representative responsive/visual evidence at boundaries plus 1680/1024/800, maximum hostile status content, banner occlusion, and rapid toggles.
11. Run unit, typecheck, build, adapter smoke, acceptance smoke, architecture boundary, performance, and screenshot review gates.
12. Once implementation is explicitly authorized, send the completed diff/evidence through both independent final executable gates; the plan-level clearances/arbitration do not waive those reviews.
13. Only after all gates pass, commit final implementation, push the issue branch, and open the issue-closing PR through the enforced workflow.

## Focused test plan

### Application/unit

- initial example snapshot exposes structured `example / AgentsCommander` identity through `displayLabel`;
- a validated picked standalone JSON changes identity to `temporary / <display label>`; validation/cancel/failure leaves the prior label unchanged;
- Create/Open success atomically exposes name, exact raw canonical `manifestProjectId`, ref/head, document, and correct read-only/readwrite capabilities;
- the pure formatter visits `charCodeAt(i)` units, emits only permitted literal ASCII or uppercase fixed-width `\uXXXX` atoms, encodes surrogate pairs as two atoms, and never normalizes/trims/case-folds/hashes/parses;
- every required same-name/distinct-id fixture produces different actual visible ASCII compact tokens, including both default-ignorable pairs and the equal-prefix/suffix middle difference; abbreviation never splits an atom and CSS cannot hide the distinguishing atom/length;
- expanded and compact identities expose project name plus the complete escaped id in their actual accessible name/description without `title`; markup-looking/RTL/bidi/control/space/backslash/surrogate/max-length cases render inertly in LTR-isolated monospace;
- project preview/return changes and restores session kind without losing project identity, and exposes `projectDirty = previewReturn.dirty` while active `dirty = false`;
- no-project snapshots expose `projectDirty = null`; ordinary project snapshots expose `projectDirty = dirty`;
- `hasDiscardableChanges` equals `dirty || projectDirty === true` in temporary/project/preview states;
- corrupt autosave produces `corruptAutosaveIgnored = true` independently from `message`; successful valid autosave rewrite/current commit/session change clears it, while a failed rewrite does not;
- Create is capability-invalid during Preview until Return; Open Project/Open temporary remain guarded context switches;
- temporary open clears project identity exactly as today;
- hostile/RTL/very-long `displayLabel` values remain untrusted strings and never enter source/evidence/path/confidence/DOM identifiers;
- no new identity/status state is serialized or fed into project/document/export/autosave text; exact raw-id persistence bytes compare unchanged before and after presentation;
- existing permission, repair, preview, autosave, export destination, and conflict tests remain unchanged or gain presentation-only assertions.

Deferred lifecycle harnesses make every fallible stage independently controllable:

- while Open/Create candidate validation, autosave, imports, or exports are pending, notifications expose the unchanged old session plus `lifecycleBusy`, with incompatible capabilities false;
- Open A/Open B and Open/Create complete in both orders; only the current epoch commits and no notification mixes A/B document, manifest id/name, ref/head, dirty owner, capabilities, or destination;
- Open/Enable and Open/Save complete in both orders under forced direct overlap; immutable captured tokens prevent a later document from being written through an earlier ref, and stale completion cannot mutate current session/busy/error;
- failure at each auxiliary read leaves the old complete session, selection/view/layout/filter/dirty/identity intact and produces the correct operation error;
- the atomic controller commit emits no intermediate controller/project cross-read and performs no await inside its install callback.

The discard matrix is parameterized across every capability-valid Create/Open/Open-temporary surface and outcome:

| `sessionKind` | `dirty` | `projectDirty` | Confirmation meaning |
| --- | --- | --- | --- |
| `example` / `temporary` | false | `null` | no prompt; invoke privileged action directly |
| `example` / `temporary` | true | `null` | name active-document view loss once |
| `project` | false | false | no prompt; invoke privileged action directly |
| `project` | either alias true | either alias value | name one ordinary-project layout/view loss; never duplicate the alias |
| `project-preview` | false | false | no prompt; invoke privileged action directly |
| `project-preview` | true | false | name transient Preview view loss only |
| `project-preview` | false | true | name underlying project layout/view loss only |
| `project-preview` | true | true | name both independent losses once each |

For every row, cancel proves zero picker calls and exact state/focus preservation; accepted picker cancellation/failure proves the old complete session remains; success proves one picker call in the original activation and one atomic new-session commit. Return is tested separately: it discards active Preview view changes intentionally, invokes no picker, and restores retained project view/dirty.

Table-driven tests exercise the pure shared derivation, including contradictory/transitional capability snapshots so precedence cannot erase labels:

| Simultaneous structured facts | Required compositional labels | Critical action |
| --- | --- | --- |
| project access read-only + semantic document read-only | `Project access: read-only`; `Document: read-only` | Enable when capable |
| project access editable + semantic document read-only + project dirty | `Project access: editable`; `Document: read-only`; `Unsaved project changes` | none unless a safe capability is explicitly true |
| project access read-only + project dirty + recovery | `Project access: read-only`; `Unsaved project changes`; `Recovery available` | Enable when capable |
| project access read-only + semantic document read-only + project dirty + preview + repair + recovery | all six corresponding labels | Return before Repair/Enable/Save |
| repair + project dirty + recovery, without preview | `Repair needed`; `Unsaved project changes`; `Recovery available` plus access/document facts | Repair before Enable/Save |
| project access editable + project dirty, without preview/repair | `Project access: editable`; `Unsaved project changes` | Save when capable |
| corrupt autosave + any access/document facts | `Corrupt autosave ignored` plus every other true label | unaffected by the warning |

### UI/project browser smoke

- initial no-project rail contains only Example, Create/Open, and Document actions;
- project-only and autosave actions are absent, not merely disabled;
- cancel/failure keeps rail visible, focus stable, and state unchanged;
- Create and Open success keep rail expanded and reveal collapse;
- collapse removes width; reopen restores width; focus lands on the specified control both ways;
- `aria-controls`, presentation-truthful `aria-expanded`, named regions, accessible project name plus full escaped id, labeled full expanded escape, labeled collision-aware compact token, and hidden-tab order are correct;
- expanded and compact surfaces render the same compositional labels from the table and the same Return → Repair → Enable → Save critical action;
- project access read-only and semantic document read-only remain separately named; preview shows the underlying project's dirty label when applicable;
- hostile/RTL/long names render as inert `<bdi dir="auto">` text; every escaped-id fixture renders as inert monospace `<bdi dir="ltr">` (or equivalent isolation), actual accessibility does not depend on `title`, and neither raw nor escaped strings have markup/selector/ref/path/command/persistence effects;
- recovery and corrupt-autosave status remain discoverable while collapsed without reading `message`;
- invalid temporary JSON, Save conflict, and permission denial show correct action-specific errors while global provenance/coverage/unresolved/privacy/filter/read-only banners remain visible, accessible, and geometrically unobscured in wide/narrow expanded/collapsed states;
- autosave/failure/permission/dirty/recovery/preview/repair updates preserve the identical focused rename/select element, caret/selection, typed value, type-ahead, and IME composition;
- from input, textarea, select, button/link, contenteditable, combobox/listbox/option equivalents, every F/E/C/R/S/+/-/[/] key leaves scene/viewport and filesystem/export call counts unchanged;
- Escape begins at each overlay's first control, textbox/select, and last focusable, closes only that overlay, and focuses its exact current visible opener;
- Project Rail and Explorer/Details toggle independently at wide sizes;
- compact and expanded actions exercise the same handler registry and real project-store harness paths;
- trusted activation and exact call counts cover Create/Open directory, Enable/Repair permission, Add JSON/open-file, temporary/read-only/autosave-copy save picker, and every capability-valid compact action;
- cancellation, denial, revocation, conflict, and thrown picker failures on expanded/compact valid surfaces preserve state/identity/view/dirty/selection, keep correct compact status/action and focus, and emit zero page errors.

### Renderer/interaction browser smoke

At `1680x1000`, DPR 1 and DPR 2:

- record canvas bounding box, viewport, selection, expanded ids, and a known node position with rail expanded;
- collapse/reopen and wait for the defined final rect + DPR backing + painted/interactive endpoint;
- assert the canvas gains approximately the measured rail width and no gutter remains;
- assert viewport values, selection, expansion, filters, and node position are unchanged;
- click a known node immediately using the post-reflow canvas rect;
- click a known edge, zoom, pan, and drag a node with real pointer events;
- after node and edge selection, open Details and assert expected confidence plus `.evidence` `path:line` content remains reachable;
- reopen and repeat a representative hit test;
- assert backing width/height track CSS dimensions times DPR and ink coverage remains nonzero;
- include Project Rail in unobscured-width geometry rather than subtracting only Explorer/Details;
- record p50/p95/worst across repeated collapse/reopen toggles and enforce the 100 ms endpoint budget without semantic scene/layout rederive;
- issue 20+ alternating toggles without waits, then assert final ARIA/focus/rect/backing/ink, zero orphan rAF work, and correct first node/edge click, pan, zoom, and drag;
- assert scene object identity and viewport/selection/positions/filters/dirty facts remain unchanged by chrome toggles.

### Responsive browser smoke

`1680x1000` and the `1664px` boundary:

- rail docked expanded and user-collapsible;
- Explorer/Details recognizable;
- expanded canvas `>=800px`, collapsed canvas `>900px`, height `>300px`;
- dirty-source provenance, degraded coverage, and unresolved banners remain visible and in the accessibility tree with the rail both expanded and collapsed;
- banner/control sample points pass `elementFromPoint`; maximum simultaneous statuses and long/RTL/markup-looking name/id keep every control bounding box inside the 192px rail and `rail.scrollWidth <= rail.clientWidth`, with only explicit internal vertical scrolling;
- no document overflow.

`1663px` and representative `1440px` Hybrid:

- Project is a left overlay, not a docked fourth column;
- opening Project removes/suppresses the Explorer grid column without mutating its preference, overlays the reclaimed canvas edge, and leaves Details according to its docked preference;
- closing Project restores Explorer and the exact opener/focus destination;
- hostile/max-status content remains contained in the approximately 232px overlay and banners are not physically occluded.
- explicit evidence flow at `1663px`: begin with Explorer preference open and Details docked; select an evidence-bearing edge and record its identity, confidence, and ordered `.evidence` `path:line` values;
- open Project and prove its opener reports `aria-expanded="true"`, Explorer presentation/grid column is absent and its opener truthfully reports `aria-expanded="false"` while the stored Explorer preference remains open;
- while Project overlays the reclaimed start edge, inspect still-docked Details and prove the same edge remains selected with identical confidence and identical ordered `.evidence` `path:line`;
- close Project, prove its opener reports `aria-expanded="false"`, Explorer is restored from the retained preference with `aria-expanded="true"`, selection/evidence remain identical, and focus returns to the exact visible Project opener.

`1200px` Hybrid and `1199px` Narrow boundary:

- the active-overlay transition table yields exactly one overlay and preserves all three desktop preferences in both resize directions;
- focused stable content remains focused when still presented; otherwise focus moves to the exact visible replacement toggle;
- no stale grid column/gutter or overlapping hidden tabbables remains.

`1024x768`:

- no-project start content inline before map controls;
- project rail opens as one overlay, canvas retains essentially full CSS width;
- Project/Explorer/Details follow the Narrow exclusive overlay state without altering desktop preferences;
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

Across `1199`, `1200`, `1663`, `1664`, `1680`, `1024`, and `800`, rapid oscillating resize plus project-id/null-project transitions are replayed against every active overlay. The final band/table state, independent preferences, selection, view, layout, filters, dirty facts, identity, focus, and opener must be deterministic.

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
- `project-rail-hybrid-1663-explorer-suppressed`;
- `project-rail-boundary-1664-docked`;
- `project-rail-action-error-with-trust-banners`;
- `project-rail-inline-1024x768`;
- `project-rail-inline-800x800`;
- `project-rail-overlay-800x800`.

Canonical documentation captures are updated only with `npm run update:screenshots`, reviewed as an explicit diff, and never rewritten by `npm run verify`.

Evidence accompanying the final review must include:

- before/after bounding boxes and measured reclaimed width;
- before/after serialized viewport values and selection;
- lifecycle notification traces for opposite-order A/B candidates proving one complete session per observation;
- discard-matrix confirmation copy, trusted-activation state, picker/write call counts, and cancel/failure/success snapshots;
- escaped-identity fixture outputs, compared compact-token ASCII/difference assertions, full associated accessible descriptions, inert DOM proof, non-use boundary checks, and unchanged raw persistence bytes;
- ARIA/focus assertions rather than screenshots alone;
- identical form-element/caret/value/composition evidence across autosave and failure notifications;
- real pointer success after both transitions;
- compositional access/document/dirty/preview/repair/recovery status assertions and underlying `projectDirty` during preview;
- action-specific errors coexisting with dirty-source, coverage, unresolved, privacy/filter/read-only banners, plus accessibility and `elementFromPoint` geometry at wide/narrow states;
- post-reflow Details evidence showing expected confidence and `.evidence` `path:line` after the Narrow rail closes;
- the `1663px` Hybrid edge-selection trace across Project open/close, including retained Explorer preference versus truthful presentation `aria-expanded`, docked Details, identical confidence/evidence, restored Explorer, and exact focus;
- console/page-error collection;
- DPR 1/2 p50/p95/worst timing through final painted/interactive collapse/reopen state plus 20+ rapid-toggle final evidence;
- transition traces at 1199/1200/1663/1664 and canonical 1680/1024/800 showing independent preferences, active overlay, opener/focus, project-id/null-project transitions;
- responsive unobscured-width, rail/control containment, internal-overflow, banner-occlusion, and hostile/RTL/maximum-status measurements.

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
- Project access mode and semantic document read-only are independent axes and are easy to mislabel in compact space; neither claims observed filesystem permission.
- Repair, preview, recovery, permission revocation, project dirty, active-document dirty, and corrupt-autosave changes can arrive while the rail is collapsed; every transition must update all applicable accessible labels.
- Untrusted project/file names can be long, RTL, or markup-looking and require inert auto-direction isolation. Raw project ids may contain default-ignorables, bidi/control units, surrogates, backslashes, or markup-looking ASCII; only the injective escaped form may discriminate visibly/accessibly, with LTR monospace isolation, atom-safe abbreviation, associated full accessibility, and inert text construction. Showing it improves cognitive identity but exposes a project-local identifier.
- Concatenated `message` copy is not structured state; adding another project warning without a narrow field must not tempt the UI to parse it or trigger a generic-notification rewrite.
- The atomic loaded-state install primitive is safety-critical: any notification inside its install callback would recreate the document/project cross-read race.
- Epoch guards prevent stale UI commits, but forced overlapping privileged operations may still complete against their immutable captured project; tests must distinguish a safe old-project write from a forbidden cross-project write.
- Discard confirmation must remain synchronous to preserve activation; replacing it with an awaited custom modal would reopen both data-loss and picker-activation findings.
- Hybrid suppression/restoration and three independent preferences add focus/state complexity; the single-overlay transition table is mandatory and must not devolve into booleans.
- Moving the canvas's page origin exposes hit-test code that accidentally caches DOM geometry; current Canvas2D reads a fresh rect, but browser proof is mandatory.
- Reconstructing rail DOM on any project notification destroys focus safety. Stable mounted elements plus keyed/conditional patches are mandatory.
- Create/Open must still invoke directory pickers directly from a trusted click. A disclosure/menu must not insert awaited work before the picker.
- The no-animation choice may feel abrupt; motion is deferred until it can be measured without compromising resize correctness or reduced-motion support.

## Constructive decision record

Round-2 transverse decisions received support from all three constructive agents:

1. UI-facing structured session identity (`example | temporary | project | project-preview`) plus untrusted `displayLabel` in `ProjectControllerState`, with no canonical schema effect.
2. Two-mode desktop canvas budget: `>=800px` while the selected rail is expanded and `>900px` after collapse at 1680.
3. Separate rail docking threshold with inline no-project content and one overlay project drawer at 1024/800.
4. Mounted-only rail preference, reset expanded on reload; `sessionStorage` deferred.
5. Compact critical-action precedence: Return, Repair, Enable editing, Save; recovery is visible but opens the rail.

Current record:

- Graph/runtime owner: `SUPPORT` on all five decisions. The proposal preserves port/domain boundaries and makes the selected product tradeoff measurable.
- Core lead: `SUPPORT` on all five decisions in constructive round 1.
- Extraction/evidence owner: `SUPPORT` on all five decisions with no P0/P1 dissent, conditional clarifications incorporated in this round-2 plan for untrusted identity, global banners, compositional status, and evidence reachability.

Historical round-2 gate: `SATISFIED_3_OF_3`.

Round-3 transverse refinements presented for review:

1. expose project name plus a compact visible/full accessible canonical manifest `project.id`, without root paths or new persistence;
2. replace the 1440 proposal with Wide `>=1664`, Hybrid `1200..1663`, and Narrow `<1200`, including temporary Explorer suppression in Hybrid and retained Details/evidence reachability.

Round-3 constructive record against `cf1a83075156deea1f531cbf93c1fbcf7d3287ed`:

- Graph/runtime owner: `SUPPORT` for both refinements.
- Core lead: prior `SUPPORT` through the coordinator dispositions selecting manifest id and the three-band model.
- Extraction/evidence owner: responsive/evidence refinement `SUPPORT`; identity refinement `DISSENT` on one P1 because distinct contract-valid ids containing default-ignorable code units could render identically even when the raw substring was fully expanded.

The responsive/evidence choice remains accepted. The dissented raw-Unicode identity choice is superseded—not waived—by the binding core representation in this revision. The three-round limit was reached, so the core lead arbitrated the remaining valid plan choice rather than opening a fourth design round.

## Independent premortem and arbitration record

Round-3 reports against `cf1a83075156deea1f531cbf93c1fbcf7d3287ed`:

- resilience final report: `NO_BLOCKING_PREMORTEM_FINDINGS`; all prior RES findings were cleared or superseded at plan level;
- semantic final report: six prior findings cleared; `SEM-P1-05` remained; final verdict `BLOCKING_PREMORTEM_FINDINGS`;
- extraction and semantic independently reproduced the same accepted P1: distinct contract-valid ids containing default-ignorable code units can render identically even with the raw differing substring fully expanded.

Semantic dispositions:

- `SEM-P1-01` lifecycle A/B mismatch: `CLEARED_BY_SEMANTIC_ROUND_3` through old-session visibility, local candidates, synchronous aggregate commit, busy/capability state, epoch/session tokens, and opposite-order tests.
- `SEM-P1-02` Preview hides dirty-project discard risk: `CLEARED_BY_SEMANTIC_ROUND_3` through authoritative `hasDiscardableChanges`, loss-specific synchronous confirmation, cancel/failure/success tests, and explicit Return semantics. Core clarification now also deduplicates ordinary-project aliases by session kind.
- `SEM-P1-03` false filesystem-permission label: `CLEARED_BY_SEMANTIC_ROUND_3` through truthful `Project access` copy and the filesystem permission no-change boundary.
- `SEM-P1-04` failures erase/mislabel trust banners: `CLEARED_BY_SEMANTIC_ROUND_3` through separate action-error state/host, operation-specific copy, coexistence/geometry/accessibility tests, and no `bannerHost.clear()` from errors.
- `SEM-P2-01` corrupt-autosave status can stale: `CLEARED_BY_SEMANTIC_ROUND_3` through current-condition lifetime and successful rewrite/commit/session-clear tests.
- `SEM-P2-02` Create-from-Preview contradicts capabilities: `CLEARED_BY_SEMANTIC_ROUND_3`; Create remains absent until Return, while guarded Open Project/Open temporary remain available.
- `SEM-P1-05` same-name projects lack reliable identity: `CLOSED_BY_BINDING_CORE_ARBITRATION_NOT_WAIVED`. The core lead accepted the reproduced P1 and replaced raw-Unicode discrimination with the injective exact-UTF-16 ASCII escape, atom-safe collision token, full visible expanded escape, full associated accessibility, inert LTR/monospace rendering, and unchanged raw/no-key/no-path/no-persistence boundaries specified above.

Resilience's plan-level clear does not remove its residual executable-gate conditions. Each remains mandatory after any implementation-readiness authorization:

- `RES-P1-1` retains real UI/FSA discard-copy, trusted-activation, call-count, and exact cancel/failure/state-preservation tests, including session-kind deduplication.
- `RES-P1-2` retains stable mounted DOM, caret/type-ahead/IME preservation, full interaction-target suppression, Escape-first handling, and asynchronous-notification tests.
- `RES-P2-1` retains independent preferences, exactly one active overlay, exhaustive transitions, exact opener focus, project/null transitions, and rapid boundary-resize tests.
- `RES-P2 hybrid-band decision` retains the 1664/1200 model, Explorer suppression without preference mutation, plus the explicit 1663 edge/confidence/evidence/Details/restoration/focus/`aria-expanded` flow.
- `RES-P2-2` retains final rect/backing/paint/interaction endpoints, p50/p95/worst reporting, rAF coalescing/destroy cleanup, 20+ rapid toggles, and immediate pointer proof.
- `RES-P2-3` retains DPR 2, rail-aware unobscured geometry, `elementFromPoint`, rail/control containment, and hostile/max-status cases.
- `RES-P2-4` retains trusted activation/call counts for every listed picker/permission/compact action and injected cancel/denial/revocation/conflict/throw paths.
- `RES-P2-5` retains Escape tests from first, textbox-or-select, and last controls in each overlay, ending at the exact visible opener across breakpoints.

Binding core disposition: the identity P1 is valid, accepted, and closed in the RFC by arbitration; it is not accepted risk and not a waiver. Neither the binding plan closure nor implementation readiness replaces either red team's independent final executable gate.

Core-conformance record: the core lead inspected exact plan commit `c2f45f893c03df6f456240362c22ae38ee977312`, including its one-file diff, tracked status, UTF-16 escape/atom identity closure, session-kind discard deduplication, explicit `1663px` evidence flow, report dispositions, and retained executable gates. The decision `Issue #7 — READY_FOR_IMPLEMENTATION` issued on 2026-07-14 authorizes this artifact owner to implement the approved RFC on `feature/7-collapsible-project-rail` within the allowed artifact list and no-change boundaries. It does not authorize push, PR, merge, boundary expansion, or gate-final status.

Readiness verdict: `READY_FOR_IMPLEMENTATION`. Implementation is in progress; core review and both independent executable red-team gates remain required before completion.

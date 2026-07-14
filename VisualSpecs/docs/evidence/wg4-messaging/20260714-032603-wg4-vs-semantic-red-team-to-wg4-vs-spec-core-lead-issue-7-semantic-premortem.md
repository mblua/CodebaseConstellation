# Issue #7 — independent semantic premortem, round 1

Initial verdict: `BLOCKING_PREMORTEM_FINDINGS`

Frozen input: `38964c1396e6707bcacd283fadf4523b1cb7d68c` (`HEAD` exactly), branch `feature/7-collapsible-project-rail`.

I did not seek, read, or use the resilience red-team report. No production file was edited. The repository remains unchanged apart from the pre-existing untracked `CodebaseGuide/` directory named in the plan.

## Inspected artifacts

- `plan/7-collapsible-project-rail.md` in full, including the requested state, application identity/status proposal, P1 invariants, focused tests, no-change boundaries, and known risks.
- `VisualSpecs/src/app/projectController.ts`, especially snapshot derivation, create/open/enable/repair/save, preview/return, temporary load, autosave, permission degradation, and `loadProjectSnapshot()`.
- `VisualSpecs/src/ui/app.ts`, especially context-switch handlers, `confirmDestructive()`, `runProjectAction()`, `reportLoadError()`, `renderBanners()`, and `renderProjectState()`.
- `VisualSpecs/src/main.ts`, `src/app/state.ts`, `src/ports/projectStore.ts`, `src/adapters/filesystem/FsaProjectStore.ts`, `src/contract/projectManifest.ts`, and `src/contract/autosaveView.ts`.
- `VisualSpecs/tests/app/projectController.test.ts`, `tests/smoke/projectUi.spec.ts`, `tests/smoke/acceptance.spec.ts`, `tests/contract/projectStorage.test.ts`, the canonical dataset, README, and architecture notes.

Focused baseline: `npm test -- tests/app/projectController.test.ts` passes all 30 tests. That green suite does not cover the counterexamples below.

## Blocking findings

### SEM-P1-01 — lifecycle operations can pair Project A with document B and then write B into A

Severity: **P1, blocking**.

Minimal reproducible case:

1. Make Project A's `listStoredDocs()` calls deferred.
2. Start `openProject(A)`. `loadProjectSnapshot()` replaces the active controller document with A before awaiting those lists.
3. While A is still pending, complete `openProject(B)`.
4. Resolve A's deferred lists last.
5. Enable editing and Save the state now presented as A.

Deterministic harness output against the frozen production modules:

```text
OPEN_A_IN_FLIGHT {"graph":"A","projectName":"","phase":"temporary"}
OPEN_B_COMPLETE {"graph":"B","projectName":"Project B"}
STALE_A_COMPLETES {"graph":"B","projectName":"Project A","projectKey":"ref-A"}
CROSS_PROJECT_WRITE {"destination":"ref-A","writtenNode":"B"}
```

Evidence in production code:

- `projectController.ts:609-615` calls `controller.replaceLoaded()`.
- Only afterward, `:616-619` awaits import/export enumeration.
- Only afterward, `:620-642` installs project/session state and clears dirty.
- There is no lifecycle operation epoch, mutex, busy capability, or stale-completion check.
- `app.ts:187-195,337-346` permits another lifecycle action while the first promise is pending.
- Once desynchronized, `projectController.ts:315-337` combines the stale Project A ref/head with `controller.exportText()` from graph B.

Violated approved criteria:

- truthful and stable project/session identity;
- plan P1 that collapsed state exposes the actual project identity/state;
- plan P1 that project/filesystem commands preserve safe-open, freshness, conflict, and write behavior;
- the no-semantic-change claim for project persistence.

Impact: the rail can truthfully render neither the active document nor the write destination. A subsequent valid Save backs up A and then writes B as A's current document. The backup makes recovery possible but does not make a wrong-project write acceptable.

Required plan change:

- Define an atomic lifecycle transition boundary. Gather fallible auxiliary reads before mutating the active controller, then commit document + project ref/head + `sessionKind` + labels + dirty/warnings in one non-awaiting section.
- Serialize mutually destructive lifecycle operations or add monotonically increasing operation epochs so stale completions cannot commit.
- Expose a pending/busy capability that prevents a second action from using half-transitioned state without inserting work before the trusted picker call.
- Add deterministic opposite-completion tests for Open A/Open B, Open/Create, Open/Enable, and Open/Save. At every observable point, manifest project id/ref, displayed identity, active document, dirty owner, and write destination must belong to the same session.

### SEM-P1-02 — preview hides the dirty project from the existing destructive guard

Severity: **P1, blocking**.

Minimal reproducible case:

1. Open an editable project and alter its viewport (`dirty === true`).
2. Preview an export/import copy.
3. Click Open JSON temporarily, Open Project, or Create Project.

Deterministic output:

```text
PREVIEW_DIRTY_GUARD {"dirtyBeforePreview":true,"dirtySeenByExistingConfirmDuringPreview":false,"previewing":true,"phaseAfterContextSwitch":"temporary","canReturnAfterContextSwitch":false}
```

Evidence:

- `projectController.ts:645-657` saves the underlying dirty fact in `previewReturn.dirty` and then sets active `dirty = false`.
- `app.ts:249-251` prompts only when `currentProjectState.dirty` is true.
- A successful temporary/project transition clears `previewReturn`, so the underlying unsaved view cannot be returned to.
- The plan adds `projectDirty = previewReturn?.dirty ?? dirty`, but lines 96 and 110 merely say to retain/share the existing dirty guard; the focused tests do not exercise any context switch from dirty preview state.

Violated criteria: retained dirty confirmation, preview's independent underlying `projectDirty`, safe context switching, and the P1 prohibition on presenting a dirty project as clean.

Impact: a dirty project's unsaved layout/view can be discarded with no confirmation precisely in the new state where compact UI is supposed to expose it safely.

Required plan change:

- Define one controller/application-level `hasDiscardableChanges` fact, at minimum `dirty || projectDirty === true`, and make every expanded/compact context-switch handler consume it.
- Specify the separate semantics of active preview edits: after a user changes the preview view, does Return intentionally discard them, warn, or offer export? Do not silently alias that fact to underlying project dirty.
- Add table/browser tests for Create/Open/Open-temporary from all four combinations of active preview dirty and underlying project dirty, including cancel/failure/success.

### SEM-P1-03 — `Project permission` is not a fact the current port observes

Severity: **P1, blocking**.

Minimal reproducible case:

1. A directory handle already has `readwrite` permission granted.
2. Open it through `openProjectRead()`.
3. The adapter unconditionally returns `access: 'readonly'`; the proposed presentation renders `Project permission: read-only`.

Evidence:

- `projectStore.ts:24-29` exposes an access mode, not a permission observation. Its architecture documentation also calls this the project access mode.
- `FsaProjectStore.ts:75-86` opens with mode `read` and stores/returns `readonly` without querying readwrite permission.
- `FsaProjectStore.ts:90-103` separately requests readwrite only on Enable editing.
- `projectController.ts:623-631` also forces `access = readonly` for repair even if an adapter snapshot says readwrite.
- The plan nevertheless maps this axis to the fixed labels `Project permission: read-only/editable` and calls them independent facts.

Violated criterion: the P1 conjunctive-status invariant requires every label to be true and not fabricate mutually exclusive source states.

Impact: compact and expanded UI conflate at least three independent conditions: actual filesystem permission, application editing/access mode, and the repair interlock. `Document: read-only` is a fourth, correctly separate semantic axis. A user cannot infer whether permission was denied/revoked, merely not requested, or intentionally suppressed for repair.

Required plan change: either relabel the existing fact as `Project access mode: read-only/editable` (or equivalent truthful copy), or explicitly broaden the port/adapter to observe an actual `PermissionStateLike`. The latter reopens the stated no-change boundary and requires a product/architecture decision; deriving a permission label from `access` is not acceptable.

### SEM-P1-04 — any project/import failure removes global trust evidence and mislabels the operation

Severity: **P1, blocking**.

Minimal browser reproduction against the already-running frozen tree:

1. Boot the canonical AgentsCommander document. It has one degraded coverage banner and unresolved-relation content.
2. Feed invalid JSON to the temporary input, or trigger a Save conflict/permission failure.
3. Observe the stable `bannerHost` after `reportLoadError()`.

Measured result:

```text
GLOBAL_BANNERS_AFTER_FAILURE {
  "before":{"coverage":1,"unresolved":2},
  "after":{"coverage":0,"unresolved":0,
           "error":"This document was refused.\nThe file is not valid JSON: ..."}
}
```

Evidence:

- `app.ts:467-557` derives global dirty-source, coverage, unresolved, semantic-read-only, privacy/validation, refresh-loss, and filter banners into `bannerHost`.
- `app.ts:320-334` clears that same host and appends only an error.
- `app.ts:337-346` routes every non-cancellation project action error through that document-import reporter. Thus a Save conflict is also announced as `This document was refused` / `Import failed`.
- No controller change follows a failed action, so the trust banners can remain absent indefinitely.

Violated criteria: plan line 114 says cancellation/failure leaves presentation unchanged; P1 says global trust/evidence banners remain outside the rail, visible, and accessible in every rail state; project-scoped failures must remain distinct from document trust/validation facts.

Impact: after the first error, users and assistive technology lose the warning that extraction coverage is degraded and relations are unresolved, while receiving a false account of which operation failed.

Required plan change:

- Give transient/action errors a separate host/state, or render them compositionally alongside re-derived global trust banners; never clear global facts to report an action outcome.
- Use action-specific error copy/semantics for Open, Create, Save, permission, conflict, and document validation without introducing message parsing.
- Add wide/narrow, expanded/collapsed tests showing coverage/unresolved/provenance remain visible after invalid temporary input, save conflict, and permission denial.

### SEM-P1-05 — a non-unique display name does not satisfy the promised project identity

Severity: **P1, blocking; genuine product decision required**.

Minimal reproducible case:

1. Create Project A and Project B with distinct canonical `project.id` values and different documents, but the same valid `project.name = "Acme"`.
2. Open A, collapse, then open B.
3. Both specified compact/expanded identity surfaces expose the same full project name/display label. No specified visible value distinguishes the selected write target.

Evidence:

- `projectManifest.ts:81-86` validates only that the name is trimmed and 1..120 characters; it is neither unique nor immutable. The manifest already has a separate stable `project.id`.
- The plan specifies only the full project name and a `displayLabel` expressly described as presentation-only.
- `projectKey` is not a stable project identity: `FsaProjectStore.ts:303-317` creates an ephemeral `fsa-${nextId++}` per open, and the plan does not expose it.

Violated criterion: the P1 requirement that collapsed project state expose project identity, and the requested expansion after a new project so its identity becomes explicit.

Impact: two valid projects are observationally indistinguishable in the new safety chrome. After a picker, reload, same-name transition, or concurrent-operation recovery, the user cannot verify which directory future commands target.

Required decision: choose and document a privacy-safe visible discriminator (for example manifest name plus a short canonical project-id suffix, or a separately labeled selected-root display name), or explicitly weaken the accepted requirement from project identity to a non-unique label. The discriminator remains presentation-only and must never be used as the command key or leak into portable/project/autosave/export bytes.

## Non-blocking findings

### SEM-P2-01 — corrupt-autosave status lifetime is underspecified and can become stale

`projectController.ts:592-606` latches the corrupt warning. Save/import/restore clear it, but a successful `flushAutosave()` at `:696-719` overwrites the corrupt file with valid content without clearing the warning. If `corruptAutosaveIgnored` means current condition, it becomes false copy; if it means historical event, its lifetime/acknowledgment must be specified. Add the successful-autosave-rewrite transition to the table and tests.

### SEM-P2-02 — Create-from-preview contradicts the claimed capability authority

The plan says Create/Open/Open-temporary remain available in preview and that surfaces use existing capabilities. Current `canCreateProject` is false while previewing (`projectController.ts:138-140`). Calling `createProject()` directly from preview would create the new project from the active preview document, not the underlying project. Specify whether Create is absent until Return or is an explicit “create from preview” operation, then align capability, label, dirty guard, and tests.

## Required plan changes before implementation

1. Add an atomic/serialized lifecycle and stale-completion contract with adversarial ordering tests.
2. Replace the active-only dirty confirmation with one authoritative discard-risk fact covering underlying project dirty during preview; decide active-preview-edit behavior.
3. Rename access-mode labels or explicitly model real filesystem permission.
4. Separate global trust facts from transient/action errors and test their coexistence after failures.
5. Resolve the same-name project identity decision with a visible, privacy-safe discriminator or formally weaken the identity criterion.
6. Define corrupt-autosave status lifetime and preview Create semantics.

At least items 1–5 are unresolved P1 findings. The frozen plan remains `NOT_READY_FOR_IMPLEMENTATION`; production work must not start under its own gate until a revised plan closes them with executable tests.

Genuine product decision needed: **yes**, for what the UI must expose to distinguish two same-name projects. A second explicit choice is needed if Create is to remain available during preview (clone preview versus require Return).

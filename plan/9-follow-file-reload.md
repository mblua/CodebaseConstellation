# Plan #9 (graph-runtime lane): follow-file auto-reload for imported datasets

Status: `RFC_UNDER_REVIEW` — implementation is blocked until vs-spec-core-lead emits `READY_FOR_IMPLEMENTATION` after both independent premortems.

Issue: <https://github.com/mblua/VisualSpecs/issues/9> (artifact 2 of 2)

Artifact owner: `vs-graph-runtime-dev`

Delivery path: Full (RFC → independent premortems → implementation → adversarial gates).

Sibling artifact: extractor `--watch` multi-repo (owner `vs-extraction-evidence-dev`, `tools/extractor/` only). Cross-artifact contract: the extractor writes outputs atomically (temp + rename). This plan does NOT rely on that atomicity for correctness — torn or invalid reads must be survivable regardless, because the user's editor and other tools also write these files.

## Situation before the change

At branch point `a3e4f55` (main), the app has no way to notice that an imported dataset changed on disk:

- The UI's "Open JSON temporarily" button always routes through a hidden `<input type=file>` (`VisualSpecs/src/ui/app.ts:571-574` → `fileInput.click()`), which yields a one-shot `File` snapshot. No FSA handle exists on this path, so nothing can be re-read later.
- `ProjectController.openTemporaryPicked()` (`VisualSpecs/src/app/projectController.ts:581`) already exists and uses the FSA picker via the port, but no UI element calls it.
- `FsaProjectStore.pickExternalJson()` (`VisualSpecs/src/adapters/filesystem/FsaProjectStore.ts:232-251`) obtains a `FileSystemFileHandle`, immediately calls `getFile()` once, and drops the handle. The returned `PickedTextSource.readText` re-reads the same stale `File` snapshot, so even the picker path cannot observe later disk changes.
- The reload semantics already exist and are tested: `refresh(text, previous)` in `VisualSpecs/src/contract/load.ts:121` re-parses through `importDoc` (one validation path), carries the user's layout across by node id, and returns a `LossReport`. `Controller.refreshText()` (`VisualSpecs/src/app/controller.ts:167`) dispatches it, and the UI already renders a "Refreshed." banner from `state.loss` (`VisualSpecs/src/ui/app.ts:1166-1177`). Nothing invokes this from any file-change source today.
- The architecture test (`VisualSpecs/tests/architecture/boundaries.test.ts`) enforces: FSA/picker/IDB identifiers (`/^FileSystem/`, `showOpenFilePicker`, …) only in `adapters/filesystem/`; `ports/` imports nothing; only composition roots import concrete adapters; no network primitive anywhere (§11).
- The bundled dataset (`data/agentscommander.json?raw` in `VisualSpecs/src/main.ts`) reloads under `npm run dev` through Vite HMR/full-reload. That case needs evidence only, not code.

Consequence: with the sibling `--watch` extractor running, the page still shows stale data until the user manually re-picks the file.

## Requested and expected after state

Human intent (issue #9): a dataset opened via the FSA picker follows its file — when the extractor (or anything else) rewrites it, the page revalidates and reloads it automatically, keeping the user's layout, without re-prompting for permission, without network, and without ever replacing good state with invalid content.

Expected state after implementation:

1. "Open JSON temporarily" uses the FSA picker when the browser supports it (`canOpenTemporaryJson`), falling back to the existing `<input type=file>` path otherwise. Only the picker path can follow; the fallback keeps today's exact behavior.
2. While a picker-opened temporary session is active, the adapter polls the retained handle. A detected content change is re-ingested through `refresh()` → `importDoc` — the standard validation path, no second ingestion route — and installed with layout carried over and the loss report shown.
3. Invalid, torn, or oversized content never replaces the last good state; a non-blocking warning is shown and following continues (the next good write reloads normally).
4. The UI shows that following is active and that a reload happened (project-message line + existing "Refreshed." banner).
5. Re-reads never re-prompt: the read permission granted by the picker is reused for the session's lifetime.
6. Everything works on a static build (`vite build` + `preview`): the mechanism is FSA polling, not HMR.
7. The architecture test passes unchanged.

## Scope

In scope: temporary sessions opened through the FSA picker. Out of scope, deliberately:

- Project sessions (`.visual-specs/`): they have their own freshness machinery (`assertFresh`, per-project queue, Repair). Auto-following `current.json` interacts with autosave and conflict semantics and is a separate decision for a separate issue.
- Project imports (`Add JSON` copies the file into `imports/`; the copy is by design decoupled from its source).
- The `<input type=file>` fallback (no handle exists; capability honestly absent).
- The bundled-dataset dev case (Vite already covers it; evidence only).
- Extractor changes (`tools/extractor/` belongs to the sibling artifact).

## Port design (exact surface)

`VisualSpecs/src/ports/projectStore.ts` — extend `PickedTextSource` with an optional follow capability. No FSA names, no DOM types, no imports (ports stay leaf):

```ts
/** One delivered re-read of a followed source. */
export interface FollowedRead {
  text: string;
  /** File modification time, ms since epoch, for display only. */
  modifiedAt: number;
}

export interface FollowOptions {
  /** Bound for each fresh read; larger content is an error, not a delivery. */
  maxBytes: number;
  /** Fresh content after each detected change. Never called with unchanged text. */
  onChange(read: FollowedRead): void;
  /** Following stopped permanently (permission revoked, file gone, repeated failures). */
  onEnded(reason: string): void;
}

export interface PickedTextSource {
  sourceName: string;
  sizeBytes: number;
  readText(maxBytes: number): Promise<string>;
  /**
   * Present only when the source can be re-read without re-prompting.
   * Starts change detection; returns a stop function. At most one active
   * follow per source. Absent on snapshot-only sources (input-element fallback).
   */
  follow?(options: FollowOptions): () => void;
}
```

The app learns "this source can be followed" from the presence of `follow`, nothing else. `DownloadStore` and the input-element source simply omit it.

## Adapter behavior (`adapters/filesystem/` only)

`FsaProjectStore.pickExternalJson()` retains the handle in the closure:

- `readText` re-reads via `handle.getFile()` on every call (fresh bytes, fresh size check against `maxBytes`). Existing callers read immediately after picking, so behavior is preserved while the staleness bug disappears.
- `follow(options)` starts a polling loop owned entirely by the adapter (timers stay out of `app/` for this feature, per the standing decoupling directive):
  - **Tick**: every 1000 ms, `handle.getFile()` and compare `lastModified` + `size` against the last delivered baseline. Unchanged metadata → done; the tick costs one metadata promise, no read, no allocation beyond the `File` object.
  - **Change candidate**: bounded text read; if the text equals the last delivered text (metadata-only churn, e.g. touch), update the baseline silently; otherwise deliver `onChange({ text, modifiedAt })` and advance the baseline.
  - **Baseline**: initialized from the open-time read, so `follow` never re-delivers the content the session already shows.
  - **Visibility**: polling pauses while `document.visibilityState === 'hidden'` and re-checks immediately on becoming visible (adapter layer may touch `document`; the arch test restricts it only in pure layers).
  - **Transient failures** (e.g. `NotFoundError` during an editor's delete-then-create save, intermittent I/O): tolerated up to 5 consecutive ticks, then `onEnded('…')`. A success resets the counter.
  - **Permanent failures**: `NotAllowedError` is confirmed before ending. The adapter queries the handle's read permission; only a non-granted answer ends following with `onEnded` (a `prompt` answer also ends it — re-prompting without a user gesture is impossible and forbidden by requirement 5). A still-granted answer means the error was a misclassified transient (e.g. a replace-window collision reported as `NotAllowedError` by some builds) and it counts against the transient budget instead. If the permission query itself is unavailable or throws, the transient budget applies — a real revocation then ends within 5 ticks anyway.
  - **Stop**: the returned function cancels the timer and listeners idempotently; `onChange`/`onEnded` are never invoked after stop returns.

Oversized content (over `maxBytes`) counts as an invalid read: it is reported through the same non-blocking path and never delivered as a reload.

## App and UI wiring (minimal)

`ProjectController` (`app/`):

- After a successful `readTemporarySource` from a source with `follow`, start following. Keep `stopFollow` and the source; capture the session epoch.
- **Fencing**: every `onChange`/`onEnded` callback first checks the captured session epoch and `project === null && previewReturn === null`. Stale → self-stop, discard. Additionally, every path that installs a different session (`loadTemporaryLoaded`, `commitProjectCandidate`, `beginProjectPreview`) explicitly stops the active follow, so the timer dies promptly rather than merely being fenced.
- **Reload**: on a current `onChange`, call `controller.refreshText(text)` inside try/catch. `refresh` → `importDoc` is the single validation path; layout, search and filters carry over (existing `Refresh` command semantics); the loss banner appears. Set the message to `Reloaded <name> from disk (<HH:MM:SS>).` and notify.
- **Busy overlap**: if `lifecycleBusy` when a change arrives, park the latest text in a single pending slot and apply it when the operation settles (last-writer-wins, applied only if the session is still current). A reload is never dropped and never interleaves with a foreground lifecycle operation.
- **Invalid content**: catch from `refreshText`, keep state untouched, set a non-blocking warning message `Auto-reload skipped: <name> changed on disk but is invalid or mid-write. Keeping the last good state. (<error>)`, keep following. The next successful reload clears it.
- **Ended**: surface `Stopped following <name>: <reason>. The last good state is kept.` and drop the subscription.
- **Dirty**: unchanged policy. The dirty flag keeps meaning "the view changed since baseline"; a reload that preserves the user's layout does not force it either way.
- `ProjectControllerState` gains `followingLabel: string | null` (e.g. `Following dataset.json — reloads on change`) so the UI renders follow status without knowing why.

`ui/app.ts`:

- `openTemporary` handler: when the snapshot says the picker path is available, call `projectController.openTemporaryPicked()` through the existing `runProjectAction`; otherwise `fileInput.click()` as today. (Picker-under-user-activation precedent: `addJsonToProject` already awaits `pickExternalJson` inside `runProjectAction`.)
- Render `followingLabel` in the project status line. The reload banner already exists.

No changes in `contract/`, `domain/`, `projection/`, renderer code, or the extractor.

## Decisions and what they trade away

### Polling `getFile()` rather than `FileSystemObserver`

`FileSystemObserver` is not yet dependable across the supported engine range, and a wrong-negative watcher is worse than a 1 s poll. Polling is boring, testable, and its cost is one metadata call per second per followed file (exactly one file can be followed at a time — a temporary session has one source). Trade-away: up to ~1 s of extra latency and a trickle of background work; both fit the interaction budget. The port surface does not name the mechanism, so an observer-based adapter can replace the loop later without touching `app/`.

### Reload through `refresh()`, not raw `importDoc` replace

Requirement 1 demands the standard validation path; `refresh` IS `importDoc` plus the documented layout carry-over and loss report (§3.5 "import is not refresh"). A raw replace would obliterate the user's positions on every extractor rewrite, which contradicts the mission (edit without losing orientation). Trade-away: reload keeps the session's viewport rather than re-fitting; new nodes may appear off-screen. The loss banner counts them, and Fit is one key away.

### Follow capability on `PickedTextSource`, not a store-level watch registry

The thing being followed is the picked source; tying `follow` to it makes lifetime obvious (source dropped ⇒ follow dead) and keeps `ProjectStore` free of handle-registry state and id plumbing. Trade-away: following N files needs N sources — fine, sessions have exactly one.

### Optional member instead of a new port method pair

`follow?` on the source expresses per-source capability honestly (picker source: yes; input fallback: no) without a store-wide capability flag that would be a lie for half the sources. Trade-away: optionality must be checked at the call site — one `if`.

### Picker-first temporary open, input fallback kept

Following requires a handle, so the default open path must produce one where the platform allows. Keeping the input fallback preserves Firefox/Safari behavior exactly. Trade-away: two open paths remain in the UI handler (they already existed in the controller; this only re-points the button).

### Pause when hidden

A background tab re-rendering a large graph on every extractor cycle wastes battery for nobody. On return, the immediate check makes the tab current within one tick. Trade-away: a hidden tab is stale until refocused — which is indistinguishable from today's behavior while hidden.

## Invariants and severity

- P0: no network primitive is introduced anywhere in runtime sources; the §11 architecture test passes unchanged.
- P0: invalid, torn, or oversized content NEVER replaces the last good state — at any write timing, atomic or not.
- P1: FSA names, pickers, and the polling timer appear only in `adapters/filesystem/`; `ports/` gains no platform identifier; `domain/`/`projection/` are untouched.
- P1: every reload is ingested through `importDoc` (via `refresh`); there is no second parse/validation path.
- P1: a reload never re-prompts for permission and never fires for a session that is no longer current (epoch fence + explicit stop).
- P1: a reload never interleaves with a running lifecycle operation; the pending slot applies at most the latest text once the operation settles.
- P2: reload preserves the user's positions/expansion for surviving ids and reports drops (loss banner); search and filters carry over.
- P2: the UI states that following is active and when a reload happened; warnings are non-blocking.
- P2: polling stops (not merely idles) when the session changes or following ends; no timer leaks across sessions.
- P2: a hidden tab does not poll; a refocused tab catches up within one tick.

## Allowed artifacts

- `VisualSpecs/src/ports/projectStore.ts`
- `VisualSpecs/src/adapters/filesystem/FsaProjectStore.ts`
- `VisualSpecs/src/app/projectController.ts`
- `VisualSpecs/src/ui/app.ts`
- `VisualSpecs/tests/app/projectController.test.ts` (fake followable sources)
- `VisualSpecs/tests/smoke/followFile.spec.ts` (new; real adapter over OPFS + stubbed picker, following `projectUi.spec.ts` precedent)
- `plan/9-follow-file-reload.md` (this file)

Out of scope: `tools/extractor/`, `contract/`, `domain/`, `projection/`, renderer adapters, `tests/architecture/boundaries.test.ts` (must pass as-is), CI/workflow files.

## Implementation sequence

1. Port types (`FollowedRead`, `FollowOptions`, optional `follow`) — compile-only change, no adapter yet.
2. Adapter: retained handle, fresh `readText`, polling `follow` with baseline/visibility/failure policy. Unit-testable pieces factored so the smoke test can drive them over OPFS.
3. `ProjectController`: follow lifecycle, fencing, pending slot, reload/warning/ended messages, `followingLabel`.
4. UI: picker-first `openTemporary`, follow status line.
5. Tests (vitest + new smoke spec), then `npm run verify` (test, typecheck, build, both smoke projects).
6. Static-build and bundled-HMR evidence runs (below), attached to the issue.

## Verification matrix

Unit (vitest, fake store/source — `tests/app/projectController.test.ts`):

- change delivered → state reloaded, positions/expansion preserved for surviving ids, loss surfaced, message set;
- invalid JSON delivered → state identical (same object), warning message, following continues; next good delivery reloads and clears it;
- delivery for a stale session (new temporary open / project open / preview in between) → ignored, follow stopped;
- delivery during `lifecycleBusy` → applied exactly once after settle; superseded pending text never applied;
- `onEnded` → message, no further reloads;
- fallback source without `follow` → no follow attempted, `followingLabel` null;
- `NotAllowedError` permanence check: with a still-granted permission answer the follow survives and the error counts as transient; with `denied`/`prompt` it ends. (The follow loop is factored over a minimal handle surface so vitest can script this; OPFS cannot fabricate `NotAllowedError`.)

Smoke (Playwright, real `FsaProjectStore` — `tests/smoke/followFile.spec.ts`, picker stubbed to return an OPFS file handle as in `projectUi.spec.ts:1778`):

- open via picker → rewrite the OPFS file → reload observed through the real polling path ("Refreshed." banner / message), user-moved node position preserved;
- rewrite with truncated JSON → no state change, warning visible; complete the write → reload happens;
- N consecutive rewrites reload without any permission prompt (headless has no prompt UI, so N successful unprompted re-reads are the evidence for requirement 5);
- stop conditions: opening another document stops polling (no further reloads observed).

Lane evidence (scripted, attached to issue #9):

- **Static build**: `npm run build && npm run preview`, open the app from `preview` (no dev server), follow a real picked file, rewrite it externally (extractor or script), observe the reload. Proves requirement 6 end-to-end where HMR cannot exist.
- **Bundled dataset**: under `npm run dev`, overwrite `data/agentscommander.json` and record the Vite-driven page update — evidence only, no code (issue acceptance box 3).
- **Cross-artifact**: run the sibling `--watch` extractor against a repo, confirm change → re-extract → auto-reload closes the loop.

Gates: `npm run verify` green; architecture test unchanged and green.

## Rollback and recovery

All changes are additive and behind one UI branch point. Reverting the delivery PR restores `a3e4f55` behavior exactly: the port member is optional, no persisted format changes, no schema/manifest change, no data migration in either direction. A partial rollback (keep picker-first open, drop following) is a one-line removal of the follow start in `ProjectController` plus the adapter loop; the port type may stay dormant.

If following misbehaves in the field (e.g. a platform's `lastModified` granularity misses writes), the kill switch is the same one-line removal; the app degrades to today's manual re-open, losing freshness but nothing else.

## Known residual risk

- A write that preserves both `lastModified` and `size` within the same millisecond and is not followed by any further write is missed by the metadata gate. The extractor always changes content and timestamps, so this needs a pathological writer; accepted and documented rather than hedged with per-tick full reads.
- FSA read permission lifetime is per-session by spec; some browser builds may still drop it (e.g. after suspension). That surfaces as `onEnded` with a clear message, never as silent staleness of a claimed-followed file.
- Multi-tab: two tabs following the same file poll independently and reload independently; there is no cross-tab coordination, and none is claimed.
- A reload landing mid-drag re-derives the scene under the pointer; the existing `refreshText` path has the same property. Judged P3 UX; if a premortem shows real breakage, deferring reload while a drag is active is a contained follow-up in the same files.
- `File.lastModified` millisecond granularity plus a 1000 ms poll bounds staleness at ~2 s worst case after the extractor's rename; within the agreed freshness budget.

## Constructive decision record

- vs-spec-core-lead: `APPROVED` from the core interface, round 1, no changes required (msg 20260715-043909).
- vs-extraction-evidence-dev: `APPROVED` from the extraction interface, round 1, no contract change (fwd in msg 20260715-044008). One non-blocking finding — `NotAllowedError` misclassification could kill a healthy follow — adopted as the round-1 amendment above (permanence check before `onEnded`) rather than recorded as accepted risk: the check is one bounded permission query on an already-failing tick, and it removes an entire false-ended class.

## Independent premortem record

Pending: semantic red team, resilience red team. Implementation starts only on `READY_FOR_IMPLEMENTATION`.

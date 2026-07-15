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
  /** Bound for each delivery; content over the bound is skipped, never truncated. */
  maxBytes: number;
  /** Fresh content after each detected change. Never called with unchanged text. */
  onChange(read: FollowedRead): void;
  /**
   * A changed file could not be delivered (e.g. over maxBytes). The baseline
   * advances and following continues: at most ONE onSkipped per content change,
   * never a repeat for the same bytes. (premortem A2-F2)
   */
  onSkipped(reason: string): void;
  /** Following stopped permanently (permission revoked, file gone, repeated failures). */
  onEnded(reason: string): void;
}

export interface PickedTextSource {
  sourceName: string;
  /** Size AT PICK TIME. readText re-checks the fresh size against its own bound;
   *  callers pre-checking this value may spuriously reject a file that shrank -
   *  accepted, the fresh check governs. (premortem A2-F7) */
  sizeBytes: number;
  readText(maxBytes: number): Promise<string>;
  /**
   * Present only when the source can be re-read without re-prompting.
   * Starts change detection; returns an idempotent stop function.
   * Contract (premortem A2-F1/A2-F6): requires at least one completed
   * readText first (throws otherwise - the baseline is the last completed
   * read); a second call while one follow is active throws; calling again
   * after stop() is allowed. Absent on snapshot-only sources
   * (input-element fallback).
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
  - **Baseline (premortem A2-F1, mechanism pinned)**: the source closure records `(text, lastModified, size)` of EVERY completed `readText`; `follow()` adopts the LAST completed read as its baseline - never a fresh `getFile()` at follow time. A write landing in the open-to-follow window (import + build + render of a large document; exactly when the `--watch` extractor writes) therefore differs from the baseline and is delivered at the FIRST tick, not absorbed. `follow` before any completed `readText` throws (there is no shown content to follow).
  - **Visibility**: polling pauses while `document.visibilityState === 'hidden'` and re-checks immediately on becoming visible (adapter layer may touch `document`; the arch test restricts it only in pure layers).
  - **Transient failures** (e.g. `NotFoundError` during an editor's delete-then-create save, intermittent I/O): tolerated up to 5 consecutive ticks, then `onEnded('…')`. A success resets the counter.
  - **Permanent failures**: `NotAllowedError` is confirmed before ending. The adapter queries the handle's read permission; only a non-granted answer ends following with `onEnded` (a `prompt` answer also ends it — re-prompting without a user gesture is impossible and forbidden by requirement 5). A still-granted answer means the error was a misclassified transient (e.g. a replace-window collision reported as `NotAllowedError` by some builds) and it counts against the transient budget instead. If the permission query itself is unavailable or throws, the transient budget applies — a real revocation then ends within 5 ticks anyway.
  - **Stop**: the returned function cancels the timer and listeners idempotently; `onChange`/`onEnded` are never invoked after stop returns.

**Oversized content (premortem A2-F2, pinned)**: the size gate runs on `File` metadata BEFORE any content read - content over `maxBytes` is never read at all, not truncated. Over the cap: `onSkipped(reason)` fires ONCE and the baseline advances on metadata `(lastModified, size)` (no text recorded), so the same oversized bytes never re-read, re-warn, or re-render at tick rate; a legitimately growing dataset costs one warning per extractor write, not one per second. Oversized never counts against the transient budget and never ends the follow: a later change back under the cap is delivered normally. (The text-dedupe layer is skipped while over the cap - metadata is the only identity available without reading.)

## App and UI wiring (minimal)

`ProjectController` (`app/`):

- After a successful `readTemporarySource` from a source with `follow`, start following. Keep `stopFollow` and the source; capture the session epoch.
- **Fencing**: every `onChange`/`onEnded` callback first checks the captured session epoch and `project === null && previewReturn === null`. Stale → self-stop, discard. Additionally, every path that installs a different session (`loadTemporaryLoaded`, `commitProjectCandidate`, `beginProjectPreview`) explicitly stops the active follow, so the timer dies promptly rather than merely being fenced.
- **Reload**: on a current `onChange`, call `controller.refreshText(text)` inside try/catch. `refresh` → `importDoc` is the single validation path; layout, search, filters AND the selection carry over - the `Refresh` command in `app/state.ts` is amended to keep `selection.nodeIds` restricted to surviving ids and `selection.edgeId` when the edge still exists (premortem A2-F4: under auto-reload, extractor churn must not clear what the user is inspecting; role interface: selection is preserved across model transitions). The loss banner appears. Set the message to `Reloaded <name> from disk (<HH:MM:SS>).`; when the reload flips the document's `readOnly` (the new file declares an unsupported requirement, or stops doing so), the message names the flip explicitly instead of hiding it behind the generic text (premortem A2-F8). Notify.
- **Busy overlap**: if `lifecycleBusy` when a follow event arrives, park it in a single pending slot and apply it when the operation settles, only if the session is still current. The slot holds the latest EVENT, not just text: `reload(text)` or `ended(reason)`, with `ended` superseding a parked reload (premortem A2-F5: an `onEnded` during a foreground operation must surface after settle, not be clobbered by the operation's own completion message). A reload is never dropped and never interleaves with a foreground lifecycle operation.
- **Invalid content**: catch from `refreshText`, keep state untouched, set a non-blocking warning message `Auto-reload skipped: <name> changed on disk but is invalid or mid-write. Keeping the last good state. (<error>)`, keep following. The next successful reload clears it.
- **Ended**: surface `Stopped following <name>: <reason>. The last good state is kept.` and drop the subscription.
- **Dirty (premortem A2-F3, semantics pinned)**: dirty tracks USER actions only; an auto-reload must not flip it. The naive wiring would: the viewKey subscriber (`projectController.ts:153-163`) marks dirty on any view change outside `loading`, and a reload that drops a positioned/expanded id changes the viewKey. Therefore the reload install runs under the same `loading` guard used by `installLoadedSession` (set `loading`, `refreshText`, resync `lastViewKey`, clear `loading`): a clean session stays clean through any number of auto-reloads, a dirty session stays dirty, and the reload itself never schedules an autosave. Pinned by unit test in both directions.
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
- P2: reload preserves the user's positions/expansion AND selection for surviving ids and reports drops (loss banner); search and filters carry over.
- P2: an auto-reload never flips `dirty` and never schedules an autosave by itself; dirty reflects user actions only.
- P2: oversized content produces at most one warning per content change (baseline advances on metadata); it never spins reads at tick rate, never counts as transient failure, and never ends the follow.
- P2: the UI states that following is active and when a reload happened; warnings are non-blocking.
- P2: polling stops (not merely idles) when the session changes or following ends; no timer leaks across sessions.
- P2: a hidden tab does not poll; a refocused tab catches up within one tick.

## Allowed artifacts

- `VisualSpecs/src/ports/projectStore.ts`
- `VisualSpecs/src/adapters/filesystem/FsaProjectStore.ts`
- `VisualSpecs/src/app/projectController.ts`
- `VisualSpecs/src/app/state.ts` (Refresh carries selection of surviving ids only - premortem A2-F4)
- `VisualSpecs/src/ui/app.ts`
- `VisualSpecs/tests/app/projectController.test.ts` (fake followable sources)
- `VisualSpecs/tests/app/controller.test.ts` (Refresh selection carry-over)
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
- `NotAllowedError` permanence check: with a still-granted permission answer the follow survives and the error counts as transient; with `denied`/`prompt` it ends. (The follow loop is factored over a minimal handle surface so vitest can script this; OPFS cannot fabricate `NotAllowedError`.);
- baseline gap (A2-F1): content changed between the open `readText` and `follow()` start → delivered at the first tick; `follow` with no completed `readText` throws; second `follow` while active throws; `follow` after `stop()` works;
- oversized (A2-F2): growth over `maxBytes` → exactly one `onSkipped`, no repeat warning on subsequent ticks, no content read; shrink back under the cap → normal delivery; follow never ends from oversized;
- dirty (A2-F3): reload-with-drops on a CLEAN temporary session → dirty stays false, no autosave scheduled; on a DIRTY session → stays true;
- selection (A2-F4): Refresh keeps selected surviving node ids and a surviving selected edge; drops vanished ids only;
- ended-during-busy (A2-F5): `onEnded` while `lifecycleBusy` → after settle, `followingLabel` is null AND the stopped message is the visible one; a parked reload superseded by `ended` is not applied;
- readOnly flip (A2-F8): reload whose document flips `readOnly` → message names the flip.

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
- The app-wide single message slot means any LATER user operation can replace a follow warning or stop notice (premortem A2-F5, accepted residual): the message slot is last-event-wins across the whole app by design. The durable, non-clobberable signal is `followingLabel` - it is state, not a message, and disappears exactly when following ends. The busy-overlap case (clobbering by the operation running at event time) IS handled via the pending slot; only genuinely subsequent operations replace the text.

## Constructive decision record

- vs-spec-core-lead: `APPROVED` from the core interface, round 1, no changes required (msg 20260715-043909).
- vs-spec-core-lead: A2-F4 scope expansion (`src/app/state.ts` Refresh selection carry + `tests/app/controller.test.ts`) APPROVED, msg 20260715-050529; decision recorded as the artifact owner's.
- vs-extraction-evidence-dev: `APPROVED` from the extraction interface, round 1, no contract change (fwd in msg 20260715-044008). One non-blocking finding — `NotAllowedError` misclassification could kill a healthy follow — adopted as the round-1 amendment above (permanence check before `onEnded`) rather than recorded as accepted risk: the check is one bounded permission query on an already-failing tick, and it removes an entire false-ended class.

## Independent premortem record

- Semantic red team, round 1 (report 20260715-045530): no P0. A2-F1 (P1 conditional), A2-F2, A2-F3 (P2), A2-F4..A2-F8 (P3) - ALL adopted as the amendments marked `premortem A2-Fn` above; the single accepted residual is the later-operation message clobber half of A2-F5 (durable signal: `followingLabel`). The report also certifies as sound: the fencing design against the real `sessionEpoch` machinery, the structural P0 (refresh throws before any mutation), and the last-writer-wins slot's loss-report semantics.
- Resilience red team: pending. Implementation starts only on `READY_FOR_IMPLEMENTATION`.

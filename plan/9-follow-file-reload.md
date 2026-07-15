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
  - **Tick**: every 1000 ms, `handle.getFile()` and compare `lastModified` + `size` against the last delivered baseline with STRICT inequality (`!==`, never `>`): a backwards mtime with the same size (robocopy /COPY:DAT, rsync -t, `git stash pop` of an older file, sync-client rollback) is a change and is delivered (resilience A2-P2-2). Unchanged metadata → done; the tick costs one metadata promise, no read, no allocation beyond the `File` object. **Single-flight (resilience A2-P2-1)**: while a candidate read is in flight, subsequent ticks are skipped entirely — never queued, never raced — so two reads can never resolve out of order and deliver older content after newer; after the read settles, the next tick re-evaluates fresh metadata.
  - **Change candidate**: bounded text read; the candidate's content hash is compared against the baseline's content hash - if equal (metadata-only churn, e.g. touch), update the baseline metadata silently; otherwise deliver `onChange({ text, modifiedAt })` and advance the baseline. Hashing - **SHA-256 via WebCrypto (`crypto.subtle.digest`), pinned so fakes and adapter cannot diverge** - happens in the adapter only on change-candidate reads, never per tick, and only the hash is retained (resilience re-check 4.a: no full-text copy lives on).
  - **Baseline (premortem A2-F1, mechanism pinned)**: the source closure records `(contentHash, lastModified, size)` of EVERY completed `readText` - the hash, not the text: retaining up to 64 MiB of live string beside the parsed document would be gratuitous memory pressure (resilience re-check 4.a); `follow()` adopts the LAST completed read as its baseline - never a fresh `getFile()` at follow time. A write landing in the open-to-follow window (import + build + render of a large document; exactly when the `--watch` extractor writes) therefore differs from the baseline and is delivered at the FIRST tick, not absorbed. `follow` before any completed `readText` throws (there is no shown content to follow). **Capability gate at pick time**: `crypto.subtle` exists only in secure contexts (https and localhost - dev, preview and production covered; plain-http LAN not) - when it is unavailable, `pickExternalJson` returns the source WITHOUT `follow`, the same honest absence as the input-element fallback, zero new paths; following never starts only to die at the first change candidate with five cryptic transients. (Largely theoretical belt: `showOpenFilePicker` itself requires a secure context in Chromium, so a pickable-but-uncrypto context should not exist.) Once a follow is active, its baseline is owned exclusively by the poll loop: a concurrently completed `readText` is recorded for a FUTURE `follow()` start but never advances the active baseline (re-check N2; no current caller reads mid-follow - this clause exists to keep the contract hermetic).
  - **Visibility**: polling pauses while `document.visibilityState === 'hidden'` and re-checks immediately on becoming visible (adapter layer may touch `document`; the arch test restricts it only in pure layers).
  - **Transient failures** (e.g. `NotFoundError` during an editor's delete-then-create save, intermittent I/O): tolerated up to 5 consecutive ticks, then `onEnded('…')`. A success resets the counter.
  - **Permanent failures**: `NotAllowedError` is confirmed before ending. The adapter queries the handle's read permission; only a non-granted answer ends following with `onEnded` (a `prompt` answer also ends it — re-prompting without a user gesture is impossible and forbidden by requirement 5). A still-granted answer means the error was a misclassified transient (e.g. a replace-window collision reported as `NotAllowedError` by some builds) and it counts against the transient budget instead. If the permission query itself is unavailable or throws, the transient budget applies — a real revocation then ends within 5 ticks anyway.
  - **Stop**: the returned function cancels the timer and listeners idempotently; `onChange`/`onEnded` are never invoked after stop returns.

**Oversized content (premortem A2-F2, pinned)**: the size gate runs on `File` metadata BEFORE any content read - content over `maxBytes` is never read at all, not truncated. Over the cap: `onSkipped(reason)` fires ONCE and the baseline advances on metadata `(lastModified, size)` (no text recorded), so the same oversized bytes never re-read, re-warn, or re-render at tick rate; a legitimately growing dataset costs one warning per extractor write, not one per second. Oversized never counts against the transient budget and never ends the follow: a later change back under the cap is delivered normally. (The text-dedupe layer is skipped while over the cap - metadata is the only identity available without reading.) The `onSkipped` reason reuses the existing cap wording (`FsaProjectStore.ts:246`: `<name> is <N> bytes, over the <M> byte cap`) so the app-side warning frames it honestly as `Auto-reload paused: <reason>. Reloads resume when the file is back under the cap.` — a dataset that outgrew the cap is a PERMANENT condition, not "invalid or mid-write", and the two warnings stay distinguishable (resilience A2-P2-3).

## App and UI wiring (minimal)

`ProjectController` (`app/`):

- After a successful `readTemporarySource` from a source with `follow`, start following. Keep `stopFollow` and the source; capture the session epoch.
- **Fencing**: every `onChange`/`onEnded` callback first checks the captured session epoch and `project === null && previewReturn === null`. Stale → self-stop, discard. Additionally, every path that installs a different session (`loadTemporaryLoaded`, `commitProjectCandidate`, `beginProjectPreview`) explicitly stops the active follow, so the timer dies promptly rather than merely being fenced.
- **Reload**: on a current `onChange`, call `controller.refreshText(text)` inside try/catch. `refresh` → `importDoc` is the single validation path; layout, search, filters AND the selection carry over - the `Refresh` command in `app/state.ts` is amended to keep `selection.nodeIds` restricted to surviving ids and `selection.edgeId` when the edge still exists (premortem A2-F4: under auto-reload, extractor churn must not clear what the user is inspecting; role interface: selection is preserved across model transitions). The loss banner appears. Set the message to `Reloaded <name> from disk (<HH:MM:SS>).`; when the reload flips the document's `readOnly` (the new file declares an unsupported requirement, or stops doing so), the message names the flip explicitly instead of hiding it behind the generic text (premortem A2-F8). Notify.
- **Busy overlap**: if `lifecycleBusy` when a follow event arrives, park it and apply at settle, only if the session is still current. The parked state holds three parts ordered by EVENT SEQUENCE, not by a fixed schema: the LATEST reload text (last-writer-wins among reloads), the LATEST skipped reason - which is DISCARDED when a reload parks after it (the "next successful reload clears the warning" rule applied inside the slot: skipped(W1-oversized) then reload(W2-valid) in one busy window must not surface W2 with a stale pause notice on top) and kept only when it arrived after the last parked reload - and an `ended(reason)` flag. At settle they apply reload first, then the surviving skipped warning if any, then the stop notice - so a valid text observed before a LATER oversized write still lands as last-good content with the pause notice on top - because a text observed before the follow died is still legitimate last-good content (premortem A2-F5 + re-check N1: an `onEnded` during a foreground operation surfaces after settle instead of being clobbered, and it never discards a parked reload). A reload is never dropped and never interleaves with a foreground lifecycle operation.
- **Invalid content**: catch from `refreshText`, keep state untouched, set a non-blocking warning message `Auto-reload skipped: <name> changed on disk but is invalid or mid-write. Keeping the last good state. (<error>)`, keep following. The next successful reload clears it. (Distinct from the oversized warning above - see A2-P2-3.)
- **Announcements (resilience A2-P1-1, accessibility half)**: the three follow messages - reloaded, skipped/paused, stopped - are ALSO routed through the existing polite live region (`role=status`, `ui/app.ts:194` `announce()` path), not only the plain `projectMessage` span (`ui/app.ts:610`), which screen readers never hear. When a reload drops selected ids, the bare `Selection cleared.` announcement is SUPPRESSED and folded into the reload announcement instead (`Reloaded <name>: <n> selected item(s) no longer exist`) - the SR user hears the cause, not the symptom. With selection carried for surviving ids (A2-F4), an unchanged selection announces nothing.
- **Skipped (handler pinned, resilience 2.b)**: `ProjectController` wires `onSkipped` explicitly, under the SAME session fencing as `onChange`: on a current event it sets the paused warning (framing per A2-P2-3), leaves `followState` at `following`, touches neither the document state nor `dirty`, and notifies. During `lifecycleBusy` it parks in the same pending slot (latest skipped reason kept alongside the parked parts below).
- **Ended (resilience A2-P2-5)**: surface `Stopped following <name>: <reason>. The last good state is kept. Reopen the file to resume following.` and drop the subscription. The stopped condition is STATE, not just a message: the follow status becomes a persistent `stopped` value distinct from both `following` and `none`, rendered until the session ends - a user returning to the tab hours later can tell "following, no changes" from "stopped hours ago, this may be stale".
- **Dirty (premortem A2-F3, semantics pinned)**: dirty tracks USER actions only; an auto-reload must not flip it. The naive wiring would: the viewKey subscriber (`projectController.ts:153-163`) marks dirty on any view change outside `loading`, and a reload that drops a positioned/expanded id changes the viewKey. Therefore the reload install runs under the same `loading` guard used by `installLoadedSession` (set `loading`, `refreshText`, resync `lastViewKey`, clear `loading`): a clean session stays clean through any number of auto-reloads, a dirty session stays dirty, and the reload itself never schedules an autosave. Pinned by unit test in both directions.
- `ProjectControllerState` gains `followState: { kind: 'none' } | { kind: 'following'; label: string } | { kind: 'stopped'; label: string }` (labels e.g. `Following dataset.json — reloads on change` / `Follow stopped — reopen the file to resume`), so the UI renders follow status, including the persistent stopped state (A2-P2-5), without knowing why. (Supersedes the earlier two-valued `followingLabel`.)

`ui/app.ts`:

- `openTemporary` handler: when the snapshot says the picker path is available, call the picker path through the existing `runProjectAction`; otherwise `fileInput.click()` as today. **Order pinned (resilience A2-P2-6)**: the picker opens FIRST, on the click's fresh user activation; the `confirmDestructive` discard prompt runs AFTER a file was actually picked and BEFORE installing it, and a cancel discards the picked source leaving the session untouched. The old order (confirm first) lets a slow answer expire the transient activation and makes `showOpenFilePicker` throw `SecurityError` intermittently - the cited `addJsonToProject` precedent has no confirm in front, which is exactly why it never hit this. When nothing is discardable the prompt is skipped entirely (already today's behavior).
- Render `followState` in the project status line. The reload banner already exists; under an active or stopped follow it carries the LAST reload time (`Refreshed at <HH:MM:SS>.`) so a persistent banner stays truthful instead of becoming undated wallpaper (resilience A2-P2-4, banner half).

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
- P2: the UI states that following is active and when a reload happened; warnings are non-blocking. The reloaded/paused/stopped events are announced through the polite live region - a screen reader hears the reload itself, never a bare `Selection cleared.` symptom (A2-P1-1).
- P2: a stopped follow is a persistent visible state distinct from "never followed" until the session ends, and its message names the recovery action (A2-P2-5).
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
- `VisualSpecs/tests/smoke/projectUi.spec.ts` — LIMITED to the temporary-open block (`:174-184`): it asserted the superseded confirm-before-picker order; updated to the pinned A2-P2-6 order (lead approval msg 20260715-062356).
- `VisualSpecs/playwright.config.ts` — LIMITED to one line: the `acceptance` project's testMatch gains `followFile` so the pinned spec actually runs under the gate (lead approval msg 20260715-060540; without it the spec would be a false gate).
- `plan/9-follow-file-reload.md` (this file)

Out of scope: `tools/extractor/`, `contract/`, `domain/`, `projection/`, renderer adapters, `tests/architecture/boundaries.test.ts` (must pass as-is), CI/workflow files.

## Implementation sequence

1. Port types (`FollowedRead`, `FollowOptions`, optional `follow`) — compile-only change, no adapter yet.
2. Adapter: retained handle, fresh `readText`, polling `follow` with baseline/visibility/failure policy. Unit-testable pieces factored so the smoke test can drive them over OPFS.
3. `ProjectController`: follow lifecycle, fencing, pending slot, reload/warning/ended messages, `followState`.
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
- fallback source without `follow` → no follow attempted, `followState.kind === 'none'`;
- `NotAllowedError` permanence check: with a still-granted permission answer the follow survives and the error counts as transient; with `denied`/`prompt` it ends. (The follow loop is factored over a minimal handle surface so vitest can script this; OPFS cannot fabricate `NotAllowedError`.);
- baseline gap (A2-F1): content changed between the open `readText` and `follow()` start → delivered at the first tick; `follow` with no completed `readText` throws; second `follow` while active throws; `follow` after `stop()` works;
- oversized (A2-F2): growth over `maxBytes` → exactly one `onSkipped`, no repeat warning on subsequent ticks, no content read; shrink back under the cap → normal delivery; follow never ends from oversized;
- dirty (A2-F3): reload-with-drops on a CLEAN temporary session → dirty stays false, no autosave scheduled; on a DIRTY session → stays true;
- selection (A2-F4): Refresh keeps selected surviving node ids and a surviving selected edge; drops vanished ids only;
- ended-during-busy (A2-F5/N1): `onEnded` while `lifecycleBusy` → after settle, `followState.kind === 'stopped'` (persistent, not `none` - A2-P2-5) AND the stopped message is the visible one; a reload parked BEFORE the `ended` is applied first, then the stop notice;
- single-flight (A2-P2-1): slow fake handle whose read spans multiple ticks → intermediate ticks skipped, deliveries never out of order (older text never delivered after newer);
- strict gate (A2-P2-2): same-size mtime-BACKWARDS change → delivered;
- warning framing (A2-P2-3): oversized warning text names the cap and "paused"; invalid/mid-write warning stays distinct;
- picker order (A2-P2-6): with discardable changes, the picker resolves before any confirm; cancel at the confirm leaves the session untouched and the picked source unused;
- skipped-during-busy (2.b): `onSkipped` while `lifecycleBusy` parks and applies after settle in order reload → surviving skipped → ended; a lone skipped event leaves `followState` at `following` and document state untouched; skipped-then-reload in one busy window → only the reload applies, the stale pause notice is discarded; reload-then-skipped → both apply, pause notice on top;
- dispatch atomicity hardening (resilience A2-P3): a `derive` injected to throw after `apply` must not leave `currentState` advanced with stale derived state - pins the class; no known trigger exists today (`assertInjective` runs inside `apply`), so if this test exposes a real tear in `controller.ts` (outside my allowed files), it escalates to the lead as a scope note instead of a silent fix. RESOLVED at implementation (lead decision msg 20260715-070254, option b): no test-only injection seam is added to `controller.ts` - a production seam for a hypothesis with no known trigger does not justify its complexity - and the implemented apply-throw variant (poisoned model ⇒ state AND derived untouched) stands as the pinned hardening; reopens only with a concrete trigger from the semantic reviewer at the gate;
- readOnly flip (A2-F8): reload whose document flips `readOnly` → message names the flip.

Smoke (Playwright, real `FsaProjectStore` — `tests/smoke/followFile.spec.ts`, picker stubbed to return an OPFS file handle as in `projectUi.spec.ts:1778`; the spec runs under the `acceptance` project, i.e. inside `npm run smoke` and `npm run verify`):

- open via picker → rewrite the OPFS file → reload observed through the real polling path ("Refreshed." banner / message), user-moved node position preserved;
- rewrite with truncated JSON → no state change, warning visible; complete the write → reload happens;
- N consecutive rewrites reload without any permission prompt (headless has no prompt UI, so N successful unprompted re-reads are the evidence for requirement 5);
- stop conditions: opening another document stops polling (no further reloads observed);
- announcements (A2-P1-1): after a rewrite-triggered reload, the `role=status` live region contains the reload announcement; a reload that drops the selected id announces the unified message and never a bare `Selection cleared.`.

Lane evidence (scripted, attached to issue #9):

- **Static build**: `npm run build && npm run preview`, open the app from `preview` (no dev server), follow a real picked file, rewrite it externally (extractor or script), observe the reload. Proves requirement 6 end-to-end where HMR cannot exist.
- **Bundled dataset**: under `npm run dev`, overwrite `data/agentscommander.json` and record the Vite-driven page update — evidence only, no code (issue acceptance box 3).
- **Cross-artifact**: run the sibling `--watch` extractor against a repo, confirm change → re-extract → auto-reload closes the loop.
- **Safe-save editors (resilience A2-P3)**: manual evidence run - rewrite the followed file via VS Code save, vim `:w`, and `sed -i` (delete+create patterns included) and confirm the handle still resolves and the reload fires; this exercises the "handle silently orphaned by a safe-save dance" class that OPFS smoke cannot.

Gates: `npm run verify` green; architecture test unchanged and green. `projectUi.spec.ts` is back to 39/39 after its temporary-open block was updated to the pinned picker-first order (see Allowed artifacts) — a historical 38/39 during implementation was that block still asserting the superseded order.

## Rollback and recovery

All changes are additive and behind one UI branch point. Reverting the delivery PR restores `a3e4f55` behavior exactly: the port member is optional, no persisted format changes, no schema/manifest change, no data migration in either direction. A partial rollback (keep picker-first open, drop following) is a one-line removal of the follow start in `ProjectController` plus the adapter loop; the port type may stay dormant.

If following misbehaves in the field (e.g. a platform's `lastModified` granularity misses writes), the kill switch is the same one-line removal; the app degrades to today's manual re-open, losing freshness but nothing else.

## Known residual risk

- A write that preserves both `lastModified` and `size` within the same millisecond and is not followed by any further write is missed by the metadata gate. The extractor always changes content and timestamps, so this needs a pathological writer; accepted and documented rather than hedged with per-tick full reads.
- FSA read permission lifetime is per-session by spec; some browser builds may still drop it (e.g. after suspension). That surfaces as `onEnded` with a clear message, never as silent staleness of a claimed-followed file.
- Multi-tab: two tabs following the same file poll independently and reload independently; there is no cross-tab coordination, and none is claimed.
- **Operational limit, measured (resilience A2-P2-4)**: the reload path is synchronous on the main thread. Resilience red team benches on the REAL branch code: ~34 ms at corpus scale (0.8 MiB, 744 nodes), ~84 ms at x5, ~305 ms at x20, ~1.25 s at x40, extrapolating to ~2.5-3 s near the 64 MiB cap - per extractor rewrite, regardless of user interaction. At the corpus scale this feature targets, the stall is imperceptible; the curve is declared here as the operational limit rather than hidden. Deferring reloads during ANY active pointer interaction (drag, pan, wheel) is ONE unified follow-up - superseding the earlier mid-drag-only note - owned by vs-graph-runtime-dev as a separate issue if datasets beyond ~x5 corpus become a real workload; the pending-slot mechanics this plan already pins are the natural parking spot for it.
- The "Refreshed." banner persists until the next load by design (`state.loss` is state, not a toast); with the reload timestamp on it (A2-P2-4) it stays truthful. Auto-expiration is deliberately NOT adopted: a timed disappearance of state would be a second clock in the UI for cosmetic gain.
- `sourceName`/`sizeBytes` render as picked (a grown file shows its open-time size in static labels until reopened) - cosmetic, accepted (resilience A2-P3).
- `File.lastModified` millisecond granularity plus a 1000 ms poll bounds staleness at ~2 s worst case after the extractor's rename; within the agreed freshness budget.
- The app-wide single message slot means any LATER user operation can replace a follow warning or stop notice (premortem A2-F5, accepted residual): the message slot is last-event-wins across the whole app by design. The durable, non-clobberable signal is `followState` - it is state, not a message: `following` while active and a PERSISTENT `stopped` (with recovery label) after an ended, until the session ends (A2-P2-5) - strictly stronger than the disappearing label this paragraph originally defended. The busy-overlap case (clobbering by the operation running at event time) IS handled via the pending slot; only genuinely subsequent operations replace the text.

## Constructive decision record

- vs-spec-core-lead: `APPROVED` from the core interface, round 1, no changes required (msg 20260715-043909).
- vs-spec-core-lead: A2-F4 scope expansion (`src/app/state.ts` Refresh selection carry + `tests/app/controller.test.ts`) APPROVED, msg 20260715-050529; decision recorded as the artifact owner's.
- vs-extraction-evidence-dev: `APPROVED` from the extraction interface, round 1, no contract change (fwd in msg 20260715-044008). One non-blocking finding — `NotAllowedError` misclassification could kill a healthy follow — adopted as the round-1 amendment above (permanence check before `onEnded`) rather than recorded as accepted risk: the check is one bounded permission query on an already-failing tick, and it removes an entire false-ended class.

## Independent premortem record

- Semantic red team, round 1 (report 20260715-045530): no P0. A2-F1 (P1 conditional), A2-F2, A2-F3 (P2), A2-F4..A2-F8 (P3) - ALL adopted as the amendments marked `premortem A2-Fn` above; the single accepted residual is the later-operation message clobber half of A2-F5 (durable signal: `followingLabel`). The report also certifies as sound: the fencing design against the real `sessionEpoch` machinery, the structural P0 (refresh throws before any mutation), and the last-writer-wins slot's loss-report semantics.
- Resilience red team, round 1 (report 20260715-051237, attacked HEAD `a8c663d` - one amendment behind, per the lead's note): A2-P1-1 selection half and A2-P2-3 mechanics half were ALREADY resolved by the semantic-round amendments A2-F4/A2-F2 (`ab70bab`); the genuinely new halves and findings - live-region announcements (A2-P1-1), single-flight (A2-P2-1), strict gate (A2-P2-2), oversized framing (A2-P2-3), measured stall curve + banner timestamp (A2-P2-4), persistent stopped state (A2-P2-5), picker-before-confirm order (A2-P2-6), dispatch-atomicity hardening test and safe-save evidence run (A2-P3) - are adopted as the amendments marked `resilience A2-*` above. Deliberately NOT adopted: banner auto-expiration and interaction-deferred reloads (registered with owner and rationale under Known residual risk). Their benches (34 ms reload at corpus scale, ~9 s end-to-end chain) stand as the baseline for the final adversarial gate.
- Implementation starts only on `READY_FOR_IMPLEMENTATION`.

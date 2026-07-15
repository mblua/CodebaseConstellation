# Plan #9 (artifact 1 of 2): extractor `--watch` + multi-repo config

Status: `PROPOSED` — awaiting red-team premortems; no implementation until `READY_FOR_IMPLEMENTATION`. Round-1 semantic and resilience premortem amendments applied (see the two §Round-1 amendment logs).

Issue: <https://github.com/mblua/VisualSpecs/issues/9>

Artifact owner: `vs-extraction-evidence-dev`

Delivery path: Full (RFC → premortems → implementation → adversarial gates).

Scope: `VisualSpecs/tools/extractor/` only, plus one npm script in `VisualSpecs/package.json` and this plan. The sibling artifact (follow-file auto-reload, owner `vs-graph-runtime-dev`) is out of scope here except for the one cross-artifact promise stated in §Atomicity.

## Situation before the change

At branch point `a3e4f55` (merge of PR #8):

- Extraction is one-shot: `npm run extract -- --repo <path> --out <file> [--name ...]`. The process exits after one document.
- `cli.ts` parses argv, checks `--out` confinement (`assertOutputInsideRoot`, exit 8/5), calls the pure `extract(options)`, then writes with a **direct `writeFileSync`** — a reader that opens the file mid-write can observe a truncated or partial JSON. Nothing prevents this today; the bundled-dataset workflow (`data/agentscommander.json` served by Vite dev) simply tolerates it because writes are rare and human-triggered.
- One repository per invocation. Two npm scripts exist: `extract` (generic) and `extract:agentscommander` (pinned to the corpus).
- The extractor has **zero runtime dependencies** and runs as `node tools/extractor/cli.ts` (Node ≥ 22.18, native type stripping). File enumeration is git-based: `git ls-files -z` for the tracked set, content read from the working tree, `git status --porcelain=v1 -z --untracked-files=no` for dirtiness, `rev-parse HEAD` for the commit (`repo.ts`). Untracked files never appear in a document.
- Error contract (§10.6): deterministic failures, distinct exit codes 1–9 in `errors.ts`, machine-readable JSON on stderr.
- Determinism (§10.6): without `--stamp`, two runs on the same input produce byte-identical text.

## Requested change

From issue #9, extraction lane:

1. `--watch` keeps the CLI alive and re-extracts when the watched working tree changes.
2. Multi-repo via config file of `{ repo, name, out }` entries (e.g. `--config .local/extract-watch.json`). Single-repo `--watch` with today's flags also works.
3. Debounce per repo; re-extract only the repo that changed.
4. Atomic output writes (temp + rename): a concurrent reader must never observe a torn JSON. This is the cross-artifact contract with the follow-file reader.
5. An extraction error is reported and does not kill the watcher.

Standing directive: decoupling. The watch loop orchestrates the existing extraction as a function; the core stays one-shot and pure. Config parsing, watching, and output writing are separable modules; `cli.ts` stays wiring.

## Expected state after the change

```
Terminal 2: npm run extract -- --watch --config .local/extract-watch.json
```

stays alive, prints one summary block per (re)extraction, rewrites only the `out` of the repo that changed, atomically, and survives per-repo extraction errors. `npm run extract -- --watch --repo ... --out ...` does the same for a single repo. All existing one-shot invocations behave exactly as before, except that their output write also becomes atomic (deliberate; see §Atomicity). **Skip-identical applies to watch mode only (A1-F3 pinned):** a one-shot run always writes — so it always bumps `lastModified`, scripts that use the output's mtime as a run marker keep working, and the `written` summary line of `cli.ts` stays truthful. The canonical document payload, schema, `generator.flags`, and `configDigest` are byte-for-byte unaffected: `--watch`, `--config`, and `--interval` are process-lifecycle flags, not content flags, so — like `--repo`, `--out`, and `--stamp` today — they never enter `generator.flags`.

**Operational end-to-end budget (assigned owner: this artifact):** the measured full chain on the real corpus — change detection (≤ 2×interval) + extraction (**6.3 s** measured) + atomic write + reader detection (≤ 1 s, artifact 2) + reload (~34 ms measured) — is **~9 s** from "file saved" to "map updated" (resilience bench, report `20260715-051237`). Extraction dominates the chain, so this artifact owns the budget; every watch summary block prints the cycle durations (`extract`/`write`/`total` ms) so regressions are visible at a glance, and the acceptance transcript records them against this figure. Artifact 2 references this budget rather than owning it.

### New module layout (decoupling)

| File | Responsibility |
| --- | --- |
| `tools/extractor/watchconfig.ts` (new) | Parse + validate the config file into watch targets. Pure: `(text, cwd) → WatchTarget[]` or `ExtractorError`. Entries are assembled into `ExtractOptions` by the **same options-assembly function the flag parser uses** (factored out of today's `parseArgs`), so the `flags` composition order lives in exactly one place; a pinned equivalence test proves it (§Verification 1a, A1-F1). |
| `tools/extractor/output.ts` (new) | `writeFileAtomic(outPath, text)` (unique temp + rename + Windows retry) and `writeIfChanged` (watch-only wrapper: compares against the **current on-disk bytes** of `out`). No knowledge of watching or extraction. |
| `tools/extractor/watch.ts` (new) | Fingerprinting, per-repo debounce state machine, poll loop. Takes `extract` and the writer as injected functions; exports the pure pieces (`fingerprint`, state transitions) for unit tests. |
| `tools/extractor/cli.ts` (edit) | New flags `--watch`, `--config <path>`, `--interval <ms>`; wiring only. The options-assembly step of `parseArgs` (`cli.ts:107-116` composition of `declared`) is extracted for reuse by `watchconfig.ts`. One-shot path switches its write to `output.ts`. |
| `tools/extractor/errors.ts` (edit) | One new exit code: `badConfig: 10`. |

`extract.ts`, `repo.ts`, and every language extractor are untouched. No dependency is added (no chokidar): the mechanism below is deliberately dependency-free.

## Detection mechanism: polled git-aware fingerprint

Every `--interval` milliseconds (default **1000**; must be an integer ≥ 100, anything else — non-numeric, fractional, `< 100` — is `EXIT.usage`: reject, never clamp, because a silently clamped typo hides a 10× misconfiguration), per repo, using the exact same git invocation style as `repo.ts` (`execFileSync`, argument array, never a shell):

1. `git ls-files -z` → tracked set;
2. `git rev-parse HEAD` → commit (absent on an unborn branch, as in `repo.ts`);
3. `git status --porcelain=v1 -z --untracked-files=no` → index-visibility state (A1-F5: this catches `update-index --assume-unchanged`/`--skip-worktree` toggles, which change `source.dirty`/`stats.modifiedTrackedFiles` in the document without touching content, mtimes, or HEAD);
4. `lstat` **only the files the porcelain output reports** (the dirty set) → `(path, size, mtimeMs)`. This is the **hybrid fingerprint** (adopted from pre-verification `20260715-052056` §3.b): git's own C-speed stat scan inside `status` covers the clean set, and the explicit lstat pass covers the second-edit-to-an-already-dirty-file hole — the porcelain-killer — because a dirty file is in the set and its mtime is observed directly. Porcelain parsing is hardened for v1 `-z` realities (final pass 3): a staged rename/copy (`R`/`C`) entry carries **two** NUL-separated path fields and the parser consumes both; and an lstat that fails inside the dirty set (a deleted-but-unstaged ` D` file, a rename artifact) never throws the tick — the file simply contributes no tuple, absence represented as absence, while the porcelain text already carries that state into the hash;
5. fingerprint = SHA-256 over the sorted dirty-set `(path, size, mtimeMs)` tuples + the commit + the porcelain output + the tracked list itself.

A repo "changed" when its fingerprint differs from the last one extracted.

**Scheduling and tick-overrun policy (A1-P1-1):** the loop is a **self-rescheduling `setTimeout`**, re-armed only **after** a tick — including any extraction and write it triggered — completes; never `setInterval`, so ticks cannot overlap, queue, or storm git spawns by construction. The effective cadence is therefore **max(configured `--interval`, duration of the last tick)**; when tick duration stretches the cadence beyond the configured interval, one log line says so (once per stretch episode, not once per tick). The 100 ms validation floor is exactly that — a floor on the *configured* value, not a promised cadence: on the measured Windows baseline even the 645-file corpus ticks in ~155–220 ms, so `--interval 100` means "as fast as this machine allows", bounded by this policy. **Duty cycle under permanent churn (pre-verification 3.c):** the tick's work is the full cycle — fingerprint, extraction, atomic write — so while one repo's stability-triggered or forced-K extraction runs (~6.3 s corpus, measured), detection for the *other* repos blacks out until that cycle completes; the detection-latency bound for any repo is therefore the configured interval **plus the most expensive sibling cycle**, serialized by design (accepted; a worker pool stays out of scope, per §Error containment). **And one wording reconciliation (pre-verification 3.d):** this runtime cadence stretch is *not* the clamp the `--interval` validation forbids — validation rejects a mis-typed configured value at startup; the scheduler adapting to the measured tick duration at runtime is this policy working as specified, not a silent correction of user input.

**Why this and not the alternatives:**

- **`git status --porcelain` polling alone** has a false-negative hole: a second edit to an already-dirty file leaves the porcelain output *identical*, so the change is invisible. Since the extractor reads content from the working tree, this misses exactly the edits the loop exists to catch. Rejected as the sole input; included as one hash input above because it covers the index-visibility class that stat cannot see.
- **`fs.watch` (recursive)** is native but platform-quirky: duplicated/dropped events, editor rename dances, `.git/` churn during every git operation, and it still needs a git query per event burst to filter untracked noise — plus its own debounce. More moving parts for the same outcome. Rejected.
- **chokidar** would be the first runtime dependency of the extractor. Rejected on that ground alone.
- **Directory-tree mtime walk without git** re-implements the tracked-set/ignore logic git already owns. Rejected.

The fingerprint catches content edits (a clean file enters the porcelain set; a dirty file's lstat tuple moves), file add/remove/track/untrack, reverts (a file leaves the porcelain set), commits, branch switches, checkouts, and index-visibility toggles. **Deliberate behavioral change vs the pre-hybrid draft (owner's call, pre-verification 3.b):** a `touch` of a *clean* tracked file is no longer detected — git's status scan does not surface it. That detection was a pure false positive: the extractor reads content and never mtimes, so a touch cannot change the document; pre-hybrid it cost a full ~6.3 s extraction whose output skip-identical then discarded, and a build system's touch-storm over tracked files cost one such extraction per storm. Under the hybrid it costs nothing at all. Residual false negative, unchanged in kind: a content change that preserves both size and `mtimeMs` fools git's stat scan and a direct lstat equally — the same envelope the plan already accepted. One residual the hybrid *added*, stated honestly (final pass 4): a file under `assume-unchanged`/`skip-worktree` that is edited *afterwards* is invisible to both the porcelain scan and the dirty-set lstat; the edit reaches the document at the next detected change of any kind — convergence, not loss, and narrower than the silently-wrong `source.dirty` the porcelain input fixed.

Cost, **measured** (resilience premortem bench + pre-verification re-measure, Windows 11/NTFS, reports `20260715-051237` and `20260715-052056` — the plan's original "tens of milliseconds" claim was wrong at every scale on Windows and is corrected here, A1-P1-1c): a git spawn costs ~60–120 ms on Windows (porcelain measured at 70–118 ms), and the three-spawn corpus tick measured **225–235 ms warm**. At 50 000 files, the pre-hybrid full-lstat tick measured **7.9–12.1 s**, of which the Node `lstatSync` loop was 7.4–11.8 s while git's porcelain stat-scanned the same 50k files in **90–142 ms** — the 80× asymmetry that motivated the hybrid. With the hybrid, the 50k tick is bounded by the three spawns plus the dirty-set lstats: **~0.3–0.6 s**, composed from the reviewer's measured components (not a new measurement; the implementation bench confirms it). Tick > interval can still be a permanent condition on extreme repos, which is what the scheduling policy above absorbs without overlap or spawn storms. Repos are polled sequentially within a tick. If a git command fails transiently mid-tick (e.g. `.git/index.lock` during a rebase), that repo's fingerprint is treated as unavailable for the tick and re-tried next tick; the loop never dies for it. **Persistent unavailability is not silent (A1-P2-3):** after **30 consecutive** unavailable ticks for a repo, one warning line is printed for that repo carrying the last git error, and one recovery line when its fingerprint succeeds again; the counter resets on every success.

### Debounce (per repo)

Polling gives debounce almost for free: a change observed at tick *T* does **not** trigger extraction; the repo is re-extracted at the first tick where the fingerprint is *identical to the previous tick's* and differs from the last-extracted one. A save storm (e.g. `git checkout` touching 500 files) therefore coalesces into exactly one re-extraction, at the cost of a worst-case latency of ~2×interval (~2 s at the default). Each repo carries its own `(lastExtracted, lastSeen)` fingerprint pair; repo A's changes cannot schedule repo B (verified below).

**Bounded staleness under continuous churn (A1-F7):** if the fingerprint keeps differing tick after tick (an agent loop editing the corpus continuously — the primary use case, so this is not a corner), stability may never arrive. Therefore: after **K = 5** consecutive unstable ticks, the repo is extracted anyway from the state observed at that tick, and the instability counter resets. Worst-case staleness under permanent churn is thus K×interval (~5 s at defaults), not unbounded.

**Forced-K vs in-progress git operations (resilience-flagged interaction):** forced extraction exists to bound staleness of a tree someone is actually editing; a mid-rebase or mid-merge tree is transient by construction, and publishing it deliberately would reintroduce exactly what the stability rule avoids. The **forced**-K path is therefore deferred while the repo's `.git` carries an operation marker (`rebase-merge/`, `rebase-apply/`, `MERGE_HEAD`, `CHERRY_PICK_HEAD`, `BISECT_LOG` — one lstat each, no per-tick spawn). **Markers are looked up under the repo's real git directory, never a hardcoded `<root>/.git/` (final pass 2):** in a linked worktree `.git` is a *file* and the markers live under `<main>/.git/worktrees/<name>/`; a naive lstat would ENOENT forever and leave the deferral silently inert. The git dir is resolved once per repo at startup via `git rev-parse --git-dir` (cached; resolved against the repo root when relative). The normal stability path still runs, so an interactive rebase paused at a stop — a real, inspectable state — extracts normally once stable, and converges again at the next stop (accepted; the resilience report registers the banner-per-stop fatigue on the reader side). A marker left behind by an abandoned operation defers forced-K until the marker goes; bounded staleness resumes as soon as git's own state says the tree is whole. Deliberate tie-break, documented. **Prolonged deferral is not silent (final pass 5, symmetric with the A1-P2-3 unavailability signal):** after 30 consecutive deferred ticks, a one-time warning line names the repo and the marker; one line on resume.

### Startup pass (A1-P2-1)

On `--watch` startup, after config validation and confinement checks, **every target is extracted once, serially, in entry order — before the first tick**. No state persists between watcher runs, so this is the only way edits made while the watcher was off ever reach `out`; skip-identical makes the no-change case free (no write, no downstream reload). Measured cost: ~**6.3 s** per corpus-sized repo (resilience bench), so N targets cost ~N×6.3 s of serial startup, each printing its summary block. Each repo's baseline fingerprint is the one captured at its startup extraction. **Failure containment at startup (final pass 1):** config, flag, and confinement errors still fail fast before anything runs (exit 1/5/8/10); but once the startup pass begins, an extraction or write failure in one target is contained exactly as in the loop — same two failure classes, same handling (§Error containment), process alive, remaining targets still extracted (issue criterion 5). A startup extract-failure parks that repo's startup fingerprint as attempted; a startup write-failure retains the text and retries per tick.

### Error containment

Startup errors — unreadable/invalid config, `--out` escape for any entry, flag misuse — fail fast with today's contract (exit 1/5/8/10) before the loop starts. Once the loop runs, failures are contained per repo and — **A1-F4 — distinguished by class**:

- **Extract-failure** (deterministic: bad encoding, unreadable file, git gone): printed as the existing machine-readable JSON line on stderr; the failing fingerprint is recorded as *attempted*, so the same broken state is not re-extracted every tick (no hot error loop); the next fingerprint change retries.
- **Write-failure** (extraction succeeded, atomic publish failed — e.g. the Windows rename retry budget exhausted because something held `out` open without share-delete): the extracted text is kept in memory and the **write alone is retried every tick** until it succeeds or a newer extraction supersedes the text. The fingerprint is *not* parked — a good extraction must not be silently discarded, or `out` would stay stale forever on a quiet repo. Retry logging is throttled (pre-verification 4.b): one line on the first failure, one every 30th retry thereafter (~every 30 s at default cadence against a sustained lock — not 3 600 lines per hour), and one line when the pending text finally publishes. The retry costs no re-extraction.

The old `out` content is never damaged by a failed cycle of either class. An unexpected throw is treated as extract-failure. SIGINT/SIGTERM exit 0.

Extraction runs in-process and synchronously, as today; while one repo extracts, polling of the others pauses. Accepted: the corpus extraction takes seconds, and a worker pool would couple the loop to scheduling concerns for no observed need.

## Config file format

JSON (no YAML — no dependency), object with a `repos` array; entry fields mirror the CLI flags exactly:

```json
{
  "repos": [
    {
      "repo": "../../repo-AgentsCommander",
      "name": "AgentsCommander",
      "out": "data/agentscommander.json"
    },
    {
      "repo": "../../repo-OtherThing",
      "out": "data/otherthing.json",
      "hierarchy": "physical",
      "bareInvoke": true
    }
  ]
}
```

- Required per entry: `repo`, `out`. Optional: `name`, `hierarchy`, `invokeFacade`, `bareInvoke`, `tsconfig`, `snippets`, `stamp` — same meanings and defaults as the flags. Each entry becomes one `ExtractOptions` **through the same assembly function `parseArgs` uses** (single composition point for the `flags` array), so per-entry `generator.flags`/`configDigest` provenance is structurally identical to running the flags by hand — and pinned by an equivalence test, not just claimed (§Verification 1a, A1-F1).
- **Path base: relative paths resolve against `process.cwd()`**, exactly like `--repo`/`--out` today. One resolution rule, and `--out` confinement already lives at the CWD root. The rejected alternative (config-file-relative) would make the config portable but introduce a second base that the confinement check does not share.
- Fail fast with the new `badConfig` (exit 10): not valid JSON / not the documented shape, unknown keys (typo protection), empty `repos`, duplicate `out`, duplicate effective `name`, missing `repo`/`out`.
- **Duplicate detection canonicalizes before comparing (A1-F2):** each `out` is resolved, its deepest existing ancestor is `realpath`ed (junction/symlink aliasing collapses), and on win32 the result is case-folded — NTFS is case-insensitive, so `data/Corpus.json` and `data/corpus.json` are one physical file and are rejected as duplicates instead of silently racing. `name` comparison case-folds on all platforms (two labels differing only in case are one identity downstream). Residual, documented and accepted (owner: this artifact): a junction created *after* startup can alias two outs later; the atomic-rename mechanism still keeps every observed document complete, and the follow-file reader survives content flips by design.
- **An `out` must not land inside a watched repo unless git-ignored there (A1-P1-3):** at startup, for every pair (watched repo R, target out O): if O falls inside R's working tree (lexical containment + realpath, `confine.ts` tools), the target is rejected with `badConfig` **unless** `git -C R check-ignore` reports O as ignored. Measured rationale: writing `out` into a watched tree makes the writer feed the watcher — without `--stamp` it converges in ~2 cycles via skip-identical; with `--stamp` it is a permanent extract loop, one full ~6.3 s cycle after another, forever (resilience A1-P1-3). Requiring an ignored path (e.g. `.local/self.json` for the self-map/dogfood case; `.local/` is already gitignored) removes the feedback edge entirely instead of merely bounding it, and covers the stamp-less benign double-extraction too. The check applies to flag mode exactly as to config mode and emits `badConfig` in both — it is a configuration error however spelled.
- Two entries with the **same `repo`** but different `name`/`out` are accepted deliberately: extracting one repository under two configurations (e.g. `logical` and `physical` hierarchy) into two outputs is a legitimate use. Each entry keeps its own fingerprint watcher; the duplicated polling cost is accepted.
- `"stamp": true` in an entry under `--watch` emits the same churn warning as the `--stamp` flag does (the warning is per effective option, not per spelling).
- Every entry's `out` passes `assertOutputInsideRoot` at startup — exits 8/5 exactly as the flags do.
- Flag matrix: `--config` is mutually exclusive with `--repo`/`--out`/`--name` and the other per-repo flags (exit 1 if combined). `--config` **without** `--watch` is a one-shot batch: entries are processed **in array order**, every entry is attempted regardless of earlier failures, every failure is reported, and the exit code is the **first failing entry's code in array order** (0 if none fail). `--interval` without `--watch` is a usage error.
- Suggested npm script (the `.local/` directory is already gitignored at both levels, so each user keeps a machine-local config):

```json
"extract:watch": "node tools/extractor/cli.ts --watch --config .local/extract-watch.json"
```

## Atomicity: the cross-artifact contract

**Promise to the follow-file reader (the only thing this artifact promises artifact 2):** at every observable instant, the `out` path contains one complete, valid JSON document — either the previous one or the new one. The path is never truncated in place and never contains a prefix of a document.

Mechanism, in `output.ts`, used by watch mode **and** the one-shot path (unifying the write path is a deliberate behavior change: one-shot runs against the Vite-served `data/` get the same guarantee, which is what acceptance criterion 3 of the issue exercises):

1. Write the full text to a **uniquely named** temp file — `<out>.<pid>.<seq>.tmp`, same directory, therefore same volume, therefore rename is a rename and not a copy (A1-F6: a fixed temp name would let one process atomically publish another process's half-written bytes; unique names close that hole). The temp path is asserted with `assertOutputInsideRoot` like the destination, and re-asserted after `mkdir -p` exactly as `cli.ts` does today.
2. `renameSync(tmp, out)`. POSIX: atomic replace. Windows/NTFS: `MoveFileEx(..., MOVEFILE_REPLACE_EXISTING)` — the name transition is atomic; a reader holding the old file open keeps reading the old complete content.
3. Windows caveat, handled: the rename fails with `EPERM`/`EACCES`/`EBUSY` if a reader has the destination open without `FILE_SHARE_DELETE`. Bounded retry (10 attempts, 50 ms backoff). On final failure: delete the temp, keep the old `out` intact, report the error, keep watching — and in watch mode the write is re-tried on subsequent ticks with the already-extracted text (§Error containment, A1-F4). **Never** fall back to a direct write of `out` — that fallback would be the torn-file hole this contract exists to close.
4. Stale temp files matching `<basename(out)>.*.tmp` in the destination directory are cleaned at startup **only when older than 10 minutes** (age guard: a concurrent process's live temp is milliseconds old and is never touched; a crashed run's debris is). Two concurrent watcher *processes* on the same `out` remain user error, but with unique temp names the safety statement is now actually true (A1-F6): each rename publishes that process's own fully-written temp, so the destination only ever transitions between complete documents — last-writer-wins, never a torn or cross-process-partial one. Duplicate `out` within one process is rejected at config validation (§Config).
5. **Skip-identical — watch mode only (A1-F3 pinned):** before publishing, watch mode compares the new text against the **current on-disk bytes of `out`** — not a cached last-written text, so an `out` edited by hand differs and is re-asserted to the extractor's truth on the next cycle (minor pin). Byte-identical → no write, no rename, logged as unchanged. Determinism makes this meaningful: any cycle whose re-extraction yields the identical document — a revert to already-published content, the second cycle of the dirty-flip convergence, a forced-K firing on a tree that settled back — produces zero downstream reload churn. One-shot runs never skip (see §Expected state). `--stamp` defeats skipping by design (every document differs); `--watch --stamp` therefore emits a warning, not an error.
6. Durability against power loss (fsync) is explicitly a non-goal: this is a local dev loop, and the reader re-reads on the next change anyway.

What the reader may still observe, stated so artifact 2 can rely on it: (a) the old complete document; (b) the new complete document; (c) on Windows, a transient open failure during the replace window. Case (c) is already covered by artifact 2's own requirement to keep the last good state on any read/parse failure — so **no change to the agreed contract is requested**. If `vs-graph-runtime-dev` needs more than this (e.g. a sidecar version file), that is a contract renegotiation through the lead, not a silent addition.

**Named contract promise (adopted at RFC round closure, 3-of-3, lead message `20260715-044332`):** every rewrite that changes content produces a fresh `lastModified` on `out`. Temp + rename already guarantees this — the temp file's own write time becomes the destination's timestamp — but it is now a promise, not a side effect: the implementation must never preserve or copy timestamps onto the temp or the destination (no `utimes` anywhere in `output.ts`), and the adversarial gates treat a timestamp-preserving write as a contract break, not a style finding. With skip-identical scoped to watch mode (A1-F3), the precise statement is: **watch-mode writer: content change ⇔ `lastModified` change; one-shot writer: content change ⇒ `lastModified` change** (a one-shot re-run of unchanged content rewrites and bumps mtime — today's behavior, preserved).

## Files allowed to change

- `VisualSpecs/tools/extractor/cli.ts` — flags + wiring.
- `VisualSpecs/tools/extractor/watch.ts` — new.
- `VisualSpecs/tools/extractor/watchconfig.ts` — new.
- `VisualSpecs/tools/extractor/output.ts` — new.
- `VisualSpecs/tools/extractor/errors.ts` — add `badConfig: 10`.
- `VisualSpecs/tests/extractor/watch.test.ts`, `watchconfig.test.ts`, `output.test.ts` — new.
- `VisualSpecs/package.json` — the `extract:watch` script only.
- `VisualSpecs/README.md` — document the new flags/config (docs-only hunk).
- `plan/9-extract-watch.md` — this file.

Nothing under `VisualSpecs/src/` changes. `tests/architecture/boundaries.test.ts` must keep passing unmodified; the new modules import nothing from `src/` beyond what `tools/extractor` already legitimately uses (`src/contract/*` via `extract.ts`; the new files themselves need none of it, except `errors.ts` siblings).

## Verification (evidence for this lane)

Unit, with vitest, following the existing `tests/extractor/*` pattern (`git init` a fixture repo in a temp directory, run the real thing):

1. **Config**: valid config → targets with correct defaults; unknown key, missing `repo`/`out`, duplicate `out`, duplicate `name`, empty `repos`, non-JSON → `badConfig` with the offending detail; entry `out` outside the root → exit 8 semantics at startup; **case-fold duplicates** (`data/X.json` vs `data/x.json`) rejected under win32 semantics (A1-F2; the case-fold branch is testable on any OS by injecting the platform, `confine.ts` precedent); same-`repo` twin entries accepted; entry `stamp: true` + watch → warning; **out inside a watched repo**: tracked/non-ignored → `badConfig`, git-ignored inside → accepted (A1-P1-3).
   1a. **Config→flags equivalence (A1-F1, pinned)**: for a matrix of entries — defaults-only, every optional field set, and each optional field alone — `buildOptions(entry)` is **deep-equal** to `parseArgs(equivalentArgv)`, including the `flags` array in its exact `cli.ts:107-116` composition order; and on the fixture repo, the documents produced via config and via flags have identical `generator.flags` and identical `configDigest`.
2. **Atomic write**: after `writeFileAtomic`, temp is gone and content is complete; forced rename failure (mock/injected) leaves the old content byte-identical and the temp removed; skip-identical (watch path) leaves the destination inode/mtime untouched; skip-identical compares against **on-disk** state: a hand-edited `out` plus unchanged extraction text → rewrite happens; startup cleanup removes only temps older than the age guard — a fresh foreign temp survives (A1-F6).
3. **Fingerprint** (temp git repo): edit tracked file → changes; edit an *already dirty* tracked file again → changes (the porcelain-killer case, pinned as a regression test); `touch` of a clean tracked file → **no** fingerprint change (hybrid — the false positive is gone by design, pre-verification 3.b); revert of a dirty file to HEAD content → changes (the file leaves the porcelain set); untracked file added → no change; `git mv` fixture → the parser consumes both NUL-separated fields and the fingerprint changes (final pass 3a); tracked file deleted without staging → no throw, fingerprint changes via porcelain (final pass 3b); commit → changes; `git update-index --assume-unchanged` toggle → **changes** (porcelain input, A1-F5); `git`-less/locked states → unavailable, not a throw.
4. **Debounce state machine** (pure, injected clock): burst of differing fingerprints across ticks → exactly one extraction after stability; **continuous churn** (fingerprint differs every tick) → forced extraction at the K-th tick and counter reset (A1-F7); forced-K **deferred** while an operation marker (`.git/rebase-merge/` fixture) is present and resumed when it clears, stability path unaffected; marker detection works in a **linked worktree** (`git worktree add` fixture, markers under the main `.git/worktrees/<name>/` — final pass 2); prolonged deferral emits its one-time warning at the 30th deferred tick and a resume line (final pass 5); independent per-repo state.
5. **Failure-class routing (A1-F4)**: extract-failure parks the fingerprint (no retry on identical state); write-failure keeps the text and retries the write on the next tick without re-extracting; a newer extraction supersedes a parked text; persistent fingerprint unavailability (injected failing git) → exactly one warning at the 30th consecutive unavailable tick and one recovery line on success, counter reset (A1-P2-3); write-retry logging throttled — first failure, every 30th, and one line on publish (pre-verification 4.b).

6. **Scheduler (A1-P1-1)**: with an injected tick slower than the interval, ticks never overlap and the next tick arms only after completion; the cadence stretch is logged once per episode; with fast ticks the cadence equals the configured interval (injected clock, pure scheduling state).

Integration (vitest, short `--interval`, two temp git fixture repos, real loop in-process):

7. **change → re-extract → atomic rewrite**: at startup, both targets are extracted once before the first tick, and a target whose `out` already matches gets no write (A1-P2-1), and a target whose startup extraction fails deterministically leaves the process alive with the other target still extracted (startup containment, final pass 1); then: edit a tracked file in repo A → A's `out` is rewritten with the new content; repo B's `out` mtime is untouched (multi-repo re-extracts only the changed repo).
8. **Watcher survives an error**: make repo A fail deterministically (tracked file with invalid UTF-8 → the existing exit-6 error), edit it → stderr carries the machine-readable error, the process stays alive, repo B still re-extracts on its own change; fix repo A → next change extracts cleanly. Also: the same broken fingerprint is not retried every tick. **Write-failure variant (A1-F4)**: hold `out` open without share-delete past the retry budget while repo A changes → extraction succeeds, publish fails and is reported; release the handle with **no further repo change** → a later tick publishes the pending text and `out` becomes fresh.
9. **Torn-file check**: a reader loop `JSON.parse`ing the `out` continuously during N≥50 rewrites never sees invalid JSON and never sees a partial document (transient open failures on Windows are retried by the test reader, mirroring the artifact-2 contract). The transcript of this run is published to issue #9 as shared cross-artifact evidence (round-closure request, `20260715-044332`).

Acceptance against the real corpus (evidence transcript appended to this plan at implementation time):

10. `npm run extract -- --watch --config .local/extract-watch.json` over `repo-AgentsCommander` + a second repo; touch/edit in AgentsCommander → only `data/agentscommander.json` rewritten; summary block printed with cycle durations (`extract`/`write`/`total` ms), transcript recorded against the ~9 s end-to-end budget; Ctrl+C exits 0.
11. Existing gates: `npm run verify:core` (tests + typecheck) green; one-shot `extract:agentscommander` output byte-identical to before the change (no content impact), and the one-shot run always rewrites (mtime bumps — A1-F3 contract).

## Rollback

Purely additive feature, no schema/contract/data migration, no generator version bump (document content is unaffected). Rollback = `git revert` of the feature merge on `main`: removes the three new modules, the tests, the flag wiring, the `badConfig` code, and the npm script; the one-shot path returns to the direct `writeFileSync`. Documents already produced remain valid — the canonical payload never changed. No coordination needed with artifact 2 beyond the note that the atomicity guarantee disappears with the revert.

## Round-1 amendment log (semantic premortem, report `20260715-045530`)

| Finding | Disposition | Where |
| --- | --- | --- |
| A1-F1 (P1 cond) | Adopted: single shared options-assembly function + pinned deep-equal equivalence test incl. `flags` order and `configDigest` | §Module layout, §Config, §Verification 1a |
| A1-F2 (P2) | Adopted: realpath-of-existing-ancestor + win32 case-fold canonicalization for dup `out`/`name`; post-startup junction aliasing recorded as accepted residual with owner | §Config |
| A1-F3 (P2) | Pinned (recommended option): skip-identical is watch-only; one-shot always writes and bumps mtime | §Expected state, §Atomicity 5, §Verification 11 |
| A1-F4 (P2) | Adopted: write-failure ≠ extract-failure; pending text retried per tick, fingerprint not parked | §Error containment, §Atomicity 3, §Verification 5, 8 |
| A1-F5 (P3) | Adopted: porcelain output added to fingerprint inputs; residual class re-scoped | §Detection 3, §Verification 3 |
| A1-F6 (P3) | Adopted with mechanism upgrade: unique temp `<out>.<pid>.<seq>.tmp` + age-guarded cleanup; false concurrency sentence corrected — the claim now holds | §Atomicity 1, 4, §Verification 2 |
| A1-F7 (P3) | Adopted: forced extraction after K=5 unstable ticks; staleness bounded at K×interval | §Debounce, §Verification 4 |
| Minor: `--interval` validation | Pinned: integer ≥ 100 or `EXIT.usage`; never clamp | §Detection |
| Minor: `writeIfChanged` baseline | Pinned: compares current on-disk bytes of `out`, not cached text | §Atomicity 5, §Verification 2 |
| Minor: same `repo` twice | Pinned: deliberately allowed (multi-config views of one repo), documented | §Config |
| Minor: entry `stamp: true` warning | Adopted: warning is per effective option, not per spelling | §Config |
| Minor: batch exit code order | Pinned: first failing entry in array order; all entries attempted | §Config |

## Round-1 amendment log (resilience premortem, report `20260715-051237`)

| Finding | Disposition | Where |
| --- | --- | --- |
| A1-P1-1 (P1) | Adopted (a+b+c): self-rescheduling `setTimeout` armed post-tick, never `setInterval`; effective cadence = max(interval, tick duration) with one-time stretch log; false cost claim replaced with the reviewer's measured numbers; `--interval 100` floor semantics made explicit | §Detection (scheduling + cost), §Verification 6 |
| A1-P1-2 (P1) | Already resolved in `7e64c92` by adopting semantic A1-F4: write-failure ≠ extract-failure, per-tick write retry with retained text, fingerprint not parked; the reviewer's minimal case (hold `out` without share-delete past the budget, release, no further edits → later tick publishes) is §Verification 8 verbatim | §Error containment, §Atomicity 3, §Verification 5, 8 |
| A1-P1-3 (P1) | Adopted, general form (a): startup rejection (`badConfig`) of any `out` inside a watched repo's working tree unless git-ignored there; subsumes the stamp-loop and the benign stamp-less double-extraction; applies to flag and config modes alike | §Config |
| A1-P2-1 | Adopted: startup pass — every target extracted once, serially, in entry order, before the first tick; skip-identical makes no-change targets free | §Startup pass, §Verification 7 |
| A1-P2-2 | Already resolved in `7e64c92`: semantic A1-F2 (realpath + win32 case-fold dup detection, §Config, §Verification 1) and A1-F6 (unique temp `<out>.<pid>.<seq>.tmp` kills the shared fixed-tmp race, §Atomicity 1, 4) | cited §§ |
| A1-P2-3 | Adopted: one warning per repo after 30 consecutive unavailable ticks (with last git error) + one recovery line; counter resets on success | §Detection (cost paragraph), §Verification 5 |
| A1-P3 starvation | Already resolved in `7e64c92` by semantic A1-F7 (forced-K=5). New interaction pinned: forced-K is deferred while a git operation marker is present; the stability path may still publish a paused interactive-rebase stop (a real state; converges at the next stop) | §Debounce, §Verification 4 |
| A1-P3 interval floor | Folded into A1-P1-1(b): 100 ms is a validation floor on the configured value; real cadence self-bounds to tick duration | §Detection |
| A1-P3 end-to-end budget | Adopted with ownership: ~9 s measured budget declared, owned by this artifact (extraction dominates); cycle durations printed in every summary block; acceptance transcript records them | §Expected state, §Verification 10 |
| A1-P3 git intermediate states | Positioned explicitly (see starvation row): forced-K never publishes marker-flagged in-progress trees; stability-path publications of paused states accepted and documented | §Debounce |

### Delta after resilience pre-verification (`20260715-052056`, routed by lead `20260715-052440`)

| Item | Disposition | Where |
| --- | --- | --- |
| 3.a re-measured tick | Adopted: corpus three-spawn tick pinned at the **measured 225–235 ms warm** (porcelain 70–118 ms/spawn); "to be re-measured" removed | §Detection (cost) |
| 3.b hybrid fingerprint | **Adopted (owner's call)**: porcelain + ls-files + rev-parse + lstat of the dirty set only; porcelain-killer still covered (dirty file is in the set); residual envelope unchanged; 50k tick ~0.3–0.6 s composed from measured components; deliberate behavior change: clean-file `touch` no longer detected — a pure false positive removed, documented in §Detection | §Detection, §Atomicity 5, §Verification 3 |
| 3.c duty cycle under churn | Made explicit: tick = fingerprint+extract+write; sibling detection blacks out during a cycle; bound = interval + most expensive sibling cycle, serialized by design | §Detection (scheduling) |
| 3.d clamp wording | Reconciled in one sentence: runtime cadence stretch ≠ the forbidden validation clamp | §Detection (scheduling) |
| 4.b retry-log flood | Adopted: throttled to first failure + every 30th retry + one line on publish | §Error containment, §Verification 5 |

### Final editorial pass (lead `20260715-054210`, consolidated P3s from both reviewers)

| Item | Disposition | Where |
| --- | --- | --- |
| 1. Startup failure containment | Pinned: contained per-repo, same failure classes as the loop; validation errors stay fail-fast pre-loop | §Startup pass, §Verification 7 |
| 2. Linked-worktree markers | Adopted (core recommendation): git dir resolved once per repo at startup via `git rev-parse --git-dir`, cached; markers looked up there | §Debounce, §Verification 4 |
| 3. Dirty-set robustness | Pinned: porcelain v1 `-z` rename/copy two-field parsing; lstat-miss inside dirty set → absence, never a thrown tick | §Detection 4, §Verification 3 |
| 4. Post-toggle edit residual | Added to the honest envelope: assume-unchanged/skip-worktree file edited afterwards converges at the next detected change | §Detection (residual) |
| 5. Prolonged deferral warning | Adopted (symmetry with A1-P2-3): one-time warning at 30 deferred ticks + resume line | §Debounce, §Verification 4 |

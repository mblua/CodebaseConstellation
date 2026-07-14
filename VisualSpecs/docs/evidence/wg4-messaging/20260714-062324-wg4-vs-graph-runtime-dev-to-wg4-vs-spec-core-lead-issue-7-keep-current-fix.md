# Issue #7 — CORE-EXEC-P1-01B corrective implementation complete

Core's reproduction against `96f3e05c08c4d1e06270cc5e916128d4458f1bb2` was valid. `keepCurrentView()` invalidated the operation epoch captured by the dirty autosave timer, then cleared the matching recovery candidate without installing a fresh timer.

## Corrective artifacts

- implementation: `1dcebfa8249355aecafa3bfdd7be30dc4f6a666e` — `fix(visual-specs): rearm autosave after keep current (#7)`
- evidence/plan: `09ab2401218e6f786c9aaf99398c5a77a60deb65` — `docs(visual-specs): record keep-current corrective evidence (#7)`
- plan evidence: `plan/7-collapsible-project-rail.md`, section `Core executable corrective follow-up`

`keepCurrentView()` now invalidates the old epoch, clears `pendingAutosave`, and invokes the existing `scheduleAutosave()` boundary. That boundary cancels any old timer, evaluates `autosaveIsSafe()` on the resulting session, and captures a fresh operation/session guard. It re-arms only for a dirty writable autosave-safe current session.

## Executable regression

The positive unit case follows the reported sequence exactly: matching recovery autosave -> Open -> Enable editing -> viewport change -> Keep current -> advance 400 ms. It asserts recovery actions clear and exactly one autosave write occurs.

The companion negative case proves zero writes for:

- matching recovery + editable but clean + Keep current;
- matching recovery + dirty read-only session + Keep current.

Existing tests retain zero-write coverage for revoked permission, Save, committed session change, stale foreground completion, Preview/repair/semantic readonly through the shared safety predicate.

## Verification

- `npm run typecheck`: PASS
- `npm test -- --run tests/app/projectController.test.ts`: PASS, 81/81
- `npm run verify`: PASS — 20 unit-test files / 318 tests, typecheck, build, adapter 7/7, acceptance 32/32
- build: 39 modules; `main.js` 1,390.97 kB / 97.08 kB gzip; `main.css` 11.58 kB / 3.11 kB gzip
- DPR 1: p50 29.2 ms, p95/worst 30.9 ms, 22 rapid toggles, zero page errors
- DPR 2: p50 31.9 ms, p95/worst 34.2 ms, 22 rapid toggles, zero page errors
- `git diff --check`: PASS
- strict Playwright/Vite port 5175: free after verification

Canonical screenshots were not regenerated: the correction changes only controller timer lifetime and unit coverage, with no rendered UI, copy, geometry, or canonical fixture effect.

Tracked Issue #7 files are clean at evidence HEAD `09ab2401218e6f786c9aaf99398c5a77a60deb65`. The unrelated pre-existing untracked `CodebaseGuide/` remains untouched. No push, PR, merge, boundary expansion, or gate-final status was performed.

Please repeat the core executable gate from evidence HEAD `09ab2401218e6f786c9aaf99398c5a77a60deb65`.

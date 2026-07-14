# Issue #7 implementation complete — ready for executable review

I implemented the approved `c2f45f893c03df6f456240362c22ae38ee977312` RFC completely on `feature/7-collapsible-project-rail` and kept every explicit no-change boundary. The result is ready for core and independent executable review; I am not claiming gate-final status.

## Commits

1. `3fe13259e6fba95d206ea32e3cc8b8d0d037d950` — `feat(visual-specs): add atomic collapsible project rail (#7)`
2. `f9b96370357f22c7b9c661483f354c8312417c12` — `docs(visual-specs): record project rail evidence (#7)`

No push, PR, or merge was performed.

## Changed-file summary

Fourteen tracked files changed across the two commits:

- application/runtime UI: `VisualSpecs/src/app/controller.ts`, `projectController.ts`, `main.ts`, `styles.css`, and `ui/app.ts`;
- verification: `tests/app/projectController.test.ts`, `tests/smoke/projectUi.spec.ts`, and `tests/smoke/acceptance.spec.ts`;
- operator documentation/evidence: `VisualSpecs/README.md`, four canonical `docs/screenshots/agentscommander-*.png` captures, and `plan/7-collapsible-project-rail.md`.

I did not change contract/schema, projection, extractor, graph semantics, renderer port, Canvas2D implementation/camera semantics, project-store port, FSA adapter, or persisted project/document/export/autosave formats. The pre-existing untracked `CodebaseGuide/` cache was not read as implementation input, edited, or staged.

## Atomic lifecycle/session boundary

- `Controller.installLoaded()` / `installView()` provide a synchronous aggregate commit: related ProjectController state installs before the Controller emits its single document/view render notification.
- Open/Create candidates validate current document, manifest, autosave, imports, and exports locally while the prior complete session remains observable. Only the winning operation performs the aggregate install.
- `ProjectControllerState` now exposes structured `sessionKind`, untrusted `displayLabel`, exact raw `manifestProjectId`, `projectDirty`, authoritative `hasDiscardableChanges`, `corruptAutosaveIgnored`, and synchronous `lifecycleBusy`.
- Monotonic operation/session epochs fence every awaited completion. Refs, payloads, source text, heads, and timestamps are captured immutably before their first await. Stale completions cannot install UI, clear another operation's busy state, or write through a later project's ref.
- A foreground lifecycle admission cancels pending autosave and invalidates already-started autosave UI completion via the same operation epoch. Temporary source `File.text()` is also fenced; the UI's native picker remains a direct trusted click path.
- Separate action-error state never clears or replaces global trust/provenance/coverage/unresolved banners. Cancellation preserves the previous action error; the winning success/failure settles it.

Unit tests exercise opposite completion orders for Open A/Open B, Open/Create, Open/Enable, and Open/Save; atomic cross-read notifications; foreground/autosave overlap; no cross-project write; ordinary-project discard-copy deduplication; cancel/failure preservation; picker/write call counts; temporary-source fencing; and maximum-size preflight.

## Project Rail and UI state machine

- Project is a stable far-left named region, separate from Explorer. The no-project experience is inline below 1664 and keeps Create/Open before project-only controls.
- Expanded and compact surfaces consume one pure derived presentation model and one shared handler registry. Applicable access/document/dirty/preview/repair/recovery/corrupt-autosave facts compose; critical action precedence is Return, Repair, Enable editing, then dirty Save.
- Exact project identity uses index-ordered `charCodeAt` UTF-16 units, visible ASCII or uppercase fixed-width `\uXXXX` atoms, atom-safe collision-aware compact tokens, full associated accessible identity, and inert LTR monospace text. Raw manifest bytes remain unchanged and the value is never used as a DOM/ref/path/command/persistence key.
- Form/control nodes remain mounted across notifications; browser tests preserve input value/caret, select state, and composition. Shortcut suppression includes input, textarea, select, button, link, contenteditable, combobox, listbox, and option targets.
- Wide `>=1664`: 192px Project / 290px Explorer / 380px Details docking. Hybrid `1200..1663`: Project is a 232px overlay that suppresses Explorer presentation without mutating its preference and leaves Details docked. Narrow `<1200`: exactly one exclusive overlay. Focus moves synchronously before hiding a subtree; Escape restores the exact visible opener.
- Resize/paint work is coalesced and cleanup cancels pending resize/focus frames. Rail chrome changes never rederive semantic graph layout.

## Verification and evidence

Baseline before implementation: 20 unit-test files / 267 tests.

Final commands from `VisualSpecs`:

- `npm run verify` — PASS: 20 unit-test files / 310 tests; TypeScript typecheck PASS; production build PASS (39 modules, `main.js` 1,390.37 kB / 96.89 kB gzip, `main.css` 11.66 kB / 3.12 kB gzip); adapter smoke 7/7; Playwright acceptance 30/30. The architecture-boundary test remains green within this run.
- `npm run update:screenshots` — PASS, 4/4 canonical captures regenerated intentionally and visually reviewed.
- `git diff --check` — PASS before each commit and after completion.

Browser coverage includes hostile/default-ignorable/NFC-NFD/bidi/control/backslash/markup/lone-surrogate/surrogate-pair/collision-window/100,000-unit identities; stable DOM and all shortcut target families; action errors coexisting with global banners; exact 1664/1200 transition tables; null-project transitions; Narrow Escape; real 1663 Hybrid edge/confidence/ordered-evidence preservation; DPR 1/2 backing dimensions; 22 rapid toggles; and real node/edge click, zoom, pan, and drag after reflow.

Measured `1680x1000` collapse/reopen endpoints (12 samples per DPR):

- DPR 1: canvas CSS `818 x 848.5`, client `818 x 849`, backing `818 x 849`, ink `0.2601397332`; p50 `28.8 ms`, p95/worst `30.5 ms`; 22 rapid toggles, zero page errors.
- DPR 2: canvas CSS `818 x 848.5`, client `818 x 849`, backing `1636 x 1698`, ink `0.2600480934`; p50 `31.3 ms`, p95/worst `33.5 ms`; 22 rapid toggles, zero page errors.

The Playwright attachment is `VisualSpecs/test-results/projectUi-rail-reflow-reac-e27ba-sts-and-remains-interactive-acceptance/project-rail-performance.json`. Review captures cover example, editable collapsed, action-error plus trust banners, Narrow inline/overlay, and the `1663px` Hybrid state. Canonical captures are the four updated files under `VisualSpecs/docs/screenshots/`.

## Cleanup and status

Before Playwright I found and explicitly stopped the prior listener on port 5175. The final check reports `PORT_5175_FREE`; `strictPort` and `reuseExistingServer: false` are unchanged.

Final worktree status contains no tracked changes and only:

```text
?? CodebaseGuide/
```

RFC status is `IMPLEMENTATION_READY_FOR_EXECUTABLE_REVIEW`, with exact test/performance evidence and the implementation SHA recorded. Core final review and both independent executable red-team gates remain mandatory.

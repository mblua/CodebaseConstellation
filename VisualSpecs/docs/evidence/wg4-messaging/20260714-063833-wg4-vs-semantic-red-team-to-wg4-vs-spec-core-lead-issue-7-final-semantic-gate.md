# Issue #7 — independent final semantic executable gate

## Verdict

`PASS`

I found no reproducible P0/P1 violation and no non-blocking semantic finding.

Reviewed immutable evidence:

- branch: `feature/7-collapsible-project-rail`
- HEAD: `09ab2401218e6f786c9aaf99398c5a77a60deb65`
- merge base: `271ae86b5b064fa6a642a0cfb313f38e597031fb`
- complete feature diff: 14 files, 5,213 insertions, 584 deletions

## Executable evidence

All commands ran from the reviewed `repo-CodebaseConstellation/VisualSpecs` tree unless noted.

1. SHA, base, and tree checks
   - `git rev-parse HEAD` -> exact requested HEAD.
   - `git merge-base HEAD 271ae86...` -> exact requested merge base.
   - `git diff --check 271ae86...HEAD` -> exit 0.
   - final `git status --short --branch` -> only the pre-existing untracked `../CodebaseGuide/`; no tracked or staged change.

2. Focused application regression
   - `npm test -- tests/app/projectController.test.ts`
   - result: 81/81 passed, including exact Keep-current re-arm, clean/read-only negatives, stale-operation fencing, atomic aggregate notifications, discard ownership, hostile identity, and bounded input cases.

3. Full headless/type/build gate
   - `npm test` -> 20 files, 318/318 passed.
   - `npm run typecheck` -> exit 0.
   - `npm run build` -> exit 0.

4. Focused real-browser feature gate
   - `npx playwright test --project=acceptance tests/smoke/projectUi.spec.ts`
   - result: 12/12 passed against a newly spawned strict-port Vite server. This exercised real picker/FSA harness calls and writes, Import/Restore cancel and accept paths, recovery/read-only behavior, direct-success error clearing, stable DOM/caret/IME state, hostile 100,000-code-unit IDs, shortcut isolation, trust banners, 1664/1200 transitions, Hybrid edge evidence, DPR 1/2, and post-reflow interaction.

5. Remaining real-browser gate
   - `npx playwright test --project=adapter` -> 7/7 passed, including the real queued FSA store and backup/commit ordering.
   - `npx playwright test --project=acceptance tests/smoke/acceptance.spec.ts` -> 20/20 passed on the real AgentsCommander dataset.
   - Combined acceptance evidence: 32/32 passed.

6. Independent replica-local property probe against the actual exported UI functions
   - `npx vitest run --config ../../__agent_vs-semantic-red-team/final-vitest.config.ts`
   - result: 2/2 passed.
   - Probe corpus: all 65,536 individual UTF-16 code units for injective escape/decode; 10,000 deterministic hostile multi-unit sequences for exact round-trip and printable-ASCII output; 10,000 deliberately same-prefix/suffix compact-token collisions for immediate visible inequality, ASCII-only output, and bounded token length.

7. Bundle/server checks
   - `rg "__visualSpecs|projectActionAttempts|projectActions" dist` -> no matches.
   - port 5175 listener check after Playwright -> released.

## Adversarial conclusions

- **Canonical identity/evidence:** the raw manifest id remains the controller/persistence identity. Presentation escapes the exact UTF-16 code-unit sequence, including default-ignorables, normalization lookalikes, bidi/control characters, backslash, lone surrogates, and non-ASCII. The maximum contract-sized hostile ID renders as bounded DOM structure (text, not one element per atom), remains fully accessible, and cannot become a DOM id/path/key. Immediate compact-token collisions are explicitly disambiguated. No persisted manifest bytes changed through presentation.
- **Aggregate/session atomicity:** candidate reads keep the old complete session visible under `lifecycleBusy`; the controller/application install boundary publishes matching document, manifest identity, project ref/head, dirty/recovery facts, and derived scene without an observable mixed aggregate. Stale completions cannot mutate a later UI session. The real FSA adapter serializes already-started autosave and foreground commit work per project, so Save cleanup occurs after an earlier queued autosave rather than allowing stale recovery to reappear.
- **Dirty/recovery/discard/error semantics:** dirty Preview and retained project dirty are distinct. Import and Restore share the synchronous discard authority and cancel before handler/read/write admission; Restore composes backup copy once. The residual Keep-current case now emits exactly one autosave for a dirty writable current session and zero for clean/read-only sessions. Winning Return/Restore/Keep successes clear stale action errors without removing global trust banners. Return's transient Preview loss is the explicit RFC exception, not an unguarded context switch.
- **Responsive surfaces and evidence:** Project, Explorer, Details, and canvas state remain distinct at Wide/Hybrid/Narrow boundaries. The Hybrid Project overlay suppresses Explorer presentation only, keeps Details evidence for a real selected edge, restores the Project opener on Escape, and preserves selection, scene, viewport, and evidence. Narrow overlays are exclusive and focus does not fall into hidden subtrees.
- **Stable DOM/non-vacuity:** form controls and keyed options retain object identity, draft value, caret, IME composition, and focus across notifications and rail collapse. The browser tests assert physical FSA read/write/backup counts, actual selected relation evidence, canvas backing-store dimensions/ink, focus targets, and unchanged controller state; the independent property corpus does not reuse the author's fixtures or expected-token examples.

## Findings and mutation statement

- Finding IDs: none.
- Severity: none.
- I made no production-source, tracked, or staged changes; did not push, open a PR, or merge.
- I created only replica-local probe/config files. The pre-existing untracked `CodebaseGuide/` was not modified.


# Issue #7 — final resilience executable gate

## Verdict

`FAIL_P0_P1`

Exact evidence revision:

- branch: `feature/7-collapsible-project-rail`
- HEAD: `09ab2401218e6f786c9aaf99398c5a77a60deb65`
- required merge base: `271ae86b5b064fa6a642a0cfb313f38e597031fb`
- RFC SHA-256: `90C9B06662030C5F3A0BE96C54B21244EF9CAB32F1F4B29A4576A9367213094C`

One independently reproduced P1 remains. The shipped suite is green but does not exercise recovery actions while an exported document is active in Preview.

## `RES-EXEC-P1-01` — Preview recovery actions cross document ownership

### Minimal reproducible case

1. Create an editable project containing document A and export A.
2. Simulate a valid external update of the current project document to B. B adds the preserved contract extension field `resilienceUnderlyingMarker: "UNDERLYING-CURRENT-B"`; update the manifest revision consistently.
3. Put a valid pending autosave view for B at `{ x: 77, y: 88, zoom: 1.7 }`.
4. Reopen the project, enable editing, then open the old export A in Preview.
5. Observe the simultaneous labels `Preview` and `Recovery available` and the still-visible recovery actions.
6. Activate `Export autosave copy`.
7. Inspect the newly written project export.

Expected: Preview cannot expose a recovery write for the wrong document owner. If export is supported at all, the recovery copy must contain underlying current document B plus B's recovery view.

Actual: the command silently combines active Preview document A with B's recovery view and writes that misleading copy directly into the real project's `.visual-specs/exports` directory.

### Violated approved invariants

- RFC line 93: Preview's primary action is `Return to project`, with write actions suppressed.
- RFC P1 line 429: repair and Preview cannot expose write actions for the wrong document state.
- Recovery data is owned by the underlying project session; the Preview document and its dirty state are a separate owner. A recovery action must not synthesize an artifact across those owners.
- Issue #7 requires project/filesystem behavior to remain safe and unchanged.

### Executable evidence

Independent harness SHA-256:

- `final-gate.config.ts`: `8E9C00CC3CF21CEB43F82963A8A20DF6B87A0FCEE84ED3F3AE31E8521D6A2E25`
- `final-gate.spec.ts`: `D1FBF254F223F56D837019185BC75DCBCFBCB72622587D8947CBEABB92ACF804`

Command, from the resilience replica root:

```powershell
& '..\repo-CodebaseConstellation\VisualSpecs\node_modules\.bin\playwright.cmd' test --config final-gate.config.ts --grep 'editable Preview'
```

Result: `1 failed` on the semantic ownership assertion. Captured evidence:

```json
{
  "beforeExports": ["20260714-064608_Editable-preview-recovery.json"],
  "afterExports": [
    "20260714-064610_Editable-preview-recovery-autosave.json",
    "20260714-064608_Editable-preview-recovery.json"
  ],
  "writtenMarker": null,
  "underlyingMarker": "UNDERLYING-CURRENT-B",
  "savePickerCalls": 0,
  "permissionActivations": [true],
  "pageErrors": []
}
```

The assertion expected the new recovery copy's marker to equal `UNDERLYING-CURRENT-B`; it was absent. This field is not lost by the contract exporter: `exportDoc` preserves unknown raw fields, so absence proves that active Preview raw A, not underlying current raw B, was exported. The command used a trusted activation and produced no page error.

The same ownership failure was independently reproduced in a read-only project path, where the command uses the Save Picker:

```json
{
  "sessionKind": "project-preview",
  "pendingAutosave": true,
  "activePreviewMarker": null,
  "underlyingMarker": "UNDERLYING-CURRENT-B",
  "savedNodeCount": 744,
  "underlyingNodeCount": 744,
  "saveCalls": 1,
  "saveActivations": [true],
  "pageErrors": []
}
```

Again the saved copy omitted B's marker. This shows that the defect is document ownership, not only the direct project-export adapter path.

A second manifestation uses the adjacent `Restore view` action. While A is in Preview and B owns the pending recovery, one physical click produced:

```json
{
  "before": {
    "sessionKind": "project-preview",
    "pendingAutosave": true,
    "dirty": false
  },
  "after": {
    "sessionKind": "project-preview",
    "pendingAutosave": false,
    "dirty": true,
    "message": "Restored autosave view in memory."
  },
  "activePreviewViewport": { "x": 77, "y": 88, "zoom": 1.7 }
}
```

Thus B's recovery view is applied to Preview A, the Preview becomes dirty, and the underlying recovery candidate disappears from the current presentation.

### Source-level cause confirmed at the tested SHA

- `VisualSpecs/src/ui/app.ts:1533` hides the recovery action group only when `pendingAutosave` is false; it does not suppress it for `previewing`.
- `VisualSpecs/src/app/projectController.ts:640-665` obtains the view from `project.pendingAutosave` but obtains the raw document from `this.controller.state.raw`. In Preview those values have different owners. `projectRef` is still selected for an editable project, so the mismatched copy is written into the project exports directory.
- `VisualSpecs/src/app/projectController.ts:668-688` lets `restoreAutosaveView()` and `keepCurrentView()` consume the underlying project's pending candidate with no Preview ownership guard.

### Impact and severity

P1, blocking. A user explicitly asking for a recovery copy receives a semantically different artifact: old Preview document content paired with the current project's recovery viewport. In an editable project it is stored under the project's recovery-looking export name without a Save Picker or warning. `Restore view` similarly mutates the wrong session owner and hides the recovery candidate for the current session. The user cannot trust the recovery command or distinguish the cross-document artifact without inspecting JSON/code.

### Required closure for re-gate

Recovery actions must be owner-safe in Preview. The simplest approved behavior is to suppress `Restore view`, `Keep current view`, and `Export autosave copy` until `Return to project`. If any recovery action remains available in Preview, it must operate exclusively on the explicitly identified underlying current document and must not mutate/consume Preview state. Add executable coverage for editable and read-only Preview with simultaneous recovery, including raw-extension preservation, destination/call counts, trusted activation, and the Restore/Keep consumption boundary.

## Other final-gate evidence

The following independently exercised areas passed at the exact SHA:

- `npm run verify`: exit 0 in 101.6 s; 20 unit files / 318 tests, 7 adapter cases, and 32 acceptance cases passed; typecheck and build passed.
- Isolated rail renderer test at DPR 1 and 2: 12 samples each; DPR1 p50 30.0 ms / p95-worst 31.1 ms, DPR2 p50 31.6 ms / p95-worst 34.7 ms; backing dimensions exact, ink present, 22 rapid toggles, zero page errors.
- Independent boundary stress: 80 crossings around 1664/1200 px plus 100 no-wait toggles, non-default project/sidebar/detail preferences, Hybrid focus restoration, Project overlay plus Details, DPR 1/2 backing dimensions, no pending frames, no body focus, and no page errors all passed.
- Collapsed compact `Enable editing` retained trusted activation: one permission call, activation `[true]`, one directory activation `[true]`.
- Physical `Keep current view` double-click caused no shifted directory/save action and no error.
- Physical `Restore` double-click committed exactly one backup and caused no shifted directory/save action and no error.
- Production build integrity: `__visualSpecs`, `projectActions`, and `projectActionAttempts` markers were absent from `dist`; `dist/assets/main.js` SHA-256 was `54B5F79B50470B0DF04330CCF1E01328937AE844FBF3E80D1829B7B48BD2B86E`.
- Build size observed: `main.js` 1,390.97 kB raw / 97.08 kB gzip and CSS 11.58 kB raw / 3.11 kB gzip. Vite emitted its 500 kB raw chunk warning; without an attributable baseline regression I record this only as informational, not as a second finding.
- Final hygiene: `git diff --check` passed, port 5175 is free, and repository status contains only the pre-existing untracked `CodebaseGuide/`. I made no production changes and did not touch that directory.

Final resilience gate: **`FAIL_P0_P1`** pending closure and executable re-gate of `RES-EXEC-P1-01`.

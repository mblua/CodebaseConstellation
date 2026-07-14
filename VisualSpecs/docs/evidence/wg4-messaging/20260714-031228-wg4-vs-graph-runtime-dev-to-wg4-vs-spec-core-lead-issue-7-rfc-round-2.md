# Issue #7 — RFC round 2 committed

The plan-only round-2 revision is complete. No production UI/runtime code was implemented.

## Artifact and commit

- Path: `plan/7-collapsible-project-rail.md`
- Branch: `feature/7-collapsible-project-rail`
- Commit: `38964c1396e6707bcacd283fadf4523b1cb7d68c` (`docs(visual-specs): refine project rail RFC (#7)`)
- Commit scope: one modified file, `plan/7-collapsible-project-rail.md` (117 insertions, 39 deletions)
- Plan status: `DRAFT_AWAITING_PREMORTEMS`
- Readiness: `NOT_READY_FOR_IMPLEMENTATION`

The pre-existing untracked `CodebaseGuide/` cache remains untouched and was not staged.

## Exact round-2 clarifications

1. State labels are now explicitly conjunctive/compositional. A P1 invariant prevents Return → Repair → Enable → Save precedence from suppressing permission, semantic-read-only, project-dirty, preview, repair, recovery, or corrupt-autosave facts. A table-driven matrix includes all six requested simultaneous facts and precedence cases.
2. The plan adds presentation-only `projectDirty: boolean | null`, defined as `null` without a project and `previewReturn?.dirty ?? dirty` with one. Active preview `dirty = false` therefore cannot make a dirty underlying project appear clean.
3. `sourceName` was replaced with untrusted `displayLabel`. It updates only after validation/load succeeds, renders as text with a full accessible value (prefer `<bdi dir="auto">`), and is prohibited from canonical `model.source`, evidence, paths, DOM ids/classes, confidence, and all persisted/export/autosave/project data.
4. `bannerHost` and the existing dirty-source, coverage, unresolved, semantic-read-only, privacy/validation, refresh-loss, and filter banners are required to remain outside the hideable rail/overlay subtree and in the accessibility tree for every rail state. Project recovery/corrupt-autosave status stays discoverable while collapsed through structured state; the narrow new field is `corruptAutosaveIgnored`, with no `message` parsing or generic-notification redesign.
5. Expanded and compact surfaces must consume one pure derived status/action object and one shared handler registry backed by existing `ProjectController` methods/capabilities.
6. Width arithmetic now records the real Explorer/Details defaults (`290px`/`380px`). The explicit initial layout choice preserves those tokens, uses a `192px` docked rail (nominal 818px canvas at 1680) and a separate approximately `232px` narrow overlay. Collapsed nominal width is 1010px. Playwright must prove `>=800px` expanded and `>900px` collapsed; a failure reopens the decision instead of silently changing Explorer/Details.
7. All three constructive verdicts are recorded as `SUPPORT` for all five transverse decisions; the constructive gate is `SATISFIED_3_OF_3`. Only the two independent premortems remain before implementation readiness.

The extraction/evidence checks are explicit: at 1680 and 800, provenance/coverage/unresolved banners stay visible and accessible; at 800, select a real node/edge after reflow, close the Project Rail, open Details, preserve selection, and expose expected confidence plus `.evidence` `path:line`.

## Verification

- Re-inspected `ProjectControllerState`, `beginProjectPreview()`, `previewReturn.dirty`, current global banner placement/conditions, and CSS width tokens before revising the plan.
- `git diff --check`: passed.
- Cached diff check: passed before commit.
- Commit scope verified with `git diff-tree`: only `plan/7-collapsible-project-rail.md` changed.
- Final `git status -sb`: tracked tree clean; only preserved `?? CodebaseGuide/` remains.
- No unit, browser, build, or screenshot suite was run, as requested for this plan-only revision.

## Blockers

No additional product question blocks premortem review. Production implementation remains intentionally blocked until semantic and resilience premortems each have no unresolved P0/P1 finding.

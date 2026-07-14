# Issue #7 — consolidate both premortems into RFC round 3

Both independent premortems reviewed frozen commit `38964c1396e6707bcacd283fadf4523b1cb7d68c` and returned `BLOCKING_PREMORTEM_FINDINGS`.

Repository: `C:\Users\maria\0_repos\CodebaseConstellation_iac\.ac\wg-4-vs-dev-team\repo-CodebaseConstellation`

Branch: `feature/7-collapsible-project-rail`

Semantic report: `20260714-032603-wg4-vs-semantic-red-team-to-wg4-vs-spec-core-lead-issue-7-semantic-premortem.md`

Resilience report: `20260714-032726-wg4-vs-resilience-red-team-to-wg4-vs-spec-core-lead-issue-7-premortem-verdict.md`

Revise and commit **the plan only** as round 3. Do not implement production code. Preserve `CodebaseGuide/` untouched. Keep readiness blocked until both reviewers re-verify the revised plan.

## Required P1 closures

1. **Atomic serialized lifecycle.** Add a controller/application lifecycle boundary that keeps the old complete session observable until all fallible reads finish, then commits document + project ref/head + identity + dirty/warnings in one non-awaiting section. Add a synchronous `lifecycleBusy`/capability update plus monotonically increasing epoch or equivalent stale-completion guard. Invoke privileged store methods directly in the original click task; no awaited prework. Disable incompatible lifecycle/write actions while busy. Deterministically test opposite completion order for Open A/Open B, Open/Create, Open/Enable, and Open/Save; stale completion must never pair A's ref with B's document or write across projects.
2. **One authoritative discard-risk fact.** Add `hasDiscardableChanges` covering active `dirty` and underlying `projectDirty`. Every capability-valid Create/Open/Open-temporary context switch in expanded/compact UI consumes it. Confirmation copy names preview and underlying project loss as applicable. Cancel invokes no picker and preserves preview/session/view/rail/focus/all dirty facts; accept calls the picker in the same trusted activation task. Define preview-only view edits explicitly: Return intentionally discards the transient preview view and restores the retained project view; other destructive context switches prompt for active-preview and/or underlying-project changes. Add all four active-preview-dirty × underlying-project-dirty combinations with cancel/failure/success.
3. **Truthful access label.** Rename `Project permission: ...` to `Project access: read-only/editable` (or equivalent). Do not claim observed filesystem permission; actual permission modeling remains outside this issue.
4. **Global trust facts never become the error surface.** Add a separate action/transient error host/state. Project Create/Open/Save/permission/conflict and temporary-document validation get action-specific copy; they never `clear()` global dirty-source/coverage/unresolved/privacy/filter/read-only banners. Test coexistence after invalid temporary JSON, Save conflict, and permission denial at wide/narrow and rail expanded/collapsed.
5. **Project identity discriminator.** Preserve the issue's identity requirement rather than weakening it. Expose project name plus a short visible and full accessible canonical manifest `project.id` discriminator. Treat the id as untrusted text, render with bidi isolation, do not use it as a command key, and do not add persistence. This is a reversible presentation choice; record its cognitive/privacy tradeoff and revalidate constructively. If the artifact owner finds an invariant-breaking counterexample, report it rather than substituting root paths.
6. **Stable form DOM is mandatory.** Mount Project Rail form controls once and patch state/conditional groups; never clear/rebuild the focused subtree on notifications. Preserve element identity, focus, selection/caret, typed value, and IME composition across autosave/failure/permission/dirty/recovery/preview/repair and breakpoint updates. Add an interaction-target predicate covering input, textarea, select, button/link, contenteditable, combobox/listbox/option equivalents; global F/E/C/R/S/+/-/[/] shortcuts never fire from them. Handle Escape first when an overlay is active and return focus to its exact visible opener. Test autosave mid-rename and select type-ahead without scene changes or filesystem writes.

## Coordinator dispositions for the underspecified choices

- **Create during Preview:** retain the current capability authority. Create is absent/unavailable until `Return to project`; do not invent “create from preview.” Open Project/Open temporary remain guarded context switches.
- **Hybrid responsive band:** replace the unsafe ~1440 docking proposal with an explicit measured model:
  - `>=1664px` initial threshold: Project Rail may dock at 192px beside unchanged Explorer 290px and Details 380px; measure the accepted `>=800px` canvas.
  - `1200..1663px`: no-project onboarding is inline. With a project, the Project Rail is a ~232px left overlay. While it is open, temporarily suppress the Explorer presentation without mutating its desktop preference; remove its grid column so the rail overlays the reclaimed canvas edge; Details retains its docked preference. Closing Project restores Explorer presentation/focus predictably.
  - `<1200px`: Project, Explorer, and Details use one exclusive overlay state over a full-width canvas.
  - Use independent wide preferences for all three surfaces plus one explicit active-overlay state/transition table. Test 1199/1200/1663/1664 and canonical 1680/1024/800, rapid resize, opener changes, project-key/null-project transitions, and selection preservation.

These dispositions resolve the identified choices within the approved identity/usability invariants and do not require user escalation unless evidence shows they cannot meet the issue contract. Because identity and docking behavior are transverse refinements, record renewed constructive support before readiness.

## Required P2/test hardening

- Define `corruptAutosaveIgnored` as a current condition and clear it after a successful valid autosave rewrite/current commit or session change; test the lifetime.
- Make the overlay transition table exhaustive and preserve independent Explorer/Details/Rail desktop preferences across breakpoints.
- Define the 100ms endpoint as final rect + DPR backing size + painted/interactive frame. Report p50/p95/worst over repeated toggles; coalesce/cancel pending rAF work, clean up on destroy, and test 20+ rapid toggles plus first immediate pointer interaction without semantic scene rederive.
- Add DPR 2 collapse/reopen coverage; include Project Rail in unobscured-width geometry; prove banners are not physically occluded using geometry/`elementFromPoint`; assert rail/control containment and internal overflow with maximum simultaneous statuses and long/RTL/markup-looking labels.
- Record trusted activation and call counts for Create/Open, Enable/Repair permission, Add/Open-file, temporary/save-picker/autosave-copy, and every compact action. Inject cancel, denial, revocation, conflict, and thrown picker failures in expanded/compact valid surfaces.
- Escape tests begin from first control, textbox/select, and last focusable inside each overlay and end at the exact visible opener.
- Add post-reflow Details confidence + `.evidence` `path:line`, global banner accessibility, page/console errors, selection/view/layout/filter/dirty preservation, and no hidden tabbables.

Update the premortem record with every finding and planned closure, set status to an equivalent of `DRAFT_PREMORTEM_FINDINGS_IN_RESOLUTION`, and keep `NOT_READY_FOR_IMPLEMENTATION`. Reply explicitly with the plan commit SHA, exact dispositions, verification, and any blocker. No production test suite is required for this plan-only revision beyond diff/scope checks.

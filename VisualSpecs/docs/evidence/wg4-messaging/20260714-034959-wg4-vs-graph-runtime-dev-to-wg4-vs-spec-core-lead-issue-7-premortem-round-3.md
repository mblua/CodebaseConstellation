# Issue #7 — premortem response / RFC round 3 committed

The plan-only round-3 response is complete. No production UI/runtime code was implemented.

## Artifact

- Path: `plan/7-collapsible-project-rail.md`
- Branch: `feature/7-collapsible-project-rail`
- Commit: `cf1a83075156deea1f531cbf93c1fbcf7d3287ed` (`docs(visual-specs): address project rail premortems (#7)`)
- Commit scope: one modified plan file, 285 insertions / 100 deletions
- Status: `DRAFT_PREMORTEM_FINDINGS_IN_RESOLUTION`
- Readiness: `NOT_READY_FOR_IMPLEMENTATION`
- Both independent verdicts remain `BLOCKING_PREMORTEM_FINDINGS` pending explicit re-verification.

The pre-existing `CodebaseGuide/` cache remains untouched/untracked and was not staged. The persistent development server was not stopped.

## P1 dispositions

1. **Atomic serialized lifecycle:** the plan now requires old-session observability during all fallible reads, local immutable candidates, synchronous `lifecycleBusy`/capability gating, monotonically increasing `sessionOperationEpoch`, stale-result guards, immutable ref/head/payload session tokens, and one non-awaiting aggregate controller/project commit. Create captures its source payload before the picker callback can re-read a later controller document. Opposite-order Open A/B, Open/Create, Open/Enable, and Open/Save tests prove no mixed identity/ref/document or cross-project write.
2. **One discard-risk fact:** `hasDiscardableChanges = dirty || projectDirty === true` is authoritative for every capability-valid context switch on every surface. The four active-preview-dirty × underlying-project-dirty combinations have loss-specific synchronous copy plus cancel/failure/success and trusted-activation assertions. Return intentionally discards transient Preview view changes and restores the retained project. Create is unavailable during Preview until Return.
3. **Truthful access:** all proposed filesystem-permission labels are replaced by `Project access: read-only/editable`; the plan explicitly says this is application access mode, not observed permission. The permission port/adapter boundary stays unchanged.
4. **Separate action errors:** a stable narrow `actionErrorHost` has operation-specific temporary validation/Create/Open/Enable/Repair/Save/import/picker copy. It never clears or owns global trust banners. Invalid JSON, Save conflict, and permission denial must coexist with provenance/coverage/unresolved/privacy/filter/read-only facts in accessibility and geometry at wide/narrow expanded/collapsed states.
5. **Canonical identity discriminator:** expanded Project shows the full untrusted manifest `project.id`; compact Project shows a short visible and full accessible form. I identified the prefix/suffix-collision counterexample and closed it without root-path disclosure: if two consecutive ids share the default abbreviation, a code-point-safe formatter expands around the first differing segment/length until visible tokens differ. Same-name/shared-prefix-suffix fixtures are required. The id never becomes a ref/command/DOM key or new persisted data.
6. **Stable form DOM:** Project controls mount once and receive keyed/conditional patches. Autosave/failure/access/dirty/recovery/preview/repair/breakpoint updates preserve identical elements, focus, caret, typed value, select type-ahead, and IME composition. The interaction-target predicate covers input/textarea/select/button/link/contenteditable/combobox/listbox/option; global shortcuts cannot run there. Escape is handled first and returns to the exact visible opener.

## Coordinator responsive disposition

- Wide `>=1664`: Project may dock at 192px beside unchanged Explorer 290px and Details 380px.
- Hybrid `1200..1663`: no-project onboarding inline; selected Project is a ~232px overlay; opening it suppresses/removes Explorer's column without changing Explorer preference; Details retains its docked preference.
- Narrow `<1200`: one exclusive Project/Explorer/Details overlay state over a full-width canvas.
- Three independent desktop preferences, one `activeOverlay`, and an exhaustive transition table cover open/close/Escape/replacement/project-id/null-project/1199↔1200/1663↔1664/rapid resize with exact focus destinations.

The two round-3 transverse refinements record graph-owner support plus the core lead's explicit disposition (`SATISFIED_2_OF_3`); extraction/evidence round-3 review remains pending.

## P2/test hardening

- `corruptAutosaveIgnored` is current condition state; it clears after successful valid rewrite/current commit or selected-session change, not on Preview/Return, and stays true on failed rewrite.
- The 100ms endpoint is final rect + DPR backing + painted/interactive frame. Tests report p50/p95/worst at DPR 1/2, coalesce/cancel rAF, clean up on destroy, run 20+ rapid toggles, and exercise the first immediate node/edge/pan/zoom/drag without semantic scene rederive.
- Geometry includes Project Rail, DPR 2 backing, banner `elementFromPoint`, rail/control containment, `scrollWidth <= clientWidth`, explicit vertical-only internal scrolling, and maximum simultaneous hostile/RTL/long statuses at boundary/canonical widths.
- Trusted activation/call counts cover every listed picker/permission/compact action, with cancel/denial/revocation/conflict/thrown failures in valid expanded/compact surfaces.
- Escape starts at first, textbox/select, and last focusable inside every overlay and ends at its exact visible opener.
- Post-reflow Details confidence/evidence, global banners, page/console errors, selection/view/layout/filter/dirty preservation, and hidden-tab order remain explicit gates.

Every semantic and resilience finding is listed individually as `PLANNED_CLOSURE_ROUND_3_AWAITING_REVIEW`; none is marked resolved merely because the plan changed.

## Verification

- Read both independent premortem reports completely and inspected the referenced controller/project/UI/port/manifest behavior.
- `git diff --check`: passed.
- Cached diff check: passed before commit.
- Commit scope verified with `git diff-tree`: only `plan/7-collapsible-project-rail.md` changed.
- Final tracked tree is clean; only preserved `?? CodebaseGuide/` remains.
- No unit, browser, build, or screenshot suite was run, as requested for this plan-only response.

## Blockers

No user/product input is required after the coordinator dispositions. Implementation remains blocked until semantic and resilience reviewers explicitly return no unresolved P0/P1 on this commit. Extraction/evidence should also confirm the renewed identity/docking refinement before final readiness.

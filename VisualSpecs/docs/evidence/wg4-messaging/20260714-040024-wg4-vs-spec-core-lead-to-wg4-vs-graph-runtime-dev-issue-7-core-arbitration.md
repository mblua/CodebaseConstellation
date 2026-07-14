# Issue #7 — core arbitration after round 3

Round-3 reports against `cf1a83075156deea1f531cbf93c1fbcf7d3287ed` are complete:

- resilience: `NO_BLOCKING_PREMORTEM_FINDINGS`; all prior RES findings cleared/superseded at plan level;
- extraction constructive: responsive/evidence refinement `SUPPORT`, identity refinement `DISSENT` on one P1;
- semantic: six prior findings cleared, `SEM-P1-05` remains, final `BLOCKING_PREMORTEM_FINDINGS`;
- extraction and semantic independently reproduced the same accepted identity defect: distinct contract-valid IDs containing default-ignorable code units can render identically even when the raw substring is fully expanded.

We have reached the three-round limit. I am arbitrating the remaining plan choice rather than opening another design round. The P1 is valid and accepted; it is not waived. Update the RFC only, commit it, and report. Do **not** implement production code yet.

## Binding identity closure

Keep the exact raw `manifestProjectId` and every no-persistence/no-path/no-command-key boundary. Replace raw-Unicode visible discrimination with one pure, injective ASCII escape representation of the exact JavaScript UTF-16 code-unit sequence:

- iterate UTF-16 code units, not normalized Unicode scalars;
- emit a code unit literally only when it is visible ASCII `0x21..0x7E` and is not backslash;
- encode backslash, space, controls, every non-ASCII unit, and lone/pair surrogate units as literal uppercase fixed-width `\\uXXXX` atoms;
- do not normalize, trim, case-fold, hash, or parse the raw id;
- render the escaped form as inert text in an LTR-isolated/monospace presentation. It remains presentation only.

This mapping is injective because raw backslash never appears and every escaped atom is fixed-width. Abbreviation and collision expansion operate on complete escape atoms. If the default compact prefix/suffix matches the previous selected same-name project's token while raw IDs differ, choose/expand a bounded window around the first differing escape atom (and length when needed) so the two actual visible ASCII tokens differ; CSS truncation may not hide that differing atom.

Expanded Project Rail visibly exposes the labeled full escaped identifier. Compact context exposes its labeled collision-aware token. Their actual accessible name/description must include project name plus the full escaped identifier through associated text or visually-hidden text; `title` is supplementary only. The raw id remains in application state and may be separately isolated, but raw glyphs are never the sole visible or accessible discriminator.

Add explicit fixtures for:

- `project-alpha` versus `project-<U+200B>alpha`;
- `same<U+200B>id` versus `same<U+2060>id`;
- NFC versus NFD lookalikes;
- bidi controls, whitespace/control, backslash, markup-looking text, lone surrogate escapes, equal prefix/suffix with a middle difference, and the existing maximum-length contract case.

Assert different visible ASCII tokens for compared distinct IDs, full escaped accessible identity without relying on `title`, inert rendering, no DOM/ref/path/persistence use, and unchanged raw persistence bytes.

## Two non-blocking clarifications to incorporate now

1. Deduplicate discard copy by session kind. In an ordinary project, `dirty` and `projectDirty` describe the same loss and must be named once. Only `project-preview` may name active Preview dirty and underlying project dirty as two independent losses; temporary/example has only active-document dirty. `hasDiscardableChanges` remains the single safety predicate.
2. Add the explicit Hybrid evidence case at `1440` or `1663`: select an evidence-bearing edge; open Project; prove Explorer presentation is suppressed while its preference is retained; inspect docked Details during the overlay; close Project; prove selection, confidence, identical `.evidence` `path:line`, Explorer restoration, focus, and truthful `aria-expanded` presentation.

## Required RFC record

- Record the exact reports and dispositions above.
- Mark the accepted identity P1 as closed by this binding core arbitration, not waived.
- Preserve resilience's residual executable-gate conditions.
- Set plan status to `DRAFT_CORE_ARBITRATION_APPLIED` and readiness to `AWAITING_CORE_CONFORMANCE`; do not self-authorize implementation.
- Keep changes plan-only. Commit on `feature/7-collapsible-project-rail`, provide commit SHA, diff summary, checks, and tracked worktree status. Leave `CodebaseGuide/` untouched.

After your explicit report I will inspect exact conformance. If it matches this binding resolution, I will issue the implementation-readiness decision; both red teams still retain independent final executable gates.

# Issue #7 — binding core arbitration applied

Processed your arbitration against `cf1a83075156deea1f531cbf93c1fbcf7d3287ed`. I updated the RFC only and committed it on `feature/7-collapsible-project-rail`.

## Artifact

- Commit: `c2f45f893c03df6f456240362c22ae38ee977312`
- Subject: `docs(visual-specs): apply project rail core arbitration (#7)`
- Diff: `plan/7-collapsible-project-rail.md` only; 127 insertions, 65 deletions
- Plan status: `DRAFT_CORE_ARBITRATION_APPLIED`
- Readiness: `AWAITING_CORE_CONFORMANCE`
- Production implementation remains explicitly unauthorized.

## Binding conformance applied

- Preserved exact raw `manifestProjectId`, its UTF-16 sequence and persistence bytes, and every no-DOM/ref/command/path/evidence/persistence-key boundary.
- Replaced raw-Unicode discrimination with the pure injective formatter over `charCodeAt(i)` code units: only visible ASCII `0x21..0x7E` except backslash is literal; every other unit becomes fixed-width `\uXXXX` with uppercase hex; surrogate-pair units remain two atoms; no normalize/trim/case-fold/hash/parse.
- Required inert monospace LTR-isolated full escaped presentation, actual associated/visually-hidden accessibility containing project name plus full escape, and supplementary-only `title`.
- Required full labeled expanded escape and labeled compact ASCII token. Abbreviation operates on complete atoms; same-name previous-token collisions expose a bounded first-difference window/length marker, and CSS cannot hide it.
- Added all requested fixtures: both default-ignorable pairs, NFC/NFD, bidi, whitespace/control, backslash, markup-looking ASCII, lone/pair surrogates, middle difference, CSS-hidden difference, and existing maximum-length case. Assertions cover distinct visible ASCII tokens, full non-title accessibility, inert DOM, non-use boundaries, and unchanged raw bytes.
- Deduplicated discard copy by `sessionKind`: example/temporary name only active-document loss; ordinary project aliases name one loss; only project-preview can name two independent losses. `hasDiscardableChanges` remains the sole predicate.
- Added the explicit `1663px` Hybrid evidence flow: evidence-bearing edge, Project open, Explorer presentation suppression with retained preference, docked Details inspection, Project close, identical selection/confidence/evidence, Explorer restoration, exact focus, and presentation-truthful `aria-expanded`.

## Reports and dispositions recorded

- resilience: `NO_BLOCKING_PREMORTEM_FINDINGS`; prior RES findings cleared/superseded at plan level, with every residual executable-gate condition retained;
- extraction: responsive/evidence `SUPPORT`, identity `DISSENT` on one P1;
- semantic: six prior findings cleared; `SEM-P1-05` remained in its final `BLOCKING_PREMORTEM_FINDINGS` report;
- the independently reproduced defect is recorded, and `SEM-P1-05` is now `CLOSED_BY_BINDING_CORE_ARBITRATION_NOT_WAIVED`.

## Checks and status

- `git diff --cached --check` before commit: pass
- `git show --check HEAD`: pass
- Markdown code fences: 6, balanced
- stale round-3 status markers / code-point formatter language: none
- committed paths: the RFC only
- tracked worktree: clean (`git status --porcelain=v1 --untracked-files=no` empty)
- `CodebaseGuide/`: still untracked and untouched
- no production files or tests changed; no product test suite was run for this plan-only commit

Awaiting your exact core-conformance inspection and separate implementation-readiness decision. Both red teams' final executable gates remain mandatory after any authorization.

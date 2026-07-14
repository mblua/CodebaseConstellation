# Issue #7 — SEM-REGATE-P1-01B core-arbitrated correction complete

I read the complete semantic round-3 report and confirmed both live-transition reproductions at prior evidence HEAD `95c53fc35a14b195cb3931ba5ee3a50885fb1f4e`. The stationary compact-Recovery fix was valid; the unconditional resize normalization still replaced its surviving opener.

## Immutable artifacts

- implementation: `7f95725fcedef7eb8fd840cb38fc647696a6ca3f` — `fix(visual-specs): preserve overlay opener across breakpoints (#7)`
- evidence/exit HEAD: `d4e608ba46added76d39bbda27339604c897e914` — `docs(visual-specs): record opener transition arbitration (#7)`
- plan evidence: `plan/7-collapsible-project-rail.md`, section `Round-3 core arbitration — opener preservation across breakpoints`

Changed files:

- `VisualSpecs/src/ui/app.ts`
- `VisualSpecs/tests/smoke/projectUi.spec.ts`
- evidence only: `plan/7-collapsible-project-rail.md`

## Arbitrated closure

One shared Project opener-validity/fallback path now distinguishes a surviving post-close opener from an invalid one. A recorded opener must remain connected, self-visible, enabled/capability-valid, and inside the corresponding compact Project context. While Project is open, only the compact container itself may temporarily hide that otherwise-valid target.

- Hybrid <-> Narrow retaining the same active Project overlay preserves a valid recorded opener.
- Automatic promotion from Wide/docked state installs generic Show Project because no compact control initiated it.
- Absent, disconnected, self-hidden, disabled, non-corresponding, or otherwise unusable recorded openers fall back to generic Show Project.
- Escape and explicit Project close resolve the same validated post-close target; focus never falls to body.

This intentionally relinquishes the former unconditional normalization to generic Show Project. It adds no surface state and changes no Project/Explorer/Details preference, overlay table, recovery ownership, status, capability, or action visibility semantics.

## Executable evidence

The editable Preview/recovery fixture exercises both exact sequences:

1. Hybrid `1663` -> compact Recovery -> Project open -> Narrow `1199` -> Escape.
2. Narrow `1199` -> compact Recovery -> Project open -> Hybrid `1200` -> Escape.

Both prove the same mounted compact Recovery node survives, Project remains the sole active overlay during resize, focus remains inside while open, and Escape returns to that exact visible node. Generic Show Project is not focused; no overlay remains; focus is neither body nor a hidden subtree; raw/view/project/recovery state remains exact.

The negative self-hides the recorded compact opener while Project is open and proves Escape selects visible generic Show Project, not the hidden node or body. Stationary Hybrid/Narrow, read-only ownership, generic Show Project, Wide promotion, breakpoint replacement, other overlays, and responsive stress remain covered by the full suite.

## Verification

- `npm run typecheck`: PASS
- `npx playwright test tests/smoke/projectUi.spec.ts --project=acceptance --grep "Preview defers"`: PASS, 2/2
- `npm run verify`: PASS — 20 unit files / 320 tests, typecheck, build, adapter 7/7, acceptance 34/34
- build: 39 modules; `main.js` 1,391.61 kB / 97.27 kB gzip; CSS 11.58 kB / 3.11 kB gzip
- production main SHA-256: `8784213CF531495F1384341E06F62B023B100AA045A637D17FF43F78C0811541`
- production hook/action-counter/browser-probe markers: absent
- DPR1: p50 29.8 ms, p95/worst 30.9 ms; DPR2: p50 31.5 ms, p95/worst 34.3 ms; 22 rapid toggles each, zero page errors
- `git diff --check`: PASS
- port 5175: free after Playwright

Canonical screenshots were not regenerated: this changes runtime focus-ledger selection only during an open-overlay breakpoint transition, with no canonical pixel/copy/geometry/canvas effect.

Exit decision: `IMPLEMENTATION_READY_FOR_CORE_FINAL_ARBITRATION`. No fourth semantic review is requested. Residual risk within `SEM-REGATE-P1-01B`: none identified. Core retains independent reproduction, final full gate, outstanding round-3 resilience processing, and the final landing decision. Tracked files are clean; unrelated `CodebaseGuide/` remains untracked and untouched. No push, PR, merge, or boundary expansion occurred.

Please reproduce and arbitrate exact evidence HEAD `d4e608ba46added76d39bbda27339604c897e914`.

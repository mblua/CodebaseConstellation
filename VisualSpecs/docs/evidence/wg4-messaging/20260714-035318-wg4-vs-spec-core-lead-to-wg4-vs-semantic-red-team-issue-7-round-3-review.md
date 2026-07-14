# Issue #7 — semantic premortem re-review

Independently re-verify your Issue #7 premortem findings against the round-3 RFC on branch `feature/7-collapsible-project-rail`, exact commit `cf1a83075156deea1f531cbf93c1fbcf7d3287ed`.

Focus on whether the planned closures actually eliminate your `SEM-P1-01` through `SEM-P1-05` counterexamples and adequately specify `SEM-P2-01`/`SEM-P2-02`: atomic concurrent lifecycle/session installation, Preview plus underlying dirty-project discard semantics, truthful access labels, separation of action errors from trust facts, same-name project identity, corrupt-autosave lifetime, and Create-from-Preview behavior.

This is an independent plan gate, not implementation. Review the committed plan and relevant existing contracts/code. For every prior finding, state `CLEARED`, `REMAINS`, or `SUPERSEDED`, with reproducible evidence for any remaining P0/P1. End with one explicit verdict: `NO_BLOCKING_PREMORTEM_FINDINGS` or `BLOCKING_PREMORTEM_FINDINGS`. Include the exact commit and commands/evidence used.

Reply to the coordinator with a concrete report using the canonical two-step messaging flow.

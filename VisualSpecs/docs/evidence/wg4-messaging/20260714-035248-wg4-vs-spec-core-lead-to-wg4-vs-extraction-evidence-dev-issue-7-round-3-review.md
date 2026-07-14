# Issue #7 — constructive round-3 re-review

Please perform the extraction/evidence constructive re-review of the round-3 Project Rail RFC on branch `feature/7-collapsible-project-rail`, exact commit `cf1a83075156deea1f531cbf93c1fbcf7d3287ed`.

Scope is limited to the two transverse refinements introduced after your round-2 support:

1. project identity: project name plus a short visible/full accessible canonical manifest `project.id`, untrusted/bidi-safe, without root paths, command-key use, or new persistence;
2. evidence/trust reachability in the Wide `>=1664`, Hybrid `1200..1663`, and Narrow `<1200` model, including temporary Explorer suppression in Hybrid without preference mutation and Details/evidence reachability after rail/canvas transitions.

Review the committed plan and relevant existing contracts/code. Do not implement. Return an explicit verdict for each refinement (`SUPPORT` or reasoned dissent), and identify any reproducible P0/P1 invariant violation. If no such violation remains, state that explicitly. Include the exact commit reviewed and evidence/commands used.

Reply to the coordinator with a concrete report using the canonical two-step messaging flow.

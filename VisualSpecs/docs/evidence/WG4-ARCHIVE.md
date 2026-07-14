# WG4 preservation archive

This archive preserves the non-reproducible work products that existed only in
`wg-4-vs-dev-team` before the workgroup was retired.

## Preserved material

- `issue-7/`: the original product brief, Playwright evidence, and the semantic
  and resilience adversarial evidence for the collapsible Project Rail. The
  immutable historical harnesses live below each lane's `harnesses/` directory,
  outside active `tests/**` discovery.
- `wg4-coordinator/`: coordinator-only screenshots and the retained branch
  ruleset request from the earlier repository-hardening work.
- `wg4-messaging/`: the canonical inter-agent reports and requests that form
  the review trail for WG4.
- `../prototypes/issue-7/`: the three layout alternatives presented before the
  Project Rail direction was selected.

The preserved test output is evidence, not a substitute for the final owner
verification or the two independent adversarial gates on the landing commit.

## Archive integration boundary

The first preservation commit, `4e8a317`, exposed the byte-exact historical
harnesses to Vitest and TypeScript. Semantic recorded that integration defect
as `SEM-ARCHIVE-P1-01`. Those files now remain byte-identical under
`docs/evidence/issue-7/{semantic,resilience}/harnesses/`, where ordinary product
test and typecheck discovery cannot execute them.

Some historical reports and raw results deliberately contain trailing
whitespace, blank EOF lines, or CRLF logs. `.gitattributes` preserves their
intended representation and disables whitespace diagnostics only for
`VisualSpecs/docs/evidence/**`; product source and active tests retain the normal
`git diff --check` gate.

Resilience also found product issue `RES-FINAL-P1-01` on `4e8a317`. Its focused
Preview transition fix and active editable/read-only regression were published
as `469001286a3b76ce09f9f07902a041959b90a204`. Final owner and independent gate
reports are attached to the landing PR so recording a report does not mutate the
exact commit it certifies.

## Deliberately omitted reproducible material

- `node_modules`, Vite caches, build output, and npm caches;
- the untracked `CodebaseGuide/` cache-only tree;
- temporary Git worktrees whose source commits are preserved by the issue
  branch;
- session configuration, transport receipts, launcher logs, and generated
  AgentsCommander bootstrap files.

`WG4-SHA256SUMS.txt` covers the synchronized evidence and selected prototypes
(excluding the manifest itself). Final gate and landing references are recorded
in the PR closeout trail.

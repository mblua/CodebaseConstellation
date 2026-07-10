# 0003 — Current-state spaghetti diagnostics

Status: accepted for the next product increment

## Context

The product is currently intended to explain the architecture that exists in the
checked-out source tree. Commit and issue history can add useful evidence later, but
it is not required to answer the immediate questions: which files depend on which,
where dependencies cross boundaries, and where the graph has become cyclic or overly
coupled.

Showing every relation at once recreates the spaghetti that the product is meant to
diagnose. Diagnostics therefore need named, evidence-backed findings that can isolate
the relevant subgraph.

## Decision

### Snapshot scope

The current-state scan supports a history-disabled policy. A history-disabled snapshot
has:

- `snapshots.history_mode = 'absent'` and `visible_commit_count = 0`;
- no `commit` or `issue` nodes;
- no `modifies`, `references`, or `touches` edges; and
- `git_history` and `issue_file_touches` capabilities marked `unavailable`, with a
  detail that says collection was intentionally disabled.

The v1 schema retains the change kinds so this decision is reversible. No migration is
required. Change relations never participate in the diagnostics below.

### Dependency zones

Diagnostics assign each internal file to one deterministic dependency zone:

1. Start at the deepest explicit internal package root established by `groups`.
2. Make the file path relative to that root.
3. If the first directory is a conventional source root (`src`, `lib`, or `app`) and a
   further directory exists, discard that source-root segment.
4. The next directory is the zone. Files directly in the remaining root use `<root>`.

Zone assignment is analysis metadata, not inferred package ownership. An `imports`
edge is cross-boundary when its internal source and target have different package or
zone identities.

### Metrics

Analytics owns these additional node metrics:

- `architecture.cross_boundary_in`
- `architecture.cross_boundary_out`
- `architecture.dependency_zone_count`

They are counts over internal file-to-file `imports` edges in the selected snapshot.

### Findings

Existing `architecture_dependency_cycle` findings remain warnings and include every
file and import edge in the strongly connected component.

`architecture_dependency_hub` is an informational finding for an internal file when:

- both fan-in and fan-out are non-zero; and
- fan-in plus fan-out is at least `max(12, P98)`, where `P98` is the deterministic
  nearest-rank 98th percentile among internal files with at least one dependency.

`architecture_boundary_sprawl` is a warning for an internal file with at least five
outgoing cross-boundary imports reaching at least three distinct dependency zones.

Each finding records the thresholds and measured values in `attributes_json`, attaches
the primary file through `finding_nodes`, and attaches the participating files and
supporting import edges needed to reproduce the conclusion. A high fan-in-only shared
contract is not, by itself, labelled spaghetti.

### Investigation UI

The browser exposes a **Spaghetti** preset that:

- enables current dependency relations and file/package/directory nodes;
- hides change history;
- ranks current findings by severity and measured impact;
- visually distinguishes cycle, hub, and boundary-sprawl participants; and
- lets a finding isolate exactly its attached nodes and edges, with a way to return to
  the complete current-state graph.

The selected file detail presents friendly fan-in, fan-out, boundary counts, cycle
membership, path, language, LOC, neighboring dependencies, and source evidence.

## Consequences

This gives a human a reproducible route from a warning to the files and import lines
that caused it. It gives up a single universal “spaghetti score”: such a score would
hide whether the actual concern is a cycle, excessive coordination, or boundary
leakage. Zone boundaries are path-derived heuristics until the repository declares an
architecture policy, so the UI must describe them as detected boundaries rather than
forbidden dependencies.

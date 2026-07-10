# Data contract v1

CodebaseConstellation stores an immutable graph for every repository snapshot. A scan writes one `snapshots` row, then its `nodes`, `edges`, evidence, and metrics. Analytics append findings and a layout; the renderer consumes the layout blobs without reparsing the source tree.

## Contract boundaries

- `nodes` is the unified namespace. Files, directories, packages, symbols, actors, domain nouns (`concept`), domain verbs (`action`), commits, and issues differ by `kind`, not by table.
- `edges` is the unified relation set. Every relation has a declared direction, confidence, and optional evidence. `touches` always points from an issue to a file and is derived through `issue <-references- commit -modifies-> file`.
- A snapshot is immutable after its status becomes `complete`. A rescan creates a new snapshot. `stable_key` is stable only within one repository and is used to compare nodes across snapshots.
- Filesystem ownership has one source of truth: `contains` edges. Every `file` and `directory` except the repository root has exactly one incoming `contains` edge.
- Package membership uses `groups`; it must not be inferred from directory containment because workspaces and packages may overlap.
- Heuristic semantic nodes and edges must carry `confidence < 1` and at least one `edge_evidence` row. Manual facts use `evidence_kind = 'manual'`.
- Human-actionable problems live in `finding_threads`. Their fingerprint survives rescans, while `finding_occurrences` records where each problem appeared.

## Stable-key namespaces

Writers must use deterministic UTF-8 keys with forward-slash paths:

| Kind | Shape | Example |
| --- | --- | --- |
| repository | `repo:<slug>` | `repo:agentscommander` |
| file/directory | `fs:<relative-path>` | `fs:src/shared/ipc.ts` |
| package | `pkg:<ecosystem>:<name>` | `pkg:cargo:session-bridge` |
| symbol | `sym:<language>:<qualified-name>` | `sym:rust:api::MessageStore` |
| semantic | `<kind>:<normalized-name>` | `concept:message` |
| commit | `commit:<full-hash>` | `commit:646ae...` |
| issue | `issue:<tracker>:<key>` | `issue:github:904` |

Paths are repository-relative and never start with `./` or `/`. Names are for display and may change; stable keys may not.

## Applying the migration

Apply `migrations/0001_initial.sql` to a new SQLite database. Every connection must enable `PRAGMA foreign_keys = ON`; SQLite does not persist that setting in the database file. `PRAGMA user_version` and `schema_migrations` must both report version `1`.

The checked-in fixture is rebuilt and verified with:

```powershell
python fixtures/build_seed.py
python fixtures/verify_seed.py
```

## Capability gates

Consumers must inspect `snapshot_capabilities`, not infer quality from non-empty tables. In particular, `issue_file_touches` is:

- `available` when issue-reference history is representative;
- `degraded` when some edges can be emitted but history is shallow or coverage is poor;
- `unavailable` when no reliable issue convention was found.

The renderer may show degraded layers, but must label them. Analytics must not rank a degraded relation as if it had full coverage.

## Current-state diagnostics

The default product workflow may intentionally disable history. Such scans record
`history_mode = 'absent'`, emit no change nodes or edges, and mark the two history
capabilities unavailable with an explicit "disabled" detail. This is a supported
snapshot shape, not a degraded architectural analysis.

Spaghetti diagnostics operate only on current internal file dependencies. Their zone
semantics, metric keys, evidence requirements, finding thresholds, and browser
isolation behavior are frozen in
[`decisions/0003-current-state-spaghetti-diagnostics.md`](decisions/0003-current-state-spaghetti-diagnostics.md).

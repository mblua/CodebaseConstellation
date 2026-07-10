# CodebaseConstellation graph analytics

This isolated package reads a complete SQLite contract-v1 snapshot and appends graph
metrics, evidence-backed current-state architecture findings, and one renderer-ready
3D layout. It does not scan source code, alter ingest tables, or render in the browser.

## Runtime

Use CPython 3.10-3.13. NetworKit does not currently publish a CPython 3.14 wheel for
Windows; CPython 3.12 is the tested runtime.

```powershell
py -3.12 -m venv graph-analytics/.venv
graph-analytics/.venv/Scripts/python.exe -m pip install -e graph-analytics
```

The production kernels are provided by:

- NetworKit for degree, components, PageRank, sampled betweenness, eigenvector
  centrality, k-core, breadth-first depth, and strongly connected components;
- `leidenalg`/igraph for deterministic Leiden communities;
- `fa2` for offline, seeded, three-dimensional ForceAtlas2.

Exact betweenness is never selected. The sample count is
`min(256, max(16, ceil(sqrt(node_count))))` and the random seed is fixed per run.
`fa2` includes a supported pure-Python fallback, which keeps the pipeline executable
when a Windows C extension cannot be built. Large snapshots should use the compiled
extension. For the fallback, graphs from 256 nodes enable Barnes-Hut automatically;
theta is 1.6 below 5,000 nodes and 1.8 above that. This trades some repulsion precision
for practical offline runtime while retaining the deterministic seed and input order.

## Run

The database is modified in place, so use a copy when evaluating a fixture:

```powershell
Copy-Item fixtures/seed.sqlite graph-analytics/.tmp/seed-analytics.sqlite
graph-analytics/.venv/Scripts/python.exe -m constellation_analytics `
  --database graph-analytics/.tmp/seed-analytics.sqlite `
  --snapshot-id 1 `
  --layout-name architecture-v1 `
  --seed 1 `
  --iterations 250 `
  --pretty
```

If `--snapshot-id` is omitted, the newest complete snapshot is selected. Use
`--repository-id` to constrain that selection in a multi-repository database.

The command prints a JSON summary containing metric/finding counts, the layout id,
blob record counts, byte lengths, and SHA-256 digests.

## Metrics

Every analytics-owned metric is replaced idempotently for the selected snapshot;
unrelated ingest metrics are preserved.

| Scope | Keys | Meaning |
| --- | --- | --- |
| node | `graph.in_degree`, `graph.out_degree` | unique inbound/outbound neighbors over all relations |
| node | `architecture.fan_in`, `architecture.fan_out` | unique neighbors over dependency/execution/data-flow relations only |
| node | `graph.component_id`, `graph.component_size`, `graph.orphan` | stable-key-ordered weak components and zero-degree nodes |
| node | `centrality.pagerank`, `centrality.betweenness_sampled`, `centrality.eigenvector`, `graph.k_core` | NetworKit rankings over non-change architectural edges |
| node | `structure.depth` | NetworKit BFS depth over `contains`, `groups`, and `declares` |
| internal file | `architecture.cross_boundary_in`, `architecture.cross_boundary_out` | internal file-to-file imports crossing package or dependency-zone identity |
| internal file | `architecture.dependency_zone_count` | distinct outgoing cross-boundary target zones |
| package | `package.afferent_coupling`, `package.efferent_coupling`, `package.instability` | distinct incoming/outgoing package dependencies and `Ce/(Ca+Ce)` |
| package | `package.internal_relation_count`, `package.outgoing_relation_count`, `package.cohesion_ratio` | internal and outgoing relation evidence; cohesion is `internal/(internal+outgoing)` |
| snapshot | `graph.component_count`, `graph.orphan_count`, cycle counts, input counts, sample count | aggregate run signals |

Package membership starts only from explicit `groups` edges; declared symbols inherit
the explicit membership of their declaring artifact. When workspace/root packages
overlap, the explicitly grouped package with the deepest declared manifest `root` wins
the single layout/metric membership. Directory containment is never treated as package
ownership.

Each internal file receives one deterministic dependency zone. Its path is made
relative to the deepest explicitly grouped internal package root. A leading `src`,
`lib`, or `app` segment is discarded only when another directory follows it; the next
directory is the zone, while files directly in the remaining root use `<root>`. Zone
identity includes the stable package key, so two packages' identically named folders
remain distinct. Files without explicit package membership use `<unpackaged>`.

The `git_history` and `issue_file_touches` capabilities gate the base layout. If any
declared history capability is degraded/unavailable (or none declares complete
coverage), all change edges are excluded from Leiden and ForceAtlas2 attraction. They
remain byte-for-byte in the renderer edge blob and the exclusion count/kinds/reason are
recorded in `parameters_json`. Change edges are always excluded from centrality,
package coupling, and architectural fan rankings. A degraded shallow root commit
therefore cannot dominate either ownership signals or the initial visual structure.

## Findings

Current-state findings are:

- `architecture_dependency_cycle` warnings for strongly connected components of
  internal files, attaching every participating file and internal `imports` edge;
- the existing package-collapsed dependency-cycle warning;
- `architecture_dependency_hub` informational findings when an internal file has both
  inbound and outbound imports and total fan reaches `max(12, P98)`. P98 uses the
  deterministic nearest-rank definition over dependency-bearing internal files;
- `architecture_boundary_sprawl` warnings at five outgoing cross-boundary imports and
  three distinct target zones.

Every finding attaches the primary/participating files and all supporting import edges
needed to reproduce it. Thresholds, measured values, source zone, and target zones are
stored in `attributes_json`. Fingerprints are rule-versioned SHA-256 values over stable
node keys, so database ids may change on a rescan without breaking the thread.
Occurrences and evidence are replaced idempotently for a rerun; unrelated metrics and
finding rules are preserved. A high fan-in-only shared contract is intentionally not a
hub finding.

Dependency zones are detected path heuristics, not declarations that a dependency is
forbidden. They should be presented as investigation boundaries until a repository
supplies an explicit architecture policy.

## Layout and blobs

Leiden operates on internal-package/top-level-containment anchor units; external
dependency packages are grouped by ecosystem instead of becoming dozens of singleton
anchors. Structural relations receive the strongest layout weights. Resolution starts
at 0.75 and increases through a fixed deterministic schedule only when all protected
internal packages (or, for a single-package graph, all top-level anchors) collapse into
one opaque community. A final CPM partition at a weight-derived resolution is the
non-arbitrary safety fallback. Layout-local cluster ids remain actual Leiden community
membership, ordered by the smallest stable anchor key.

ForceAtlas2 always runs offline in three dimensions. When the same layout name exists
on the previous complete snapshot, positions are decoded and joined through node
`stable_key`; unchanged nodes seed the new run and new nodes start near their community
centroid. Disconnected and singleton graphs have explicit paths.

The writer updates or creates only `(snapshot_id, layout_name)`. It preserves the
layout id on rerun, replaces only that layout's two blobs, and leaves other layouts
untouched. Positions and edges use the byte-exact little-endian v1 records from
`spec/blobs.md`; bounds are computed from the encoded f32 coordinates.

## Tests

```powershell
$env:TEMP = (Resolve-Path graph-analytics/.tmp).Path
$env:TMP = $env:TEMP
graph-analytics/.venv/Scripts/python.exe -m unittest discover `
  -s graph-analytics/tests -t graph-analytics -v
```

The suite covers the real seed fixture, golden headers/records, SHA and size equations,
edge indexes, deterministic replacement, layout isolation, degraded-history exclusion
with blob retention, adaptive multicluster fallback, direct and package cycles, stable
finding threads across rescans, exact zone derivation, nearest-rank P98, hub/sprawl
thresholds and evidence attachments, external/change exclusion, previous-position
seeding, disconnected graphs, and a singleton.

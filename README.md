# CodebaseConstellation

CodebaseConstellation turns a repository into an evidence-backed graph that a human can explore. Files, directories, packages, symbols, actors, domain concepts, actions, commits, and issues share one versioned SQLite contract; relationships retain confidence and provenance instead of hiding inference behind a picture.

The MVP is an end-to-end local pipeline:

```text
source tree + manifests + Git
              │
              ▼
      Rust ingestion CLI
              │
              ▼
   immutable SQLite snapshot
              │
              ▼
 graph metrics + findings + 3D layout
              │
              ▼
     browser/WebGL investigation
```

## What works now

- Rust scanning of Git-tracked files and directories, npm/Cargo packages, conservative TypeScript/Rust imports, LOC, visible commits, issue references, and issue-to-file `touches`.
- Immutable SQLite snapshots with capability gates, typed evidence, stable identities, tracked findings, metrics, and byte-exact renderer blobs.
- Deterministic graph analytics: centrality, components, dependency cycles, package coupling/cohesion, actionable finding threads, community-aware 3D layout, and snapshot-to-snapshot position seeding.
- A batched WebGL browser with SQLite file loading, search, orbit/zoom/fit, GPU picking, neighbor focus, layered relations, kind filters, capability warnings, evidence, metrics, and recommendations.
- A deterministic AgentsCommander seed that demonstrates the future semantic layer (`actor → action → concept`) as well as structural and change graphs.

The real AgentsCommander scan currently produces structure/packages/imports/history. Automatic production extraction of symbols, actors, domain nouns, verbs, and end-to-end data flow is the next semantic increment; the schema and renderer already support those kinds, but the MVP does not pretend its manual fixture inferences are complete.

## Run the complete pipeline

Prerequisites: stable Rust, CPython 3.10–3.13, Node.js `^20.19` or `>=22.12`, Git, and a Chromium/WebGL-capable browser.

From this repository root, create a local output directory and scan a repository:

```powershell
New-Item -ItemType Directory -Force .local | Out-Null
cargo run -p constellation-ingest -- scan `
  --repo C:\path\to\AgentsCommander `
  --db .local\agentscommander.sqlite
```

Install and run analytics. The command updates that database in place with metrics, findings, and a renderer-ready layout:

```powershell
py -3.12 -m venv graph-analytics\.venv
graph-analytics\.venv\Scripts\python.exe -m pip install -e graph-analytics
graph-analytics\.venv\Scripts\python.exe -m constellation_analytics `
  --database .local\agentscommander.sqlite `
  --layout-name architecture-v1 `
  --seed 1 `
  --iterations 250 `
  --pretty
```

Start the browser:

```powershell
Set-Location web
npm install
npm run dev
```

The app opens `fixtures/seed.sqlite` immediately. Use **Open .sqlite** to select `.local\agentscommander.sqlite`.

## Read the graph by intent

The initial view privileges containment and package structure. Dependency, execution, data-flow, semantic, and change-history edges are opt-in layers; selecting a node can hide or dim unrelated edges. This gives up the illusion of seeing everything simultaneously in exchange for a graph that remains interpretable.

Quality is part of the data. A non-empty relation is not automatically trustworthy: the supplied AgentsCommander checkout exposes only one shallow, grafted commit, so its 615 derived `touches` edges remain visible as evidence but are marked `degraded` and excluded from architectural rankings and the base layout.

## Verify

```powershell
python fixtures\build_seed.py
python fixtures\verify_seed.py
cargo fmt --all --check
cargo test --workspace --all-targets

graph-analytics\.venv\Scripts\python.exe -m unittest discover `
  -s graph-analytics\tests -t graph-analytics -v

Set-Location web
npm test
npm run build
npm run smoke
```

Detailed contracts and lane documentation:

- [`schema/README.md`](schema/README.md) — SQLite v1 semantics and capability gates.
- [`spec/blobs.md`](spec/blobs.md) — positions/edges binary formats.
- [`fixtures/README.md`](fixtures/README.md) — deterministic seed and invariants.
- [`crates/constellation-ingest/README.md`](crates/constellation-ingest/README.md) — scanner coverage and limits.
- [`graph-analytics/README.md`](graph-analytics/README.md) — metrics, findings, layout, and scaling trade-offs.
- [`web/README.md`](web/README.md) — browser controls, validation, performance, and smoke flow.

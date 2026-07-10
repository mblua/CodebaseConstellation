# constellation-ingest

`constellation-ingest` writes an immutable CodebaseConstellation v1 snapshot from a Git repository. It uses only Git-tracked paths, applies or verifies `schema/migrations/0001_initial.sql`, and enables SQLite foreign keys on its connection.

## Run

From the workspace root:

```powershell
cargo run -p constellation-ingest -- scan --repo C:\path\to\repository --db C:\path\to\constellation.sqlite
```

The command prints a JSON report containing the snapshot id, real node/edge counts, history mode, and every capability gate. Paths are inputs; no local repository or database path is compiled into the binary.

## MVP coverage

- Repository, directory, and file nodes for `git ls-files`, deterministic forward-slash `fs:` keys, `contains` edges, detected language, and physical LOC.
- npm and Cargo packages, package membership, internal or declared external dependencies, and manifest evidence.
- Conservative TypeScript/TSX static, side-effect, re-export, and literal dynamic imports.
- Conservative Rust file-backed `mod`, crate-relative `use`, and declared dependency-crate imports. This resolver does not claim macro expansion or symbol resolution; the capability remains `degraded` until the planned SCIP adapter replaces it.
- Every visible commit, current-snapshot `modifies` edges, `#<n>` references, and derived issue-to-file `touches`. Shallow history is explicitly `degraded`, even when it produces edges.

All graph rows and the transition from `running` to `complete` are committed in one transaction. If graph insertion or conformance validation fails, that transaction rolls back and the snapshot is marked `failed`; it cannot become partially `complete`.

## Verify

```powershell
cargo fmt --all --check
cargo test --workspace --all-targets
python fixtures/verify_seed.py
```

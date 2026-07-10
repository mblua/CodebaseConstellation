# Codebase Constellation browser

This directory is the self-contained contract-v1 browser renderer. It is Vanilla TypeScript with three.js, pmndrs `postprocessing`, `troika-three-text`, and `wa-sqlite`; there is no framework or backend.

The app opens `../fixtures/seed.sqlite` by default. **Open .sqlite** accepts another local v1 database and performs all work in the browser. SQLite remains the source of truth: no JSON graph fixture or alternate renderer contract is generated.

## Install, test, build, and run

Node.js `^20.19.0` or `>=22.12.0` is required by Vite 8.

```powershell
cd web
npm install
npm test
npm run build
npm run dev
```

Open the URL printed by Vite (normally `http://127.0.0.1:5173`). The production output is `web/dist/` and can be served as static files:

```powershell
npm run preview
```

The build imports the checked-in seed as a Vite asset, so the production bundle contains the exact SQLite fixture without duplicating it in source control.

## Browser smoke

Install a Playwright browser once, then run the production-preview flow:

```powershell
npx playwright install chromium
npm run smoke
```

The smoke test waits for SQLite validation and WebGL initialization, checks that the Structure-induced seed view contains 39 of 53 nodes and 49 of 92 edges, confirms degraded capability UI, searches for `sessions_persistence.rs`, requires exactly its six relationship cards (and rejects an unrelated `package.json` relation), opens its metrics and finding, enables dependencies, and writes `test-results/constellation-mvp.png`.

An optional scale and diagnostics smoke exercises the ignored, history-off AgentsCommander database. Put it at `../.local/agentscommander-current.sqlite`, rebuild, and run:

```powershell
npm run build
npm run smoke:real
```

If the database is absent the test is skipped. When present, it asserts the 782-node/3,635-edge current-source snapshot, confirms the 722-node Structure subgraph is entirely inside the camera frustum, verifies that history cards and the empty Change control are absent, and checks the 18 current relationships for `sessions_persistence.rs`. It then exercises all 27 recorded Spaghetti findings, exact attachment isolation, friendly file metrics, and return to the full 478-node/2,056-edge dependency view.

The flow writes `test-results/agentscommander-real-overview.png`, `test-results/agentscommander-real-selected.png`, `test-results/agentscommander-spaghetti-overview.png`, and `test-results/agentscommander-spaghetti-isolated.png`. `npm run smoke:all` runs both browser flows.

## Spaghetti investigation

**Spaghetti** is a current-state preset, not a browser-computed score. It enables file, package, and directory kinds plus recorded dependency relations; it never enables change history. The browser reads cycle, dependency-hub, and boundary-sprawl findings and their `finding_nodes` / `finding_edges` attachments from SQLite, ranks open findings by severity and recorded impact, and marks participants in the existing point buffer:

- pink ring: dependency-cycle participant;
- cyan cross: dependency-hub participant;
- amber diamond: detected boundary-sprawl participant;
- white emphasis: the selected primary node.

Choosing **Isolate finding** masks the existing node and edge buffers to exactly the attached IDs. It does not move coordinates or create per-participant scene objects. **Show full current state** clears only that isolation and returns to the complete Spaghetti dependency view.

For files, recorded `architecture.fan_in`, `architecture.fan_out`, cross-boundary counts, dependency-zone count, cycle membership, and LOC receive friendly labels. Their values and findings remain analytics-owned; the browser does not derive replacements. “Boundary” means a detected package/path zone from the recorded analysis, not a declared forbidden dependency.

When `history_mode = 'absent'`, the overview calls the database a current-source snapshot, omits visible-commit summary space and intentionally unavailable history capability cards, and omits Change when there are no change edges.

## Manual flow verified

1. Load the default seed and confirm the initial graph shows the structural hierarchy rather than every relationship. A node participates in the canvas only when it is an endpoint of an enabled edge in an active layer, so dependency- and change-only outliers do not distort Structure framing.
2. Drag to orbit, scroll to zoom, and use **Fit** (or `F`) to reframe all visible nodes.
3. Enable **Dependencies** to reveal imports, package dependencies, calls, and invokes.
4. Enter **Spaghetti**, compare the cycle/hub/boundary-sprawl legend with the ranked cards, isolate a finding, and use **Show full current state** to leave isolation.
5. Search for `sessions_persistence`, select the file, and confirm the friendly dependency metrics, LOC, findings, neighbors, and edge evidence.
6. Switch **Selection edges** between dim, hide, and keep-all behavior.
7. Toggle node kinds and individual edge kinds; a selected node is cleared if its kind becomes hidden.
8. Inspect **Data quality**. History-off snapshots intentionally omit history/issue cards; the older seed continues to show its degraded history capability.
9. Use **Open .sqlite** and choose another contract-v1 file; a rejected magic/version/schema/blob produces a human-readable error while an already-open graph remains usable.

Search has one intentional visibility exception: choosing a result pins that selected node even when it has no edge in the active layers. This makes the search result visible and focusable without silently changing the user's layer choices. Its neighbors and edges remain governed by the active layers, and clearing the selection returns the node to normal layer-induced visibility. The detail header marks this state as **pinned outside active layers**.

## Validation boundary

Before allocating GPU graph buffers, the loader verifies:

- SQLite 3 signature, `PRAGMA user_version = 1`, migration version 1, and required v1 tables;
- a complete snapshot and complete three-dimensional layout with both graph blobs;
- `little` byte order, `none` compression, declared byte lengths, record counts, and SHA-256 digests;
- `CCP1` / `CCE1` magic, format version, header/record sizes, snapshot/layout ids, size equations, and zero reserved fields;
- finite positions, positive radii, non-negative finite weights, unique node/edge ids, known render codes, valid semantic/change/directed flags, and edge indices inside the positions record count.

Decoder failures include the blob kind and record index where applicable.

## Renderer performance invariants

- All graph nodes are one `THREE.Points` with shader-driven color, radius, shape, filtering, and selection attributes.
- All graph edges are one merged `THREE.LineSegments` geometry with per-edge layer color and alpha attributes.
- Node selection uses an on-demand offscreen GPU id pass and reads one pixel; there is no 50k-point raycast.
- Bloom is `SelectiveBloomEffect` and selects the points object, leaving edges and the scene background out of the bloom mask.
- Labels use `troika-three-text` `BatchedText`, are capped at 200, ranked by recorded PageRank when available (with a kind/radius fallback), weighted by camera distance, and culled for viewport bounds and screen-space collisions. One slot is reserved so the selected node's label is always visible after its lazy detail resolves.
- Search is a bounded SQLite query. Node detail, metrics, neighbors, evidence, and findings are fetched only for the selected node. The detail panel caps adjacency at 200 edges and rendered cards at 120.
- Filtering, finding isolation, and diagnostic class emphasis update buffer attributes; they never create a DOM or three.js object for each node or edge.

Folders, files, packages, actors, concepts, actions, data stores, and other kinds differ by point shape and/or radius as well as color. The controls include a shape-and-color legend.

## Current trade-offs and limits

- The MVP uses the `wa-sqlite` read-only `MemoryVFS` for both the bundled seed and locally chosen files. That means the SQLite file is copied into browser memory once. It keeps the v1 contract intact and is appropriate for the required local workflow, but a large remotely hosted database should use an async HTTP Range VFS so node metadata pages remain on demand. That transport swap does not require a schema or blob-format change.
- Graph position and edge payloads remain binary SQLite BLOBs throughout. They are never fetched or decoded as JSON.
- Labels fall back to schema kind/radius priority when PageRank is not recorded; the browser does not compute missing analytics.
- Direction is shown in the detail panel. The single merged edge batch does not add per-edge arrowhead meshes in this MVP.
- The minified JavaScript chunk is about 862 kB before gzip (about 234 kB gzip), primarily three.js, postprocessing, and text rendering. The separate SQLite WASM is about 558 kB. Code splitting is a future loading optimization, not a runtime graph-scaling issue.

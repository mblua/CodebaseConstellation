# Graph blob format v1

SQLite remains the source of truth. `graph_blobs.content` is a byte-exact renderer handoff generated for one `layouts` row. All integers and IEEE-754 floats are little-endian, records are tightly packed, strings never occur in a blob, and compression is `none` in v1.

Consumers must reject a blob when the magic, version, header size, record size, snapshot id, layout id, byte length, or SHA-256 digest disagrees with its database metadata. Reserved bits and fields must be zero. Floating-point values must be finite.

## Positions (`kind = positions`)

Header: 32 bytes.

| Offset | Type | Value |
| ---: | --- | --- |
| 0 | `u8[4]` | ASCII `CCP1` |
| 4 | `u16` | format version, `1` |
| 6 | `u16` | header bytes, `32` |
| 8 | `u32` | record count |
| 12 | `u8` | dimensions, `3` |
| 13 | `u8` | scalar code, `1` = IEEE-754 `f32` |
| 14 | `u16` | flags, `0` in v1 |
| 16 | `u64` | snapshot id |
| 24 | `u64` | layout id |

Each position record is 32 bytes. Record order defines the dense `node_index` used by the edge blob.

| Offset | Type | Meaning |
| ---: | --- | --- |
| 0 | `u64` | SQLite `nodes.id` |
| 8 | `f32` | x |
| 12 | `f32` | y |
| 16 | `f32` | z |
| 20 | `f32` | radius, strictly greater than zero |
| 24 | `u16` | `node_kinds.render_code` |
| 26 | `u16` | node flags |
| 28 | `u32` | layout-local cluster id; `0` means unclustered |

Node flag bits:

- bit 0: external node;
- bit 1: semantic node (`actor`, `concept`, `action`, or `data_store`);
- bit 2: change-history node (`commit` or `issue`);
- bit 3: synthetic node produced by analysis rather than parsed directly.

All other bits are zero. Coordinates are right-handed Cartesian values in layout space; `layouts.bounds_json` supplies the bounding box. No fixed normalization range is imposed.

## Edges (`kind = edges`)

Header: 32 bytes.

| Offset | Type | Value |
| ---: | --- | --- |
| 0 | `u8[4]` | ASCII `CCE1` |
| 4 | `u16` | format version, `1` |
| 6 | `u16` | header bytes, `32` |
| 8 | `u32` | record count |
| 12 | `u16` | record bytes, `24` |
| 14 | `u16` | flags, `0` in v1 |
| 16 | `u64` | snapshot id |
| 24 | `u64` | layout id |

Each edge record is 24 bytes.

| Offset | Type | Meaning |
| ---: | --- | --- |
| 0 | `u64` | SQLite `edges.id` |
| 8 | `u32` | source `node_index` |
| 12 | `u32` | target `node_index` |
| 16 | `u16` | `edge_kinds.render_code` |
| 18 | `u16` | edge flags |
| 20 | `f32` | non-negative edge weight |

Edge flag bits:

- bit 0: directed;
- bit 1: derived rather than directly observed.

All other bits are zero. Both indexes must be smaller than the positions record count. An edge record always refers to the positions blob from the same layout.

## Size equations

For `N` nodes and `E` edges:

```text
positions bytes = 32 + 32 * N
edges bytes     = 32 + 24 * E
```

The fixture builder is the executable reference encoder. Its verifier decodes both headers and every record, checks referential integrity, and recomputes SHA-256.

# Seed fixture

`seed.sqlite` is a small, proportional AgentsCommander snapshot used to unblock ingestion conformance, analytics, and rendering. It contains filesystem and package structure, representative TypeScript/Rust dependencies, a small actor–action–concept flow, a deliberately degraded issue-to-file layer, two tracked findings, and both v1 renderer blobs.

It is illustrative rather than a claim that semantic extraction is complete. Confidence and evidence fields make that boundary visible.

## Rebuild and verify

Python 3 and its standard-library SQLite module are the only requirements.

```powershell
python fixtures/build_seed.py
python fixtures/verify_seed.py
```

The verifier checks:

- schema and foreign-key integrity;
- exactly one `contains` parent per file/directory;
- evidence for every low-confidence or derived edge;
- a non-empty, quality-gated `touches` layer;
- finding and layout counts;
- every byte, id, flag, kind code, index, digest, and size equation in both blobs.

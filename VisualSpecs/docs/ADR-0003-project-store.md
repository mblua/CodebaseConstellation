# ADR-0003: ProjectStore and File System Access

## Status

Accepted.

## Context

Visual Specs originally worked as temporary JSON plus download export. Project persistence adds local project
persistence without adding a backend, network service, telemetry, IndexedDB handle storage or
repository-wide filesystem assumptions.

## Decision

Use a `ProjectStore` port in `src/ports/` and a browser File System Access adapter in
`src/adapters/filesystem/`.

The port carries only text, bytes, opaque refs and capability flags. It imports no contract
types and exposes no DOM/FSA/Blob/URL/IDB names. The app validates every manifest and
portable document immediately after reading.

Projects live under a user-selected `.visual-specs/` directory. Open starts read-only.
Enable editing is a separate click that requests readwrite permission and re-reads the
project before writes are enabled. Save/Rename/Import/Restore perform another bounded fresh read
inside a per-project queue and let the app validate/compare it before the first write. A replacing
commit backs up the just-read current bytes, closes that backup, replaces current, and writes
`project.json` last. A skew caused by the final write failing opens safely read-only and can be
adopted only through the explicit Repair action.

Unsupported browsers fall back to temporary JSON open plus Save Picker when available, then
download only when it is absent. The UI must
not claim `.visual-specs` persistence in that mode.

## Consequences

This keeps renderer conformance and portable document validation independent of filesystem
APIs. It also keeps project writes scoped to explicit browser capabilities.

Known limits are documented, not hidden: FSA has no `realpath` guarantee against physical
junction escape, no create-exclusive primitive for collision-free exports, no cross-process lock
or atomic compare-and-swap for the preflight-to-write interval, and permissions can be revoked
between operations. The app serializes its own project operations and degrades to readonly on a
write `NotAllowedError`, but it does not claim to eliminate those external races.

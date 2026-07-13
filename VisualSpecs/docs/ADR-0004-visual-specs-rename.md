# ADR-0004: Rename to Visual Specs

## Status

Accepted.

## Context

The product name changed from the legacy CodebaseGuide name to Visual Specs. The portable
document remains the same v1 contract: the rename changes product vocabulary, package name,
UI, docs, hooks, extractor banner/name and public type names, but not the interchange major
version.

## Decision

The app directory is `VisualSpecs/`, the npm package is `visual-specs`, the browser test hook
is `__visualSpecs`, and public contract types use `VisualSpecs*` names.

Portable documents keep `formatVersion` 1.x. Legacy documents with
`generator.name = "codebaseguide-extract"` remain valid input; new exports and the extractor
use `visual-specs-extract`.

The committed AgentsCommander dataset is fixed to
`source.commit = e6a0db5aeb8540fc3bb97b9eee10285f6c4faf11`. `GENERATOR_VERSION` remains
`0.1.0`; the dataset rename diff is limited to `generator.name`.

## Consequences

There is no compatibility alias layer for `GuideDoc` or `GuideView` in the published source.
Reviewers should treat any remaining legacy product-name hits as explicit compatibility
allowlist entries, not stale branding.

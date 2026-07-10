# 0001 — Unified, immutable snapshot graph

Status: accepted, 2026-07-10

## Context

The first release needs a filesystem graph immediately, while later releases must add packages, symbols, domain nouns, actors, actions, data flow, commits, and work items. Ingestion, analytics, and rendering need one versioned boundary.

## Decision

Store all graph entities in `nodes` and all relationships in `edges`, with extensible kind registries. Make scans immutable snapshots and compare snapshots through deterministic `stable_key` values. Store relation evidence separately from the relation itself.

## Consequences

This lets new semantic kinds arrive as data rather than schema migrations and prevents a partial rescan from corrupting the last complete view. It gives up specialized per-language columns and some relational type enforcement: a writer could attempt a nonsensical edge such as `contains` between two actions. Ingestion conformance tests therefore remain part of the contract.

The choice is reversible: high-volume or language-specific attributes can later move from `attributes_json` into typed side tables without changing node identity.

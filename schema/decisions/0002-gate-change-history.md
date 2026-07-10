# 0002 — Gate issue-to-file change history by observed quality

Status: accepted, 2026-07-10

## Context

The supplied AgentsCommander checkout is shallow and exposes one grafted commit. Its message references `#904`, so a mechanically derived `touches` layer is non-empty, but that root commit reports every tracked path as added. Displaying the result as normal history would imply that one work item owns the entire repository.

## Decision

Keep `commit`, `issue`, `modifies`, `references`, and derived `touches` in v1, but require an `issue_file_touches` capability row on every snapshot. The current fixture marks it `degraded` and records why.

## Consequences

We retain a valuable architectural layer when full history is available and avoid silently presenting low-quality evidence. We give up treating every non-empty Git result as usable; the UI and analytics need an explicit degraded-state path.

The decision is reversible per snapshot: a full-history scan can mark the same capability `available` without a schema change.

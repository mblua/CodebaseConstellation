import type { EdgeKindInfo, SnapshotInfo } from "./model";

const INTENTIONALLY_DISABLED_HISTORY_CAPABILITIES = new Set([
  "git_history",
  "issue_file_touches",
]);

export function hasChangeEdges(edgeKinds: readonly Pick<EdgeKindInfo, "category" | "count">[]): boolean {
  return edgeKinds.some((kind) => kind.category === "change" && kind.count > 0);
}

export function shouldHideHistoryCapability(
  historyMode: SnapshotInfo["historyMode"],
  capability: string,
): boolean {
  return historyMode === "absent" && INTENTIONALLY_DISABLED_HISTORY_CAPABILITIES.has(capability);
}

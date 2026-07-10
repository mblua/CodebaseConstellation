import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NODE_ADJACENCY_QUERY } from "../src/detailQueries";

interface NodeRow {
  id: number;
  snapshot_id: number;
}

interface AdjacencyRow {
  edge_id: number;
  neighbor_name: string;
}

describe("seed node adjacency query", () => {
  it("returns exactly the six edges for sessions_persistence.rs, not the 92-edge snapshot", () => {
    const databasePath = fileURLToPath(new URL("../../fixtures/seed.sqlite", import.meta.url));
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const node = database.prepare(
        "SELECT id, snapshot_id FROM nodes WHERE stable_key = ?",
      ).get("fs:src-tauri/src/config/sessions_persistence.rs") as unknown as NodeRow;
      expect(node).toBeDefined();

      const rows = database.prepare(NODE_ADJACENCY_QUERY).all(
        node.snapshot_id,
        node.id,
        node.id,
        node.id,
        node.id,
        node.id,
      ) as unknown as AdjacencyRow[];
      const uniqueEdgeIds = new Set(rows.map((row) => row.edge_id));

      expect(uniqueEdgeIds.size).toBe(6);
      expect(rows.map((row) => row.neighbor_name)).not.toContain("package.json");
    } finally {
      database.close();
    }
  });
});

import SQLiteESMFactory from "wa-sqlite/dist/wa-sqlite.mjs";
import sqliteWasmUrl from "wa-sqlite/dist/wa-sqlite.wasm?url";
import * as SQLite from "wa-sqlite";
import { MemoryVFS } from "wa-sqlite/src/examples/MemoryVFS.js";
import { SQLITE_OPEN_READONLY } from "wa-sqlite/src/sqlite-constants.js";
import {
  decodeEdges,
  decodePositions,
  validateSha256,
  type BlobMetadata,
} from "./blobDecoder";
import type {
  CapabilityInfo,
  CapabilityStatus,
  EdgeKindInfo,
  EvidenceInfo,
  FindingInfo,
  GraphDataset,
  LabelCandidate,
  LayoutInfo,
  MetricInfo,
  NeighborInfo,
  NodeDetail,
  NodeKindInfo,
  SearchResult,
  SnapshotInfo,
} from "./model";
import { NODE_ADJACENCY_QUERY } from "./detailQueries";

type SQLiteApi = ReturnType<typeof SQLite.Factory>;
type SQLiteValue = number | string | Uint8Array | number[] | bigint | null;
type QueryBindings = Array<number | string | Uint8Array | bigint | null>;
type Row = Record<string, SQLiteValue>;

const REQUIRED_TABLES = [
  "schema_migrations",
  "snapshots",
  "snapshot_capabilities",
  "nodes",
  "node_kinds",
  "edges",
  "edge_kinds",
  "edge_evidence",
  "node_metrics",
  "layouts",
  "graph_blobs",
  "finding_threads",
  "finding_occurrences",
  "finding_nodes",
  "finding_edges",
] as const;

export class DatabaseContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseContractError";
  }
}

function required<T>(value: T | null | undefined, context: string): T {
  if (value === null || value === undefined) {
    throw new DatabaseContractError(`${context} is missing`);
  }
  return value;
}

function asString(value: SQLiteValue | undefined, context: string): string {
  if (typeof value !== "string") {
    throw new DatabaseContractError(`${context} must be text`);
  }
  return value;
}

function asNullableString(value: SQLiteValue | undefined, context: string): string | null {
  if (value === null || value === undefined) return null;
  return asString(value, context);
}

function asNumber(value: SQLiteValue | undefined, context: string): number {
  if (typeof value === "bigint") {
    const numberValue = Number(value);
    if (!Number.isSafeInteger(numberValue)) {
      throw new DatabaseContractError(`${context} is outside JavaScript's safe integer range`);
    }
    return numberValue;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DatabaseContractError(`${context} must be a finite number`);
  }
  return value;
}

function asNullableNumber(value: SQLiteValue | undefined, context: string): number | null {
  if (value === null || value === undefined) return null;
  return asNumber(value, context);
}

function asInteger(value: SQLiteValue | undefined, context: string): number {
  const result = asNumber(value, context);
  if (!Number.isSafeInteger(result)) {
    throw new DatabaseContractError(`${context} must be an integer`);
  }
  return result;
}

function asBigInt(value: SQLiteValue | undefined, context: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  throw new DatabaseContractError(`${context} must be a non-negative 64-bit integer`);
}

function asBlob(value: SQLiteValue | undefined, context: string): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value) && value.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 255)) {
    return new Uint8Array(value);
  }
  throw new DatabaseContractError(`${context} must be a SQLite BLOB`);
}

function parseObject(value: SQLiteValue | undefined, context: string): Record<string, unknown> {
  const source = asString(value, context);
  try {
    const parsed: unknown = JSON.parse(source);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("expected an object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new DatabaseContractError(
      `${context} contains invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function parseBounds(value: SQLiteValue | undefined): LayoutInfo["bounds"] {
  const object = parseObject(value, "layouts.bounds_json");
  const minimum = object.min;
  const maximum = object.max;
  if (
    !Array.isArray(minimum) ||
    !Array.isArray(maximum) ||
    minimum.length !== 3 ||
    maximum.length !== 3 ||
    !minimum.every((entry) => typeof entry === "number" && Number.isFinite(entry)) ||
    !maximum.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  ) {
    throw new DatabaseContractError("layouts.bounds_json must contain finite min/max xyz arrays");
  }
  return {
    min: [minimum[0] as number, minimum[1] as number, minimum[2] as number],
    max: [maximum[0] as number, maximum[1] as number, maximum[2] as number],
  };
}

function assertSQLiteHeader(bytes: Uint8Array): void {
  const signature = "SQLite format 3\0";
  if (bytes.byteLength < 100) {
    throw new DatabaseContractError(`database file is only ${bytes.byteLength} bytes; a SQLite v3 header needs 100`);
  }
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature.charCodeAt(index)) {
      throw new DatabaseContractError("selected file is not a SQLite 3 database (header signature mismatch)");
    }
  }
}

function blobMetadata(row: Row, kind: "positions" | "edges", snapshotId: bigint, layoutId: bigint): BlobMetadata {
  return {
    kind,
    formatVersion: asInteger(row.format_version, `${kind}.format_version`),
    recordCount: asInteger(row.record_count, `${kind}.record_count`),
    byteLength: asInteger(row.byte_length, `${kind}.byte_length`),
    sha256Hex: asString(row.sha256_hex, `${kind}.sha256_hex`),
    snapshotId,
    layoutId,
  };
}

function capabilityStatus(value: string): CapabilityStatus {
  if (value === "available" || value === "degraded" || value === "unavailable") return value;
  throw new DatabaseContractError(`unknown snapshot capability status ${JSON.stringify(value)}`);
}

export class GraphDatabase {
  readonly sourceLabel: string;
  readonly bytes: number;
  #sqlite3: SQLiteApi;
  #database: number;
  #vfs: MemoryVFS;
  #dataset: GraphDataset | null = null;
  #queryTail: Promise<void> = Promise.resolve();

  private constructor(
    sourceLabel: string,
    bytes: number,
    sqlite3: SQLiteApi,
    database: number,
    vfs: MemoryVFS,
  ) {
    this.sourceLabel = sourceLabel;
    this.bytes = bytes;
    this.#sqlite3 = sqlite3;
    this.#database = database;
    this.#vfs = vfs;
  }

  static async open(bytes: Uint8Array, sourceLabel: string): Promise<GraphDatabase> {
    assertSQLiteHeader(bytes);
    const module = await SQLiteESMFactory({
      locateFile: () => sqliteWasmUrl,
    });
    const sqlite3 = SQLite.Factory(module);
    const vfs = new MemoryVFS();
    const filename = "/constellation.sqlite";
    const ownedBytes = bytes.slice();
    vfs.mapNameToFile.set(filename, {
      name: filename,
      flags: SQLITE_OPEN_READONLY,
      size: ownedBytes.byteLength,
      data: ownedBytes.buffer,
    });
    sqlite3.vfs_register(vfs as unknown as Parameters<SQLiteApi["vfs_register"]>[0], true);

    let database: number;
    try {
      database = await sqlite3.open_v2(filename, SQLITE_OPEN_READONLY, vfs.name);
    } catch (error) {
      (vfs as MemoryVFS & { close(): void }).close();
      throw new DatabaseContractError(
        `SQLite could not open ${sourceLabel}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return new GraphDatabase(sourceLabel, ownedBytes.byteLength, sqlite3, database, vfs);
  }

  async close(): Promise<void> {
    await this.#queryTail;
    if (this.#database !== 0) {
      await this.#sqlite3.close(this.#database);
      this.#database = 0;
    }
    (this.#vfs as MemoryVFS & { close(): void }).close();
    this.#vfs.mapNameToFile.clear();
    this.#dataset = null;
  }

  #query(sql: string, bindings: QueryBindings = []): Promise<Row[]> {
    const operation = this.#queryTail.then(() => this.#executeQuery(sql, bindings));
    this.#queryTail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async #executeQuery(sql: string, bindings: QueryBindings): Promise<Row[]> {
    if (this.#database === 0) throw new Error("database is closed");
    const rows: Row[] = [];
    for await (const statement of this.#sqlite3.statements(this.#database, sql)) {
      if (bindings.length > 0) this.#sqlite3.bind_collection(statement, bindings);
      const columns = this.#sqlite3.column_names(statement);
      while ((await this.#sqlite3.step(statement)) === SQLite.SQLITE_ROW) {
        const values = this.#sqlite3.row(statement);
        const row: Row = {};
        columns.forEach((column, index) => {
          row[column] = values[index] ?? null;
        });
        rows.push(row);
      }
    }
    return rows;
  }

  async loadGraph(): Promise<GraphDataset> {
    if (this.#dataset) return this.#dataset;
    const versionRows = await this.#query("PRAGMA user_version");
    const userVersion = asInteger(required(versionRows[0], "PRAGMA user_version").user_version, "PRAGMA user_version");
    if (userVersion !== 1) {
      throw new DatabaseContractError(`PRAGMA user_version is ${userVersion}; this renderer requires contract v1`);
    }
    const migrationRows = await this.#query(
      "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1",
    );
    const migrationVersion = asInteger(required(migrationRows[0], "schema_migrations version").version, "schema_migrations.version");
    if (migrationVersion !== 1) {
      throw new DatabaseContractError(`schema_migrations reports ${migrationVersion}; this renderer requires v1`);
    }

    const tableRows = await this.#query(
      "SELECT name FROM sqlite_master WHERE type IN ('table', 'view')",
    );
    const tableNames = new Set(tableRows.map((row) => asString(row.name, "sqlite_master.name")));
    const missingTables = REQUIRED_TABLES.filter((table) => !tableNames.has(table));
    if (missingTables.length > 0) {
      throw new DatabaseContractError(`contract v1 tables are missing: ${missingTables.join(", ")}`);
    }

    const snapshotRows = await this.#query(`
      SELECT s.id, s.repository_id, r.name AS repository_name, s.revision,
             s.history_mode, s.visible_commit_count, s.completed_at
      FROM snapshots AS s
      JOIN repositories AS r ON r.id = s.repository_id
      WHERE s.status = 'complete'
      ORDER BY s.started_at DESC, s.id DESC
      LIMIT 1
    `);
    const snapshotRow = required(snapshotRows[0], "a complete snapshot");
    const snapshot: SnapshotInfo = {
      id: asBigInt(snapshotRow.id, "snapshots.id"),
      repositoryId: asBigInt(snapshotRow.repository_id, "snapshots.repository_id"),
      repositoryName: asString(snapshotRow.repository_name, "repositories.name"),
      revision: asString(snapshotRow.revision, "snapshots.revision"),
      historyMode: asString(snapshotRow.history_mode, "snapshots.history_mode") as SnapshotInfo["historyMode"],
      visibleCommitCount: asInteger(snapshotRow.visible_commit_count, "snapshots.visible_commit_count"),
      completedAt: asString(snapshotRow.completed_at, "snapshots.completed_at"),
    };

    const layoutRows = await this.#query(
      `SELECT id, snapshot_id, name, algorithm, dimensions, bounds_json, node_count, edge_count
       FROM layouts
       WHERE snapshot_id = ? AND status = 'complete'
         AND EXISTS (SELECT 1 FROM graph_blobs WHERE layout_id = layouts.id AND kind = 'positions')
         AND EXISTS (SELECT 1 FROM graph_blobs WHERE layout_id = layouts.id AND kind = 'edges')
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [snapshot.id],
    );
    const layoutRow = required(layoutRows[0], "a complete layout with both v1 blobs");
    const layout: LayoutInfo = {
      id: asBigInt(layoutRow.id, "layouts.id"),
      snapshotId: asBigInt(layoutRow.snapshot_id, "layouts.snapshot_id"),
      name: asString(layoutRow.name, "layouts.name"),
      algorithm: asString(layoutRow.algorithm, "layouts.algorithm"),
      dimensions: asInteger(layoutRow.dimensions, "layouts.dimensions"),
      bounds: parseBounds(layoutRow.bounds_json),
      nodeCount: asInteger(layoutRow.node_count, "layouts.node_count"),
      edgeCount: asInteger(layoutRow.edge_count, "layouts.edge_count"),
    };
    if (layout.snapshotId !== snapshot.id) {
      throw new DatabaseContractError(`layout ${layout.id} belongs to snapshot ${layout.snapshotId}, not ${snapshot.id}`);
    }
    if (layout.dimensions !== 3) {
      throw new DatabaseContractError(`layout ${layout.id} has ${layout.dimensions} dimensions; the 3D renderer requires 3`);
    }

    const [capabilityRows, nodeKindRows, edgeKindRows, blobRows] = await Promise.all([
      this.#query(
        "SELECT capability, status, coverage, detail FROM snapshot_capabilities WHERE snapshot_id = ? ORDER BY capability",
        [snapshot.id],
      ),
      this.#query(
        `SELECT nk.key, nk.category, nk.render_code, nk.description, count(n.id) AS count
         FROM node_kinds AS nk
         LEFT JOIN nodes AS n ON n.kind = nk.key AND n.snapshot_id = ?
         GROUP BY nk.key, nk.category, nk.render_code, nk.description
         ORDER BY nk.render_code`,
        [snapshot.id],
      ),
      this.#query(
        `SELECT ek.key, ek.category, ek.render_code, ek.directed, ek.description, count(e.id) AS count
         FROM edge_kinds AS ek
         LEFT JOIN edges AS e ON e.kind = ek.key AND e.snapshot_id = ?
         GROUP BY ek.key, ek.category, ek.render_code, ek.directed, ek.description
         ORDER BY ek.render_code`,
        [snapshot.id],
      ),
      this.#query(
        `SELECT kind, format_version, byte_order, compression, record_count,
                byte_length, sha256_hex, content
         FROM graph_blobs
         WHERE layout_id = ?
         ORDER BY kind`,
        [layout.id],
      ),
    ]);

    const capabilities: CapabilityInfo[] = capabilityRows.map((row) => ({
      capability: asString(row.capability, "snapshot_capabilities.capability"),
      status: capabilityStatus(asString(row.status, "snapshot_capabilities.status")),
      coverage: asNullableNumber(row.coverage, "snapshot_capabilities.coverage"),
      detail: asString(row.detail, "snapshot_capabilities.detail"),
    }));
    const nodeKinds: NodeKindInfo[] = nodeKindRows.map((row) => ({
      key: asString(row.key, "node_kinds.key"),
      category: asString(row.category, "node_kinds.category"),
      renderCode: asInteger(row.render_code, "node_kinds.render_code"),
      description: asString(row.description, "node_kinds.description"),
      count: asInteger(row.count, "node kind count"),
    }));
    const edgeKinds: EdgeKindInfo[] = edgeKindRows.map((row) => ({
      key: asString(row.key, "edge_kinds.key"),
      category: asString(row.category, "edge_kinds.category"),
      renderCode: asInteger(row.render_code, "edge_kinds.render_code"),
      directed: asInteger(row.directed, "edge_kinds.directed") === 1,
      description: asString(row.description, "edge_kinds.description"),
      count: asInteger(row.count, "edge kind count"),
    }));

    const blobByKind = new Map(blobRows.map((row) => [asString(row.kind, "graph_blobs.kind"), row]));
    const positionRow = required(blobByKind.get("positions"), "positions graph blob");
    const edgeRow = required(blobByKind.get("edges"), "edges graph blob");
    for (const [kind, row] of [["positions", positionRow], ["edges", edgeRow]] as const) {
      const byteOrder = asString(row.byte_order, `${kind}.byte_order`);
      const compression = asString(row.compression, `${kind}.compression`);
      if (byteOrder !== "little") throw new DatabaseContractError(`${kind} byte_order is ${byteOrder}; v1 requires little`);
      if (compression !== "none") throw new DatabaseContractError(`${kind} compression is ${compression}; v1 requires none`);
    }
    const positionBytes = asBlob(positionRow.content, "positions.content");
    const edgeBytes = asBlob(edgeRow.content, "edges.content");
    const positionMeta = blobMetadata(positionRow, "positions", snapshot.id, layout.id);
    const edgeMeta = blobMetadata(edgeRow, "edges", snapshot.id, layout.id);
    await Promise.all([
      validateSha256(positionBytes, positionMeta),
      validateSha256(edgeBytes, edgeMeta),
    ]);
    const positions = decodePositions(positionBytes, positionMeta);
    const edges = decodeEdges(edgeBytes, edgeMeta, positions.nodeIds.length);
    if (positions.nodeIds.length !== layout.nodeCount) {
      throw new DatabaseContractError(`layout node_count is ${layout.nodeCount}, but positions has ${positions.nodeIds.length} records`);
    }
    if (edges.edgeIds.length !== layout.edgeCount) {
      throw new DatabaseContractError(`layout edge_count is ${layout.edgeCount}, but edges has ${edges.edgeIds.length} records`);
    }

    const nodeKindByCode = new Map(nodeKinds.map((kind) => [kind.renderCode, kind]));
    positions.kindCodes.forEach((code, index) => {
      const kind = nodeKindByCode.get(code);
      if (!kind) throw new DatabaseContractError(`positions record ${index} uses unknown node render_code ${code}`);
      const flags = positions.flags[index] ?? 0;
      if (Boolean(flags & 0x02) !== (kind.category === "semantic")) {
        throw new DatabaseContractError(`positions record ${index} semantic flag disagrees with node kind ${kind.key}`);
      }
      if (Boolean(flags & 0x04) !== (kind.category === "change")) {
        throw new DatabaseContractError(`positions record ${index} change flag disagrees with node kind ${kind.key}`);
      }
    });
    const edgeKindByCode = new Map(edgeKinds.map((kind) => [kind.renderCode, kind]));
    edges.kindCodes.forEach((code, index) => {
      const kind = edgeKindByCode.get(code);
      if (!kind) throw new DatabaseContractError(`edges record ${index} uses unknown edge render_code ${code}`);
      const directed = Boolean((edges.flags[index] ?? 0) & 0x01);
      if (directed !== kind.directed) {
        throw new DatabaseContractError(`edges record ${index} directed flag disagrees with edge kind ${kind.key}`);
      }
    });

    const nodeIndexById = new Map<string, number>();
    positions.nodeIds.forEach((nodeId, index) => nodeIndexById.set(nodeId.toString(), index));
    this.#dataset = {
      sourceLabel: this.sourceLabel,
      snapshot,
      layout,
      capabilities,
      nodeKinds,
      edgeKinds,
      positions,
      edges,
      nodeIndexById,
    };
    return this.#dataset;
  }

  async searchNodes(query: string, limit = 24): Promise<SearchResult[]> {
    const dataset = await this.loadGraph();
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return [];
    const escaped = normalized.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
    const pattern = `%${escaped}%`;
    const rows = await this.#query(
      `SELECT id, name, kind, path, qualified_name, confidence
       FROM nodes
       WHERE snapshot_id = ?
         AND (lower(name) LIKE ? ESCAPE '\\'
              OR lower(coalesce(path, '')) LIKE ? ESCAPE '\\'
              OR lower(coalesce(qualified_name, '')) LIKE ? ESCAPE '\\')
       ORDER BY CASE WHEN lower(name) = ? THEN 0
                     WHEN lower(name) LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END,
                confidence DESC, name
       LIMIT ?`,
      [dataset.snapshot.id, pattern, pattern, pattern, normalized, `${escaped}%`, limit],
    );
    return rows.map((row) => ({
      id: asBigInt(row.id, "nodes.id"),
      name: asString(row.name, "nodes.name"),
      kind: asString(row.kind, "nodes.kind"),
      path: asNullableString(row.path, "nodes.path"),
      qualifiedName: asNullableString(row.qualified_name, "nodes.qualified_name"),
      confidence: asNumber(row.confidence, "nodes.confidence"),
    }));
  }

  async getLabelCandidates(limit = 200): Promise<LabelCandidate[]> {
    const dataset = await this.loadGraph();
    const cappedLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
    const rows = await this.#query(
      `SELECT n.id, n.name, n.kind,
              coalesce(max(CASE WHEN lower(replace(nm.key, '_', '')) = 'pagerank' THEN nm.value END), 0) AS page_rank
       FROM nodes AS n
       LEFT JOIN node_metrics AS nm ON nm.snapshot_id = n.snapshot_id AND nm.node_id = n.id
       WHERE n.snapshot_id = ?
       GROUP BY n.id, n.name, n.kind, n.confidence
       ORDER BY page_rank DESC,
                CASE n.kind WHEN 'repository' THEN 0 WHEN 'package' THEN 1 WHEN 'directory' THEN 2
                            WHEN 'actor' THEN 3 WHEN 'action' THEN 4 WHEN 'concept' THEN 5
                            WHEN 'file' THEN 6 ELSE 7 END,
                n.confidence DESC, n.id
       LIMIT ?`,
      [dataset.snapshot.id, cappedLimit],
    );
    return rows.flatMap((row) => {
      const nodeId = asBigInt(row.id, "nodes.id");
      const nodeIndex = dataset.nodeIndexById.get(nodeId.toString());
      if (nodeIndex === undefined) return [];
      return [{
        nodeId,
        nodeIndex,
        name: asString(row.name, "nodes.name"),
        kind: asString(row.kind, "nodes.kind"),
        pageRank: asNumber(row.page_rank, "node page rank"),
      }];
    });
  }

  async getGlobalFindings(): Promise<FindingInfo[]> {
    const dataset = await this.loadGraph();
    const rows = await this.#query(
      `SELECT ft.id, ft.title, fo.detail, ft.recommendation, ft.category,
              ft.severity, ft.status
       FROM finding_occurrences AS fo
       JOIN finding_threads AS ft ON ft.id = fo.finding_id
       WHERE fo.snapshot_id = ?
       ORDER BY CASE ft.severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, ft.id
       LIMIT 100`,
      [dataset.snapshot.id],
    );
    return rows.map((row) => this.#findingFromRow(row, null));
  }

  #findingFromRow(row: Row, role: string | null): FindingInfo {
    const severity = asString(row.severity, "finding severity");
    if (severity !== "info" && severity !== "warning" && severity !== "error") {
      throw new DatabaseContractError(`unknown finding severity ${severity}`);
    }
    return {
      id: asBigInt(row.id, "finding id"),
      title: asString(row.title, "finding title"),
      detail: asString(row.detail, "finding detail"),
      recommendation: asString(row.recommendation, "finding recommendation"),
      category: asString(row.category, "finding category"),
      severity,
      status: asString(row.status, "finding status"),
      role,
    };
  }

  async getNodeDetail(nodeId: bigint): Promise<NodeDetail> {
    const dataset = await this.loadGraph();
    const [nodeRows, metricRows, neighborRows, findingRows] = await Promise.all([
      this.#query(
        `SELECT id, stable_key, kind, name, qualified_name, path, language, external,
                start_line, end_line, confidence, attributes_json
         FROM nodes WHERE snapshot_id = ? AND id = ?`,
        [dataset.snapshot.id, nodeId],
      ),
      this.#query(
        `SELECT key, value, unit, provenance FROM node_metrics
         WHERE snapshot_id = ? AND node_id = ? ORDER BY key`,
        [dataset.snapshot.id, nodeId],
      ),
      this.#query(
        NODE_ADJACENCY_QUERY,
        [dataset.snapshot.id, nodeId, nodeId, nodeId, nodeId, nodeId],
      ),
      this.#query(
        `SELECT ft.id, ft.title, fo.detail, ft.recommendation, ft.category,
                ft.severity, ft.status, fn.role
         FROM finding_nodes AS fn
         JOIN finding_occurrences AS fo
           ON fo.finding_id = fn.finding_id AND fo.snapshot_id = fn.snapshot_id
         JOIN finding_threads AS ft ON ft.id = fn.finding_id
         WHERE fn.snapshot_id = ? AND fn.node_id = ?
         ORDER BY ft.id, fn.role`,
        [dataset.snapshot.id, nodeId],
      ),
    ]);
    const node = required(nodeRows[0], `node ${nodeId}`);
    const metrics: MetricInfo[] = metricRows.map((row) => ({
      key: asString(row.key, "node_metrics.key"),
      value: asNumber(row.value, "node_metrics.value"),
      unit: asString(row.unit, "node_metrics.unit"),
      provenance: asString(row.provenance, "node_metrics.provenance"),
    }));

    const neighborByEdge = new Map<string, NeighborInfo>();
    for (const row of neighborRows) {
      const edgeId = asBigInt(row.edge_id, "edges.id");
      const key = edgeId.toString();
      let neighbor = neighborByEdge.get(key);
      if (!neighbor) {
        const directionValue = asString(row.direction, "edge direction");
        if (directionValue !== "incoming" && directionValue !== "outgoing" && directionValue !== "undirected") {
          throw new DatabaseContractError(`invalid edge direction ${directionValue}`);
        }
        neighbor = {
          edgeId,
          edgeKind: asString(row.edge_kind, "edges.kind"),
          edgeCategory: asString(row.edge_category, "edge_kinds.category"),
          edgeConfidence: asNumber(row.edge_confidence, "edges.confidence"),
          edgeWeight: asNumber(row.edge_weight, "edges.weight"),
          derived: asInteger(row.is_derived, "edges.is_derived") === 1,
          direction: directionValue,
          nodeId: asBigInt(row.neighbor_id, "neighbor id"),
          nodeName: asString(row.neighbor_name, "neighbor name"),
          nodeKind: asString(row.neighbor_kind, "neighbor kind"),
          nodePath: asNullableString(row.neighbor_path, "neighbor path"),
          evidence: [],
        };
        neighborByEdge.set(key, neighbor);
      }
      if (row.evidence_id !== null && row.evidence_id !== undefined) {
        const evidence: EvidenceInfo = {
          id: asBigInt(row.evidence_id, "edge_evidence.id"),
          kind: asString(row.evidence_kind, "edge_evidence.evidence_kind"),
          fileNodeId: row.file_node_id === null ? null : asBigInt(row.file_node_id, "edge_evidence.file_node_id"),
          startLine: asNullableNumber(row.start_line, "edge_evidence.start_line"),
          endLine: asNullableNumber(row.end_line, "edge_evidence.end_line"),
          commitHash: asNullableString(row.commit_hash, "edge_evidence.commit_hash"),
          issueKey: asNullableString(row.issue_key, "edge_evidence.issue_key"),
          excerpt: asNullableString(row.excerpt, "edge_evidence.excerpt"),
        };
        neighbor.evidence.push(evidence);
      }
    }

    return {
      id: asBigInt(node.id, "nodes.id"),
      stableKey: asString(node.stable_key, "nodes.stable_key"),
      kind: asString(node.kind, "nodes.kind"),
      name: asString(node.name, "nodes.name"),
      qualifiedName: asNullableString(node.qualified_name, "nodes.qualified_name"),
      path: asNullableString(node.path, "nodes.path"),
      language: asNullableString(node.language, "nodes.language"),
      external: asInteger(node.external, "nodes.external") === 1,
      startLine: asNullableNumber(node.start_line, "nodes.start_line"),
      endLine: asNullableNumber(node.end_line, "nodes.end_line"),
      confidence: asNumber(node.confidence, "nodes.confidence"),
      attributes: parseObject(node.attributes_json, "nodes.attributes_json"),
      metrics,
      neighbors: [...neighborByEdge.values()],
      findings: findingRows.map((row) => this.#findingFromRow(row, asString(row.role, "finding_nodes.role"))),
    };
  }
}

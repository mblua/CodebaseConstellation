PRAGMA foreign_keys = ON;

BEGIN IMMEDIATE;

CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY CHECK (version > 0),
    name TEXT NOT NULL UNIQUE CHECK (length(name) > 0),
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE node_kinds (
    key TEXT PRIMARY KEY CHECK (length(key) > 0),
    category TEXT NOT NULL CHECK (category IN ('structural', 'code', 'semantic', 'external', 'change')),
    render_code INTEGER NOT NULL UNIQUE CHECK (render_code BETWEEN 1 AND 65535),
    description TEXT NOT NULL
) STRICT;

CREATE TABLE edge_kinds (
    key TEXT PRIMARY KEY CHECK (length(key) > 0),
    category TEXT NOT NULL CHECK (category IN ('structural', 'dependency', 'execution', 'data_flow', 'semantic', 'change')),
    render_code INTEGER NOT NULL UNIQUE CHECK (render_code BETWEEN 1 AND 65535),
    directed INTEGER NOT NULL CHECK (directed IN (0, 1)),
    description TEXT NOT NULL
) STRICT;

INSERT INTO node_kinds (key, category, render_code, description) VALUES
    ('repository',      'structural',  1, 'The analyzed repository root'),
    ('directory',       'structural',  2, 'A versioned filesystem directory'),
    ('file',            'structural',  3, 'A versioned filesystem file'),
    ('package',         'structural',  4, 'A package or workspace unit defined by a manifest'),
    ('module',          'code',        5, 'A language-level module that is not identical to a file'),
    ('symbol',          'code',        6, 'A declared code symbol'),
    ('actor',           'semantic',    7, 'A person or system role that initiates behavior'),
    ('concept',         'semantic',    8, 'A domain noun represented by the codebase'),
    ('action',          'semantic',    9, 'A domain verb or use-case action'),
    ('data_store',      'semantic',   10, 'A durable or transient data store'),
    ('external_system', 'external',   11, 'A system outside the analyzed repository'),
    ('commit',          'change',     12, 'A source-control commit'),
    ('issue',           'change',     13, 'An issue, pull request, or other referenced work item');

INSERT INTO edge_kinds (key, category, render_code, directed, description) VALUES
    ('contains',   'structural',  1, 1, 'Repository or directory contains a filesystem child'),
    ('groups',     'structural',  2, 1, 'Package or module groups a code artifact'),
    ('declares',   'structural',  3, 1, 'File or module declares a symbol'),
    ('imports',    'dependency',  4, 1, 'Source code artifact imports another artifact'),
    ('depends_on', 'dependency',  5, 1, 'Package or component depends on another'),
    ('calls',      'execution',   6, 1, 'Symbol calls another symbol'),
    ('invokes',    'execution',   7, 1, 'Actor, action, or component invokes another component'),
    ('reads',      'data_flow',   8, 1, 'Source reads a concept or data store'),
    ('writes',     'data_flow',   9, 1, 'Source writes a concept or data store'),
    ('emits',      'data_flow',  10, 1, 'Source emits a concept or event'),
    ('consumes',   'data_flow',  11, 1, 'Source consumes a concept or event'),
    ('flows_to',   'data_flow',  12, 1, 'Information flows from source to target'),
    ('performs',   'semantic',   13, 1, 'Actor performs an action'),
    ('acts_on',    'semantic',   14, 1, 'Action operates on a domain concept'),
    ('models',     'semantic',   15, 1, 'Code artifact models a semantic node'),
    ('modifies',   'change',     16, 1, 'Commit modifies a file'),
    ('references', 'change',     17, 1, 'Commit references a work item'),
    ('touches',    'change',     18, 1, 'Work item reaches a file through a referencing commit'),
    ('related_to', 'semantic',   19, 0, 'Non-directional relation with explicit evidence');

CREATE TABLE repositories (
    id INTEGER PRIMARY KEY,
    stable_key TEXT NOT NULL UNIQUE CHECK (length(stable_key) > 0),
    name TEXT NOT NULL CHECK (length(name) > 0),
    root_path TEXT NOT NULL CHECK (length(root_path) > 0),
    vcs_kind TEXT NOT NULL DEFAULT 'git' CHECK (vcs_kind IN ('git', 'none')),
    remote_url TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    attributes_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attributes_json))
) STRICT;

CREATE TABLE snapshots (
    id INTEGER PRIMARY KEY,
    repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    revision TEXT NOT NULL CHECK (length(revision) > 0),
    content_hash TEXT NOT NULL CHECK (length(content_hash) > 0),
    status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
    history_mode TEXT NOT NULL CHECK (history_mode IN ('full', 'shallow', 'absent')),
    visible_commit_count INTEGER NOT NULL DEFAULT 0 CHECK (visible_commit_count >= 0),
    started_at TEXT NOT NULL,
    completed_at TEXT,
    scanner_version TEXT NOT NULL CHECK (length(scanner_version) > 0),
    attributes_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attributes_json)),
    UNIQUE (repository_id, content_hash),
    CHECK ((status = 'running' AND completed_at IS NULL) OR (status <> 'running' AND completed_at IS NOT NULL))
) STRICT;

CREATE INDEX snapshots_repository_started_idx
    ON snapshots(repository_id, started_at DESC);

CREATE TABLE snapshot_capabilities (
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    capability TEXT NOT NULL CHECK (length(capability) > 0),
    status TEXT NOT NULL CHECK (status IN ('available', 'degraded', 'unavailable')),
    coverage REAL CHECK (coverage IS NULL OR (coverage >= 0.0 AND coverage <= 1.0)),
    detail TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, capability)
) STRICT;

CREATE TABLE nodes (
    id INTEGER PRIMARY KEY,
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    stable_key TEXT NOT NULL CHECK (length(stable_key) > 0),
    kind TEXT NOT NULL REFERENCES node_kinds(key),
    name TEXT NOT NULL CHECK (length(name) > 0),
    qualified_name TEXT,
    path TEXT,
    language TEXT,
    external INTEGER NOT NULL DEFAULT 0 CHECK (external IN (0, 1)),
    start_line INTEGER,
    end_line INTEGER,
    confidence REAL NOT NULL DEFAULT 1.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
    attributes_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attributes_json)),
    UNIQUE (snapshot_id, stable_key),
    UNIQUE (snapshot_id, id),
    CHECK (
        (start_line IS NULL AND end_line IS NULL)
        OR (start_line >= 1 AND end_line >= start_line)
    )
) STRICT;

CREATE INDEX nodes_snapshot_kind_idx ON nodes(snapshot_id, kind);
CREATE INDEX nodes_snapshot_path_idx ON nodes(snapshot_id, path);

CREATE TABLE edges (
    id INTEGER PRIMARY KEY,
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    stable_key TEXT NOT NULL CHECK (length(stable_key) > 0),
    source_node_id INTEGER NOT NULL,
    target_node_id INTEGER NOT NULL,
    kind TEXT NOT NULL REFERENCES edge_kinds(key),
    weight REAL NOT NULL DEFAULT 1.0 CHECK (weight >= 0.0),
    confidence REAL NOT NULL DEFAULT 1.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
    is_derived INTEGER NOT NULL DEFAULT 0 CHECK (is_derived IN (0, 1)),
    attributes_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attributes_json)),
    UNIQUE (snapshot_id, stable_key),
    UNIQUE (snapshot_id, id),
    FOREIGN KEY (snapshot_id, source_node_id) REFERENCES nodes(snapshot_id, id) ON DELETE CASCADE,
    FOREIGN KEY (snapshot_id, target_node_id) REFERENCES nodes(snapshot_id, id) ON DELETE CASCADE,
    CHECK (source_node_id <> target_node_id OR kind = 'related_to')
) STRICT;

CREATE INDEX edges_snapshot_kind_idx ON edges(snapshot_id, kind);
CREATE INDEX edges_snapshot_source_idx ON edges(snapshot_id, source_node_id);
CREATE INDEX edges_snapshot_target_idx ON edges(snapshot_id, target_node_id);

CREATE TABLE edge_evidence (
    id INTEGER PRIMARY KEY,
    snapshot_id INTEGER NOT NULL,
    edge_id INTEGER NOT NULL,
    evidence_kind TEXT NOT NULL CHECK (evidence_kind IN ('filesystem', 'manifest', 'syntax', 'git', 'heuristic', 'manual')),
    file_node_id INTEGER,
    start_line INTEGER,
    end_line INTEGER,
    commit_hash TEXT,
    issue_key TEXT,
    excerpt TEXT,
    attributes_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attributes_json)),
    FOREIGN KEY (snapshot_id, edge_id) REFERENCES edges(snapshot_id, id) ON DELETE CASCADE,
    FOREIGN KEY (snapshot_id, file_node_id) REFERENCES nodes(snapshot_id, id) ON DELETE CASCADE,
    CHECK (
        (start_line IS NULL AND end_line IS NULL)
        OR (start_line >= 1 AND end_line >= start_line)
    )
) STRICT;

CREATE INDEX edge_evidence_edge_idx ON edge_evidence(snapshot_id, edge_id);

CREATE TABLE node_metrics (
    snapshot_id INTEGER NOT NULL,
    node_id INTEGER NOT NULL,
    key TEXT NOT NULL CHECK (length(key) > 0),
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    provenance TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, node_id, key),
    FOREIGN KEY (snapshot_id, node_id) REFERENCES nodes(snapshot_id, id) ON DELETE CASCADE
) STRICT;

CREATE TABLE snapshot_metrics (
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    key TEXT NOT NULL CHECK (length(key) > 0),
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    provenance TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, key)
) STRICT;

CREATE TABLE layouts (
    id INTEGER PRIMARY KEY,
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(name) > 0),
    algorithm TEXT NOT NULL CHECK (length(algorithm) > 0),
    dimensions INTEGER NOT NULL CHECK (dimensions IN (2, 3)),
    status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
    coordinate_system TEXT NOT NULL DEFAULT 'cartesian-right-handed',
    parameters_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(parameters_json)),
    bounds_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(bounds_json)),
    node_count INTEGER NOT NULL DEFAULT 0 CHECK (node_count >= 0),
    edge_count INTEGER NOT NULL DEFAULT 0 CHECK (edge_count >= 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (snapshot_id, name)
) STRICT;

CREATE TABLE graph_blobs (
    id INTEGER PRIMARY KEY,
    layout_id INTEGER NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('positions', 'edges')),
    format_version INTEGER NOT NULL CHECK (format_version > 0),
    byte_order TEXT NOT NULL CHECK (byte_order = 'little'),
    compression TEXT NOT NULL DEFAULT 'none' CHECK (compression = 'none'),
    record_count INTEGER NOT NULL CHECK (record_count >= 0),
    byte_length INTEGER NOT NULL CHECK (byte_length >= 32),
    sha256_hex TEXT NOT NULL CHECK (
        length(sha256_hex) = 64
        AND sha256_hex NOT GLOB '*[^0-9a-f]*'
    ),
    content BLOB NOT NULL,
    UNIQUE (layout_id, kind),
    CHECK (byte_length = length(content))
) STRICT;

CREATE TABLE finding_threads (
    id INTEGER PRIMARY KEY,
    repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    fingerprint TEXT NOT NULL CHECK (length(fingerprint) > 0),
    rule_key TEXT NOT NULL CHECK (length(rule_key) > 0),
    category TEXT NOT NULL CHECK (length(category) > 0),
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
    status TEXT NOT NULL CHECK (status IN ('open', 'acknowledged', 'resolved', 'ignored')),
    title TEXT NOT NULL CHECK (length(title) > 0),
    recommendation TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    attributes_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attributes_json)),
    UNIQUE (repository_id, fingerprint),
    CHECK (last_seen_at >= first_seen_at)
) STRICT;

CREATE TABLE finding_occurrences (
    finding_id INTEGER NOT NULL REFERENCES finding_threads(id) ON DELETE CASCADE,
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    detail TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    attributes_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attributes_json)),
    PRIMARY KEY (finding_id, snapshot_id)
) STRICT;

CREATE TABLE finding_nodes (
    finding_id INTEGER NOT NULL,
    snapshot_id INTEGER NOT NULL,
    node_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('primary', 'participant', 'evidence')),
    PRIMARY KEY (finding_id, snapshot_id, node_id, role),
    FOREIGN KEY (finding_id, snapshot_id) REFERENCES finding_occurrences(finding_id, snapshot_id) ON DELETE CASCADE,
    FOREIGN KEY (snapshot_id, node_id) REFERENCES nodes(snapshot_id, id) ON DELETE CASCADE
) STRICT;

CREATE TABLE finding_edges (
    finding_id INTEGER NOT NULL,
    snapshot_id INTEGER NOT NULL,
    edge_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('primary', 'participant', 'evidence')),
    PRIMARY KEY (finding_id, snapshot_id, edge_id, role),
    FOREIGN KEY (finding_id, snapshot_id) REFERENCES finding_occurrences(finding_id, snapshot_id) ON DELETE CASCADE,
    FOREIGN KEY (snapshot_id, edge_id) REFERENCES edges(snapshot_id, id) ON DELETE CASCADE
) STRICT;

CREATE VIEW latest_complete_snapshots AS
SELECT s.*
FROM snapshots AS s
WHERE s.status = 'complete'
  AND NOT EXISTS (
      SELECT 1
      FROM snapshots AS newer
      WHERE newer.repository_id = s.repository_id
        AND newer.status = 'complete'
        AND (newer.started_at > s.started_at OR (newer.started_at = s.started_at AND newer.id > s.id))
  );

CREATE VIEW render_nodes AS
SELECT
    n.snapshot_id,
    n.id AS node_id,
    n.kind,
    k.render_code AS kind_code,
    k.category,
    n.name,
    n.path,
    n.external,
    n.confidence,
    n.attributes_json
FROM nodes AS n
JOIN node_kinds AS k ON k.key = n.kind;

CREATE VIEW render_edges AS
SELECT
    e.snapshot_id,
    e.id AS edge_id,
    e.source_node_id,
    e.target_node_id,
    e.kind,
    k.render_code AS kind_code,
    k.category,
    k.directed,
    e.weight,
    e.confidence,
    e.is_derived,
    e.attributes_json
FROM edges AS e
JOIN edge_kinds AS k ON k.key = e.kind;

INSERT INTO schema_migrations (version, name) VALUES (1, 'initial unified snapshot graph');
PRAGMA user_version = 1;

COMMIT;

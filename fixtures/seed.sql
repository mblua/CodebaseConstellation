PRAGMA foreign_keys = ON;

BEGIN IMMEDIATE;

UPDATE schema_migrations
SET applied_at = '2026-07-10T12:00:00.000Z'
WHERE version = 1;

INSERT INTO repositories (
    id, stable_key, name, root_path, vcs_kind, remote_url, created_at, attributes_json
) VALUES (
    1,
    'repo:agentscommander',
    'AgentsCommander',
    '<fixture>/AgentsCommander',
    'git',
    'https://github.com/mblua/AgentsCommander.git',
    '2026-07-10T12:00:00.000Z',
    '{"fixture":true,"tracked_file_count":615}'
);

INSERT INTO snapshots (
    id, repository_id, revision, content_hash, status, history_mode,
    visible_commit_count, started_at, completed_at, scanner_version, attributes_json
) VALUES (
    1,
    1,
    '646aeacaa57d23b0a2d8447ee84999e353937f3e',
    'fixture:agentscommander:646aeac:v1',
    'complete',
    'shallow',
    1,
    '2026-07-10T12:00:00.000Z',
    '2026-07-10T12:00:01.000Z',
    'fixture-v1',
    '{"is_fixture":true,"sampled_from_tracked_files":615}'
);

INSERT INTO snapshot_capabilities (snapshot_id, capability, status, coverage, detail) VALUES
    (1, 'filesystem',        'available',  1.0,  'All filesystem nodes represented by this proportional fixture have one parent.'),
    (1, 'packages',          'available',  1.0,  'npm and both Cargo workspace packages are represented.'),
    (1, 'syntax_graph',      'degraded',   0.35, 'Representative imports and calls only; this is a hand-curated fixture.'),
    (1, 'semantic_graph',    'degraded',   0.30, 'Actors, nouns, and verbs are illustrative manual inferences.'),
    (1, 'issue_file_touches','degraded',   NULL, 'The checkout is shallow: one grafted commit references #904 and reports 615 changed paths.'),
    (1, 'layout',            'available',  1.0,  'Deterministic fixture layout encoded with blob format v1.');

INSERT INTO nodes (
    id, snapshot_id, stable_key, kind, name, qualified_name, path, language,
    external, start_line, end_line, confidence, attributes_json
) VALUES
    (1,  1, 'repo:agentscommander',                                'repository',      'AgentsCommander', NULL, NULL, NULL, 0, NULL, NULL, 1.00, '{}'),
    (2,  1, 'fs:src',                                             'directory',       'src', NULL, 'src', NULL, 0, NULL, NULL, 1.00, '{}'),
    (3,  1, 'fs:src/shared',                                      'directory',       'shared', NULL, 'src/shared', NULL, 0, NULL, NULL, 1.00, '{}'),
    (4,  1, 'fs:src/sidebar',                                     'directory',       'sidebar', NULL, 'src/sidebar', NULL, 0, NULL, NULL, 1.00, '{}'),
    (5,  1, 'fs:src-tauri',                                       'directory',       'src-tauri', NULL, 'src-tauri', NULL, 0, NULL, NULL, 1.00, '{}'),
    (6,  1, 'fs:src-tauri/src',                                   'directory',       'src', NULL, 'src-tauri/src', NULL, 0, NULL, NULL, 1.00, '{}'),
    (7,  1, 'fs:src-tauri/src/api',                               'directory',       'api', NULL, 'src-tauri/src/api', NULL, 0, NULL, NULL, 1.00, '{}'),
    (8,  1, 'fs:src-tauri/src/config',                            'directory',       'config', NULL, 'src-tauri/src/config', NULL, 0, NULL, NULL, 1.00, '{}'),
    (9,  1, 'fs:src-tauri/src/cli',                               'directory',       'cli', NULL, 'src-tauri/src/cli', NULL, 0, NULL, NULL, 1.00, '{}'),
    (10, 1, 'fs:crates',                                          'directory',       'crates', NULL, 'crates', NULL, 0, NULL, NULL, 1.00, '{}'),
    (11, 1, 'fs:crates/session-bridge',                           'directory',       'session-bridge', NULL, 'crates/session-bridge', NULL, 0, NULL, NULL, 1.00, '{}'),
    (12, 1, 'fs:crates/session-bridge/src',                       'directory',       'src', NULL, 'crates/session-bridge/src', NULL, 0, NULL, NULL, 1.00, '{}'),
    (13, 1, 'fs:docs',                                            'directory',       'docs', NULL, 'docs', NULL, 0, NULL, NULL, 1.00, '{}'),
    (14, 1, 'fs:docs/reference',                                  'directory',       'reference', NULL, 'docs/reference', NULL, 0, NULL, NULL, 1.00, '{}'),
    (15, 1, 'fs:package.json',                                    'file',            'package.json', NULL, 'package.json', 'json', 0, NULL, NULL, 1.00, '{"manifest":true}'),
    (16, 1, 'fs:Cargo.toml',                                      'file',            'Cargo.toml', NULL, 'Cargo.toml', 'toml', 0, NULL, NULL, 1.00, '{"manifest":true,"workspace":true}'),
    (17, 1, 'fs:src/main.tsx',                                    'file',            'main.tsx', NULL, 'src/main.tsx', 'typescript', 0, NULL, NULL, 1.00, '{}'),
    (18, 1, 'fs:src/shared/ipc.ts',                               'file',            'ipc.ts', NULL, 'src/shared/ipc.ts', 'typescript', 0, NULL, NULL, 1.00, '{}'),
    (19, 1, 'fs:src/shared/types.ts',                             'file',            'types.ts', NULL, 'src/shared/types.ts', 'typescript', 0, NULL, NULL, 1.00, '{}'),
    (20, 1, 'fs:src/sidebar/App.tsx',                             'file',            'App.tsx', NULL, 'src/sidebar/App.tsx', 'typescript', 0, NULL, NULL, 1.00, '{}'),
    (21, 1, 'fs:src-tauri/Cargo.toml',                            'file',            'Cargo.toml', NULL, 'src-tauri/Cargo.toml', 'toml', 0, NULL, NULL, 1.00, '{"manifest":true}'),
    (22, 1, 'fs:src-tauri/src/lib.rs',                            'file',            'lib.rs', NULL, 'src-tauri/src/lib.rs', 'rust', 0, NULL, NULL, 1.00, '{}'),
    (23, 1, 'fs:src-tauri/src/api/mod.rs',                        'file',            'mod.rs', NULL, 'src-tauri/src/api/mod.rs', 'rust', 0, NULL, NULL, 1.00, '{}'),
    (24, 1, 'fs:src-tauri/src/api/message_store.rs',              'file',            'message_store.rs', NULL, 'src-tauri/src/api/message_store.rs', 'rust', 0, NULL, NULL, 1.00, '{}'),
    (25, 1, 'fs:src-tauri/src/config/sessions_persistence.rs',    'file',            'sessions_persistence.rs', NULL, 'src-tauri/src/config/sessions_persistence.rs', 'rust', 0, NULL, NULL, 1.00, '{}'),
    (26, 1, 'fs:src-tauri/src/cli/send.rs',                       'file',            'send.rs', NULL, 'src-tauri/src/cli/send.rs', 'rust', 0, NULL, NULL, 1.00, '{}'),
    (27, 1, 'fs:crates/session-bridge/Cargo.toml',                 'file',            'Cargo.toml', NULL, 'crates/session-bridge/Cargo.toml', 'toml', 0, NULL, NULL, 1.00, '{"manifest":true}'),
    (28, 1, 'fs:crates/session-bridge/src/lib.rs',                 'file',            'lib.rs', NULL, 'crates/session-bridge/src/lib.rs', 'rust', 0, NULL, NULL, 1.00, '{}'),
    (29, 1, 'fs:docs/reference/architecture.md',                  'file',            'architecture.md', NULL, 'docs/reference/architecture.md', 'markdown', 0, NULL, NULL, 1.00, '{}'),
    (30, 1, 'fs:README.md',                                       'file',            'README.md', NULL, 'README.md', 'markdown', 0, NULL, NULL, 1.00, '{}'),
    (31, 1, 'pkg:npm:agentscommander',                            'package',         'agentscommander', 'npm:agentscommander', NULL, NULL, 0, NULL, NULL, 1.00, '{"ecosystem":"npm","manifest":"package.json"}'),
    (32, 1, 'pkg:cargo:agentscommander-new',                      'package',         'agentscommander-new', 'cargo:agentscommander-new', NULL, 'rust', 0, NULL, NULL, 1.00, '{"ecosystem":"cargo","manifest":"src-tauri/Cargo.toml"}'),
    (33, 1, 'pkg:cargo:session-bridge',                           'package',         'session-bridge', 'cargo:session-bridge', NULL, 'rust', 0, NULL, NULL, 1.00, '{"ecosystem":"cargo","manifest":"crates/session-bridge/Cargo.toml"}'),
    (34, 1, 'sym:typescript:sidebar.App',                         'symbol',          'App', 'sidebar.App', 'src/sidebar/App.tsx', 'typescript', 0, 1, 623, 0.95, '{"symbol_kind":"component"}'),
    (35, 1, 'sym:typescript:shared.invoke',                       'symbol',          'invoke', 'shared.invoke', 'src/shared/ipc.ts', 'typescript', 0, 1, 1155, 0.95, '{"symbol_kind":"function"}'),
    (36, 1, 'sym:rust:api.MessageStore',                          'symbol',          'MessageStore', 'api::MessageStore', 'src-tauri/src/api/message_store.rs', 'rust', 0, 1, 628, 0.95, '{"symbol_kind":"type"}'),
    (37, 1, 'sym:rust:cli.send',                                  'symbol',          'send', 'cli::send', 'src-tauri/src/cli/send.rs', 'rust', 0, 1, 1019, 0.90, '{"symbol_kind":"command"}'),
    (38, 1, 'sym:rust:config.SessionStore',                       'symbol',          'SessionStore', 'config::SessionStore', 'src-tauri/src/config/sessions_persistence.rs', 'rust', 0, 1, 3282, 0.85, '{"symbol_kind":"service"}'),
    (39, 1, 'sym:rust:session_bridge.SessionBridge',              'symbol',          'SessionBridge', 'session_bridge::SessionBridge', 'crates/session-bridge/src/lib.rs', 'rust', 0, 1, 356, 0.90, '{"symbol_kind":"service"}'),
    (40, 1, 'actor:user',                                         'actor',           'User', 'User', NULL, NULL, 1, NULL, NULL, 0.90, '{"source":"manual"}'),
    (41, 1, 'actor:coding-agent',                                 'actor',           'Coding agent', 'CodingAgent', NULL, NULL, 1, NULL, NULL, 0.90, '{"source":"manual"}'),
    (42, 1, 'concept:session',                                    'concept',         'Session', 'Session', NULL, NULL, 0, NULL, NULL, 0.80, '{"source":"manual"}'),
    (43, 1, 'concept:message',                                    'concept',         'Message', 'Message', NULL, NULL, 0, NULL, NULL, 0.80, '{"source":"manual"}'),
    (44, 1, 'concept:team',                                       'concept',         'Team', 'Team', NULL, NULL, 0, NULL, NULL, 0.80, '{"source":"manual"}'),
    (45, 1, 'concept:workgroup',                                  'concept',         'Workgroup', 'Workgroup', NULL, NULL, 0, NULL, NULL, 0.80, '{"source":"manual"}'),
    (46, 1, 'concept:repository',                                 'concept',         'Repository', 'Repository', NULL, NULL, 0, NULL, NULL, 0.80, '{"source":"manual"}'),
    (47, 1, 'action:coordinate',                                  'action',          'Coordinate', 'Coordinate', NULL, NULL, 0, NULL, NULL, 0.75, '{"source":"manual"}'),
    (48, 1, 'action:send-message',                                'action',          'Send message', 'SendMessage', NULL, NULL, 0, NULL, NULL, 0.80, '{"source":"manual"}'),
    (49, 1, 'action:persist-session',                             'action',          'Persist session', 'PersistSession', NULL, NULL, 0, NULL, NULL, 0.80, '{"source":"manual"}'),
    (50, 1, 'data_store:sqlite-message-store',                    'data_store',      'SQLite message store', 'SQLiteMessageStore', NULL, 'sqlite', 0, NULL, NULL, 0.90, '{"source":"manual"}'),
    (51, 1, 'external_system:docker',                             'external_system', 'Docker', 'Docker', NULL, NULL, 1, NULL, NULL, 0.95, '{}'),
    (52, 1, 'commit:646aeacaa57d23b0a2d8447ee84999e353937f3e',  'commit',          '646aeac', '646aeacaa57d23b0a2d8447ee84999e353937f3e', NULL, NULL, 0, NULL, NULL, 1.00, '{"grafted":true}'),
    (53, 1, 'issue:github:904',                                   'issue',           '#904', 'GitHub #904', NULL, NULL, 1, NULL, NULL, 1.00, '{"tracker":"github","kind":"pull_request"}');

WITH edge_seed(id, source_id, target_id, kind, weight, confidence, is_derived, attributes_json) AS (
    VALUES
        (1,  1,  2, 'contains',   1.0, 1.00, 0, '{}'),
        (2,  1,  5, 'contains',   1.0, 1.00, 0, '{}'),
        (3,  1, 10, 'contains',   1.0, 1.00, 0, '{}'),
        (4,  1, 13, 'contains',   1.0, 1.00, 0, '{}'),
        (5,  1, 15, 'contains',   1.0, 1.00, 0, '{}'),
        (6,  1, 16, 'contains',   1.0, 1.00, 0, '{}'),
        (7,  1, 30, 'contains',   1.0, 1.00, 0, '{}'),
        (8,  2,  3, 'contains',   1.0, 1.00, 0, '{}'),
        (9,  2,  4, 'contains',   1.0, 1.00, 0, '{}'),
        (10, 2, 17, 'contains',   1.0, 1.00, 0, '{}'),
        (11, 3, 18, 'contains',   1.0, 1.00, 0, '{}'),
        (12, 3, 19, 'contains',   1.0, 1.00, 0, '{}'),
        (13, 4, 20, 'contains',   1.0, 1.00, 0, '{}'),
        (14, 5,  6, 'contains',   1.0, 1.00, 0, '{}'),
        (15, 5, 21, 'contains',   1.0, 1.00, 0, '{}'),
        (16, 6,  7, 'contains',   1.0, 1.00, 0, '{}'),
        (17, 6,  8, 'contains',   1.0, 1.00, 0, '{}'),
        (18, 6,  9, 'contains',   1.0, 1.00, 0, '{}'),
        (19, 6, 22, 'contains',   1.0, 1.00, 0, '{}'),
        (20, 7, 23, 'contains',   1.0, 1.00, 0, '{}'),
        (21, 7, 24, 'contains',   1.0, 1.00, 0, '{}'),
        (22, 8, 25, 'contains',   1.0, 1.00, 0, '{}'),
        (23, 9, 26, 'contains',   1.0, 1.00, 0, '{}'),
        (24,10, 11, 'contains',   1.0, 1.00, 0, '{}'),
        (25,11, 12, 'contains',   1.0, 1.00, 0, '{}'),
        (26,11, 27, 'contains',   1.0, 1.00, 0, '{}'),
        (27,12, 28, 'contains',   1.0, 1.00, 0, '{}'),
        (28,13, 14, 'contains',   1.0, 1.00, 0, '{}'),
        (29,14, 29, 'contains',   1.0, 1.00, 0, '{}'),
        (30,31, 15, 'groups',     1.0, 1.00, 0, '{"role":"manifest"}'),
        (31,31, 17, 'groups',     1.0, 1.00, 0, '{}'),
        (32,31, 18, 'groups',     1.0, 1.00, 0, '{}'),
        (33,31, 19, 'groups',     1.0, 1.00, 0, '{}'),
        (34,31, 20, 'groups',     1.0, 1.00, 0, '{}'),
        (35,32, 16, 'groups',     1.0, 1.00, 0, '{"role":"workspace_manifest"}'),
        (36,32, 21, 'groups',     1.0, 1.00, 0, '{"role":"manifest"}'),
        (37,32, 22, 'groups',     1.0, 1.00, 0, '{}'),
        (38,32, 23, 'groups',     1.0, 1.00, 0, '{}'),
        (39,32, 24, 'groups',     1.0, 1.00, 0, '{}'),
        (40,32, 25, 'groups',     1.0, 1.00, 0, '{}'),
        (41,32, 26, 'groups',     1.0, 1.00, 0, '{}'),
        (42,33, 27, 'groups',     1.0, 1.00, 0, '{"role":"manifest"}'),
        (43,33, 28, 'groups',     1.0, 1.00, 0, '{}'),
        (44,20, 34, 'declares',   1.0, 0.95, 0, '{}'),
        (45,18, 35, 'declares',   1.0, 0.95, 0, '{}'),
        (46,24, 36, 'declares',   1.0, 0.95, 0, '{}'),
        (47,26, 37, 'declares',   1.0, 0.90, 0, '{}'),
        (48,25, 38, 'declares',   1.0, 0.85, 0, '{}'),
        (49,28, 39, 'declares',   1.0, 0.90, 0, '{}'),
        (50,20, 18, 'imports',    1.0, 0.95, 0, '{}'),
        (51,20, 19, 'imports',    1.0, 0.95, 0, '{}'),
        (52,18, 19, 'imports',    1.0, 0.95, 0, '{}'),
        (53,22, 23, 'imports',    1.0, 0.95, 0, '{}'),
        (54,23, 24, 'imports',    1.0, 0.90, 0, '{}'),
        (55,22, 25, 'imports',    1.0, 0.90, 0, '{}'),
        (56,26, 24, 'imports',    1.0, 0.85, 0, '{}'),
        (57,31, 32, 'depends_on', 1.0, 0.90, 0, '{"boundary":"tauri_ipc"}'),
        (58,32, 33, 'depends_on', 1.0, 0.90, 0, '{"boundary":"workspace"}'),
        (59,34, 35, 'calls',      1.0, 0.85, 0, '{}'),
        (60,37, 36, 'calls',      1.0, 0.85, 0, '{}'),
        (61,39, 37, 'calls',      1.0, 0.70, 0, '{}'),
        (62,40, 34, 'invokes',    1.0, 0.75, 0, '{}'),
        (63,35, 37, 'invokes',    1.0, 0.80, 0, '{"transport":"tauri"}'),
        (64,39, 51, 'invokes',    1.0, 0.85, 0, '{}'),
        (65,36, 50, 'writes',     1.0, 0.90, 0, '{}'),
        (66,38, 50, 'writes',     1.0, 0.75, 0, '{}'),
        (67,34, 43, 'emits',      1.0, 0.65, 0, '{}'),
        (68,36, 43, 'consumes',   1.0, 0.75, 0, '{}'),
        (69,39, 37, 'flows_to',   1.0, 0.70, 0, '{"payload":"message"}'),
        (70,40, 47, 'performs',   1.0, 0.75, 0, '{}'),
        (71,41, 48, 'performs',   1.0, 0.80, 0, '{}'),
        (72,47, 44, 'acts_on',    1.0, 0.75, 0, '{}'),
        (73,47, 45, 'acts_on',    1.0, 0.75, 0, '{}'),
        (74,47, 46, 'acts_on',    1.0, 0.75, 0, '{}'),
        (75,48, 43, 'acts_on',    1.0, 0.80, 0, '{}'),
        (76,49, 42, 'acts_on',    1.0, 0.80, 0, '{}'),
        (77,20, 47, 'models',     1.0, 0.65, 0, '{}'),
        (78,36, 43, 'models',     1.0, 0.80, 0, '{}'),
        (79,38, 42, 'models',     1.0, 0.80, 0, '{}'),
        (80,39, 43, 'models',     1.0, 0.70, 0, '{}'),
        (81,50, 42, 'related_to', 1.0, 0.75, 0, '{}'),
        (82,52, 53, 'references', 1.0, 1.00, 0, '{"syntax":"#904"}'),
        (83,52, 22, 'modifies',   1.0, 1.00, 0, '{}'),
        (84,52, 24, 'modifies',   1.0, 1.00, 0, '{}'),
        (85,52, 25, 'modifies',   1.0, 1.00, 0, '{}'),
        (86,52, 26, 'modifies',   1.0, 1.00, 0, '{}'),
        (87,52, 28, 'modifies',   1.0, 1.00, 0, '{}'),
        (88,53, 22, 'touches',    1.0, 0.10, 1, '{"via_commit":"646aeacaa57d23b0a2d8447ee84999e353937f3e"}'),
        (89,53, 24, 'touches',    1.0, 0.10, 1, '{"via_commit":"646aeacaa57d23b0a2d8447ee84999e353937f3e"}'),
        (90,53, 25, 'touches',    1.0, 0.10, 1, '{"via_commit":"646aeacaa57d23b0a2d8447ee84999e353937f3e"}'),
        (91,53, 26, 'touches',    1.0, 0.10, 1, '{"via_commit":"646aeacaa57d23b0a2d8447ee84999e353937f3e"}'),
        (92,53, 28, 'touches',    1.0, 0.10, 1, '{"via_commit":"646aeacaa57d23b0a2d8447ee84999e353937f3e"}')
)
INSERT INTO edges (
    id, snapshot_id, stable_key, source_node_id, target_node_id, kind,
    weight, confidence, is_derived, attributes_json
)
SELECT
    es.id,
    1,
    es.kind || ':' || source.stable_key || '->' || target.stable_key,
    es.source_id,
    es.target_id,
    es.kind,
    es.weight,
    es.confidence,
    es.is_derived,
    es.attributes_json
FROM edge_seed AS es
JOIN nodes AS source ON source.snapshot_id = 1 AND source.id = es.source_id
JOIN nodes AS target ON target.snapshot_id = 1 AND target.id = es.target_id;

INSERT INTO edge_evidence (
    id, snapshot_id, edge_id, evidence_kind, file_node_id, start_line, end_line,
    commit_hash, issue_key, excerpt, attributes_json
) VALUES
    (1,  1, 44, 'syntax',    20, 1, 1, NULL, NULL, 'App component declaration', '{}'),
    (2,  1, 45, 'syntax',    18, 1, 1, NULL, NULL, 'IPC invoke declaration', '{}'),
    (3,  1, 46, 'syntax',    24, 1, 1, NULL, NULL, 'MessageStore declaration', '{}'),
    (4,  1, 47, 'syntax',    26, 1, 1, NULL, NULL, 'send command declaration', '{}'),
    (5,  1, 48, 'heuristic', 25, 1, 1, NULL, NULL, 'Session persistence service', '{}'),
    (6,  1, 49, 'syntax',    28, 1, 1, NULL, NULL, 'SessionBridge declaration', '{}'),
    (7,  1, 50, 'syntax',    20, 1, 1, NULL, NULL, 'TypeScript import', '{}'),
    (8,  1, 51, 'syntax',    20, 1, 1, NULL, NULL, 'TypeScript import', '{}'),
    (9,  1, 52, 'syntax',    18, 1, 1, NULL, NULL, 'TypeScript import', '{}'),
    (10, 1, 53, 'syntax',    22, 1, 1, NULL, NULL, 'Rust module declaration', '{}'),
    (11, 1, 54, 'syntax',    23, 1, 1, NULL, NULL, 'Rust module relation', '{}'),
    (12, 1, 55, 'syntax',    22, 1, 1, NULL, NULL, 'Rust module declaration', '{}'),
    (13, 1, 56, 'heuristic', 26, 1, 1, NULL, NULL, 'CLI uses API message store', '{}'),
    (14, 1, 57, 'manifest',  15, NULL, NULL, NULL, NULL, 'Tauri IPC boundary', '{}'),
    (15, 1, 58, 'manifest',  16, NULL, NULL, NULL, NULL, 'Cargo workspace member', '{}'),
    (16, 1, 59, 'heuristic', 20, 1, 623, NULL, NULL, 'Sidebar invokes shared IPC', '{}'),
    (17, 1, 60, 'heuristic', 26, 1, 1019, NULL, NULL, 'Send command uses message store', '{}'),
    (18, 1, 61, 'heuristic', 28, 1, 356, NULL, NULL, 'Bridge forwards to command layer', '{}'),
    (19, 1, 62, 'manual',    20, NULL, NULL, NULL, NULL, 'User interacts through sidebar UI', '{}'),
    (20, 1, 63, 'heuristic', 18, 1, 1155, NULL, NULL, 'Tauri invoke crosses frontend/backend boundary', '{}'),
    (21, 1, 64, 'syntax',    28, 1, 356, NULL, NULL, 'Container-backed bridge invokes Docker', '{}'),
    (22, 1, 65, 'heuristic', 24, 1, 628, NULL, NULL, 'MessageStore writes SQLite', '{}'),
    (23, 1, 66, 'heuristic', 25, 1, 3282, NULL, NULL, 'Session persistence writes durable state', '{}'),
    (24, 1, 67, 'heuristic', 20, 1, 623, NULL, NULL, 'UI emits messages', '{}'),
    (25, 1, 68, 'heuristic', 24, 1, 628, NULL, NULL, 'Store consumes message payloads', '{}'),
    (26, 1, 69, 'heuristic', 28, 1, 356, NULL, NULL, 'Bridge forwards a message payload', '{}'),
    (27, 1, 70, 'manual',    29, NULL, NULL, NULL, NULL, 'Product use-case model', '{}'),
    (28, 1, 71, 'manual',    29, NULL, NULL, NULL, NULL, 'Product use-case model', '{}'),
    (29, 1, 72, 'manual',    29, NULL, NULL, NULL, NULL, 'Coordination acts on teams', '{}'),
    (30, 1, 73, 'manual',    29, NULL, NULL, NULL, NULL, 'Coordination acts on workgroups', '{}'),
    (31, 1, 74, 'manual',    29, NULL, NULL, NULL, NULL, 'Coordination acts on repositories', '{}'),
    (32, 1, 75, 'manual',    29, NULL, NULL, NULL, NULL, 'Send action acts on message', '{}'),
    (33, 1, 76, 'manual',    29, NULL, NULL, NULL, NULL, 'Persistence acts on session', '{}'),
    (34, 1, 77, 'heuristic', 20, 1, 623, NULL, NULL, 'Sidebar models coordination workflow', '{}'),
    (35, 1, 78, 'heuristic', 24, 1, 628, NULL, NULL, 'MessageStore models message', '{}'),
    (36, 1, 79, 'heuristic', 25, 1, 3282, NULL, NULL, 'SessionStore models session', '{}'),
    (37, 1, 80, 'heuristic', 28, 1, 356, NULL, NULL, 'SessionBridge transports messages', '{}'),
    (38, 1, 81, 'manual',    24, NULL, NULL, NULL, NULL, 'SQLite store persists session-related data', '{}'),
    (39, 1, 82, 'git',       NULL, NULL, NULL, '646aeacaa57d23b0a2d8447ee84999e353937f3e', '#904', 'Merge pull request #904', '{}'),
    (40, 1, 83, 'git',       22, NULL, NULL, '646aeacaa57d23b0a2d8447ee84999e353937f3e', '#904', NULL, '{}'),
    (41, 1, 84, 'git',       24, NULL, NULL, '646aeacaa57d23b0a2d8447ee84999e353937f3e', '#904', NULL, '{}'),
    (42, 1, 85, 'git',       25, NULL, NULL, '646aeacaa57d23b0a2d8447ee84999e353937f3e', '#904', NULL, '{}'),
    (43, 1, 86, 'git',       26, NULL, NULL, '646aeacaa57d23b0a2d8447ee84999e353937f3e', '#904', NULL, '{}'),
    (44, 1, 87, 'git',       28, NULL, NULL, '646aeacaa57d23b0a2d8447ee84999e353937f3e', '#904', NULL, '{}'),
    (45, 1, 88, 'git',       22, NULL, NULL, '646aeacaa57d23b0a2d8447ee84999e353937f3e', '#904', 'Derived through commit 646aeac', '{}'),
    (46, 1, 89, 'git',       24, NULL, NULL, '646aeacaa57d23b0a2d8447ee84999e353937f3e', '#904', 'Derived through commit 646aeac', '{}'),
    (47, 1, 90, 'git',       25, NULL, NULL, '646aeacaa57d23b0a2d8447ee84999e353937f3e', '#904', 'Derived through commit 646aeac', '{}'),
    (48, 1, 91, 'git',       26, NULL, NULL, '646aeacaa57d23b0a2d8447ee84999e353937f3e', '#904', 'Derived through commit 646aeac', '{}'),
    (49, 1, 92, 'git',       28, NULL, NULL, '646aeacaa57d23b0a2d8447ee84999e353937f3e', '#904', 'Derived through commit 646aeac', '{}');

INSERT INTO node_metrics (snapshot_id, node_id, key, value, unit, provenance) VALUES
    (1, 18, 'loc', 1155, 'lines', 'fixture:git-stat'),
    (1, 19, 'loc', 1269, 'lines', 'fixture:git-stat'),
    (1, 20, 'loc', 623,  'lines', 'fixture:git-stat'),
    (1, 22, 'loc', 2757, 'lines', 'fixture:git-stat'),
    (1, 24, 'loc', 628,  'lines', 'fixture:git-stat'),
    (1, 25, 'loc', 3282, 'lines', 'fixture:git-stat'),
    (1, 26, 'loc', 1019, 'lines', 'fixture:git-stat'),
    (1, 28, 'loc', 356,  'lines', 'fixture:git-stat'),
    (1, 29, 'loc', 629,  'lines', 'fixture:git-stat'),
    (1, 25, 'risk.large_file', 1, 'boolean', 'fixture:threshold>=1000'),
    (1, 18, 'risk.large_file', 1, 'boolean', 'fixture:threshold>=1000'),
    (1, 26, 'risk.large_file', 1, 'boolean', 'fixture:threshold>=1000');

INSERT INTO snapshot_metrics (snapshot_id, key, value, unit, provenance) VALUES
    (1, 'tracked_file_count', 615, 'files', 'git-show'),
    (1, 'sample_node_count', 53, 'nodes', 'fixture'),
    (1, 'visible_commit_count', 1, 'commits', 'git-rev-list'),
    (1, 'commit_issue_reference_count', 1, 'references', 'commit-message-regex');

INSERT INTO finding_threads (
    id, repository_id, fingerprint, rule_key, category, severity, status,
    title, recommendation, first_seen_at, last_seen_at, attributes_json
) VALUES
    (1, 1, 'history:shallow', 'history_coverage', 'data_quality', 'warning', 'open',
     'Change-history view is not representative',
     'Scan a full clone before using issue-to-file ownership for architectural decisions.',
     '2026-07-10T12:00:01.000Z', '2026-07-10T12:00:01.000Z', '{}'),
    (2, 1, 'large-file:src-tauri/src/config/sessions_persistence.rs', 'large_file', 'maintainability', 'warning', 'open',
     'Session persistence is concentrated in one large module',
     'Inspect responsibilities and dependency fan-out before deciding whether to split the module.',
     '2026-07-10T12:00:01.000Z', '2026-07-10T12:00:01.000Z', '{"threshold_loc":1000}');

INSERT INTO finding_occurrences (finding_id, snapshot_id, detail, observed_at, attributes_json) VALUES
    (1, 1, 'Only one grafted commit is visible; it reports the complete tree as changed.', '2026-07-10T12:00:01.000Z', '{}'),
    (2, 1, 'The sampled file has approximately 3,282 lines.', '2026-07-10T12:00:01.000Z', '{"observed_loc":3282}');

INSERT INTO finding_nodes (finding_id, snapshot_id, node_id, role) VALUES
    (1, 1, 1,  'primary'),
    (1, 1, 52, 'evidence'),
    (2, 1, 25, 'primary');

INSERT INTO layouts (
    id, snapshot_id, name, algorithm, dimensions, status, coordinate_system,
    parameters_json, bounds_json, node_count, edge_count, created_at
) VALUES (
    1, 1, 'fixture-v1', 'deterministic-cluster-spiral', 3, 'complete',
    'cartesian-right-handed',
    '{"seed":1,"purpose":"renderer-contract"}',
    '{}', 0, 0, '2026-07-10T12:00:02.000Z'
);

COMMIT;

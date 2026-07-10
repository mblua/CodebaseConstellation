mod db;
mod git;
mod manifests;
mod model;
mod syntax;

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use clap::ValueEnum;
use regex::Regex;
use serde::Serialize;
use serde_json::json;
use sha2::{Digest, Sha256};

use db::{persist_snapshot, SnapshotInput};
use git::{inspect_repository, tracked_paths, RepositoryInfo};
use manifests::{discover_packages, ManifestSummary};
use model::{evidence, CapabilityReport, FileRecord, Graph, NodeDraft};
use syntax::{analyze_syntax, SyntaxSummary};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, ValueEnum)]
pub enum HistoryPolicy {
    /// Do not traverse or materialize Git history.
    #[default]
    Off,
    /// Detect full/shallow history and preserve the original history graph behavior.
    Auto,
}

impl HistoryPolicy {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Off => "off",
            Self::Auto => "auto",
        }
    }

    fn collects_history(self) -> bool {
        self == Self::Auto
    }
}

#[derive(Debug, Clone)]
pub struct ScanOptions {
    pub repo: PathBuf,
    pub database: PathBuf,
    pub history: HistoryPolicy,
}

impl ScanOptions {
    /// Create scan options using the current-product default: history disabled.
    pub fn new(repo: impl Into<PathBuf>, database: impl Into<PathBuf>) -> Self {
        Self {
            repo: repo.into(),
            database: database.into(),
            history: HistoryPolicy::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanReport {
    pub database: String,
    pub repository: String,
    pub repository_key: String,
    pub snapshot_id: i64,
    pub revision: String,
    pub content_hash: String,
    pub status: String,
    pub history_mode: String,
    pub visible_commit_count: usize,
    pub tracked_file_count: usize,
    pub node_count: usize,
    pub edge_count: usize,
    pub capabilities: BTreeMap<String, CapabilityReport>,
}

#[derive(Debug, Clone, Default)]
struct HistorySummary {
    changed_paths: usize,
    resolved_changed_paths: usize,
    issue_references: usize,
    touches: usize,
}

pub fn scan(options: &ScanOptions) -> Result<ScanReport> {
    let repository = inspect_repository(&options.repo, options.history.collects_history())?;
    let paths = tracked_paths(&repository.root)?;
    let files = read_tracked_files(&repository.root, &paths)?;
    let content_hash = content_hash(&repository.revision, &files, options.history);

    let mut graph = Graph::new();
    add_filesystem_graph(&repository, &files, &mut graph)?;
    let manifests = discover_packages(&files, &mut graph)?;
    let syntax = analyze_syntax(&files, &manifests.packages, &mut graph)?;
    let history = if options.history.collects_history() {
        add_history_graph(&repository, &mut graph)?
    } else {
        HistorySummary::default()
    };
    set_capabilities(
        &repository,
        options.history,
        &files,
        &manifests,
        &syntax,
        &history,
        &mut graph,
    );

    let snapshot_attributes = json!({
        "dirty_worktree": repository.dirty,
        "tracked_file_count": files.len(),
        "manifest_errors": manifests.errors,
        "syntax_extractor": "conservative-file-imports-v1",
        "history_policy": options.history.as_str(),
    });
    let history_mode = effective_history_mode(&repository, options.history);
    let visible_commit_count = repository.commits.len();
    let persisted = persist_snapshot(
        &options.database,
        &SnapshotInput {
            repository: &repository,
            content_hash: &content_hash,
            tracked_file_count: files.len(),
            commit_issue_reference_count: history.issue_references,
            history_mode,
            visible_commit_count,
            snapshot_attributes,
        },
        &graph,
    )?;
    let database = fs::canonicalize(&options.database)
        .unwrap_or_else(|_| options.database.clone())
        .to_string_lossy()
        .into_owned();

    Ok(ScanReport {
        database,
        repository: repository.name.clone(),
        repository_key: repository.stable_key(),
        snapshot_id: persisted.snapshot_id,
        revision: repository.revision.clone(),
        content_hash,
        status: "complete".to_owned(),
        history_mode: history_mode.to_owned(),
        visible_commit_count,
        tracked_file_count: files.len(),
        node_count: persisted.node_count,
        edge_count: persisted.edge_count,
        capabilities: graph.capabilities,
    })
}

fn read_tracked_files(root: &Path, paths: &[String]) -> Result<Vec<FileRecord>> {
    let mut files = Vec::with_capacity(paths.len());
    for path in paths {
        let native = path
            .split('/')
            .fold(root.to_path_buf(), |joined, part| joined.join(part));
        let bytes = fs::read(&native)
            .with_context(|| format!("cannot read tracked file {}", native.display()))?;
        let language = language_for_path(path).map(str::to_owned);
        let loc = language
            .as_ref()
            .filter(|_| std::str::from_utf8(&bytes).is_ok())
            .map(|_| physical_line_count(&bytes));
        files.push(FileRecord {
            path: path.clone(),
            bytes,
            language,
            loc,
        });
    }
    Ok(files)
}

fn add_filesystem_graph(
    repository: &RepositoryInfo,
    files: &[FileRecord],
    graph: &mut Graph,
) -> Result<()> {
    let repository_key = repository.stable_key();
    graph.add_node(NodeDraft {
        stable_key: repository_key.clone(),
        kind: "repository".to_owned(),
        name: repository.name.clone(),
        qualified_name: None,
        path: None,
        language: None,
        external: false,
        start_line: None,
        end_line: None,
        confidence: 1.0,
        attributes: json!({"remote_url": repository.remote_url}),
    })?;

    let mut directories = BTreeSet::new();
    for file in files {
        let components: Vec<&str> = file.path.split('/').collect();
        for depth in 1..components.len() {
            directories.insert(components[..depth].join("/"));
        }
    }
    for directory in &directories {
        graph.add_node(NodeDraft {
            stable_key: format!("fs:{directory}"),
            kind: "directory".to_owned(),
            name: directory.rsplit('/').next().unwrap_or(directory).to_owned(),
            qualified_name: None,
            path: Some(directory.clone()),
            language: None,
            external: false,
            start_line: None,
            end_line: None,
            confidence: 1.0,
            attributes: json!({}),
        })?;
    }
    for file in files {
        let key = file.node_key();
        graph.add_node(NodeDraft {
            stable_key: key.clone(),
            kind: "file".to_owned(),
            name: file
                .path
                .rsplit('/')
                .next()
                .unwrap_or(&file.path)
                .to_owned(),
            qualified_name: None,
            path: Some(file.path.clone()),
            language: file.language.clone(),
            external: false,
            start_line: None,
            end_line: None,
            confidence: 1.0,
            attributes: json!({"bytes": file.bytes.len()}),
        })?;
        if let Some(loc) = file.loc {
            graph.add_node_metric(
                &key,
                "loc",
                loc as f64,
                "lines",
                "ingestion:physical-lines-v1",
            );
        }
    }

    for directory in &directories {
        let parent_key = directory
            .rsplit_once('/')
            .map(|(parent, _)| format!("fs:{parent}"))
            .unwrap_or_else(|| repository_key.clone());
        graph.add_edge(
            "contains",
            &parent_key,
            &format!("fs:{directory}"),
            1.0,
            false,
            json!({}),
            None,
        )?;
    }
    for file in files {
        let parent_key = file
            .path
            .rsplit_once('/')
            .map(|(parent, _)| format!("fs:{parent}"))
            .unwrap_or_else(|| repository_key.clone());
        graph.add_edge(
            "contains",
            &parent_key,
            &file.node_key(),
            1.0,
            false,
            json!({}),
            None,
        )?;
    }
    Ok(())
}

fn add_history_graph(repository: &RepositoryInfo, graph: &mut Graph) -> Result<HistorySummary> {
    let issue_pattern = Regex::new(r"(?:^|[^A-Za-z0-9])#([1-9][0-9]*)\b")?;
    let tracker = repository
        .remote_url
        .as_deref()
        .filter(|remote| remote.to_ascii_lowercase().contains("github"))
        .map(|_| "github")
        .unwrap_or("git");
    let mut summary = HistorySummary::default();

    for commit in &repository.commits {
        let commit_key = format!("commit:{}", commit.hash);
        let title = commit.message.lines().next().unwrap_or("");
        graph.add_node(NodeDraft {
            stable_key: commit_key.clone(),
            kind: "commit".to_owned(),
            name: commit.hash.chars().take(7).collect(),
            qualified_name: Some(commit.hash.clone()),
            path: None,
            language: None,
            external: false,
            start_line: None,
            end_line: None,
            confidence: 1.0,
            attributes: json!({
                "title": title,
                "message": commit.message,
                "authored_at": commit.authored_at,
                "parents": commit.parents,
                "grafted": repository.shallow && commit.parents.is_empty(),
            }),
        })?;

        let mut modified_file_keys = Vec::new();
        for path in &commit.changed_paths {
            summary.changed_paths += 1;
            let file_key = format!("fs:{path}");
            if !graph.nodes.contains_key(&file_key) {
                continue;
            }
            summary.resolved_changed_paths += 1;
            modified_file_keys.push(file_key.clone());
            graph.add_edge(
                "modifies",
                &commit_key,
                &file_key,
                1.0,
                false,
                json!({}),
                Some(evidence(
                    "git",
                    Some(file_key.clone()),
                    None,
                    Some(commit.hash.clone()),
                    None,
                    Some(format!("Commit {} modifies {path}", &commit.hash[..7])),
                )),
            )?;
        }

        let mut issue_numbers = BTreeSet::new();
        for capture in issue_pattern.captures_iter(&commit.message) {
            if let Some(number) = capture.get(1) {
                issue_numbers.insert(number.as_str().to_owned());
            }
        }
        for number in issue_numbers {
            summary.issue_references += 1;
            let display_key = format!("#{number}");
            let issue_key = format!("issue:{tracker}:{number}");
            graph.add_node(NodeDraft {
                stable_key: issue_key.clone(),
                kind: "issue".to_owned(),
                name: display_key.clone(),
                qualified_name: Some(format!("{} {display_key}", tracker_display(tracker))),
                path: None,
                language: None,
                external: true,
                start_line: None,
                end_line: None,
                confidence: 1.0,
                attributes: json!({"tracker": tracker, "reference_syntax": display_key}),
            })?;
            graph.add_edge(
                "references",
                &commit_key,
                &issue_key,
                1.0,
                false,
                json!({"syntax": display_key}),
                Some(evidence(
                    "git",
                    None,
                    None,
                    Some(commit.hash.clone()),
                    Some(display_key.clone()),
                    Some(title.chars().take(240).collect()),
                )),
            )?;

            for file_key in &modified_file_keys {
                let edge_key = format!("touches:{issue_key}->{file_key}");
                let was_new = !graph.edges.contains_key(&edge_key);
                graph.add_edge(
                    "touches",
                    &issue_key,
                    file_key,
                    if repository.shallow { 0.1 } else { 1.0 },
                    true,
                    json!({"derivation": "issue-reference+modifies"}),
                    Some(evidence(
                        "git",
                        Some(file_key.clone()),
                        None,
                        Some(commit.hash.clone()),
                        Some(display_key.clone()),
                        Some(format!(
                            "Derived through commit {}",
                            commit.hash.chars().take(7).collect::<String>()
                        )),
                    )),
                )?;
                if was_new {
                    summary.touches += 1;
                }
            }
        }
    }
    Ok(summary)
}

fn set_capabilities(
    repository: &RepositoryInfo,
    history_policy: HistoryPolicy,
    files: &[FileRecord],
    manifests: &ManifestSummary,
    syntax: &SyntaxSummary,
    history: &HistorySummary,
    graph: &mut Graph,
) {
    graph.set_capability(
        "filesystem",
        "available",
        Some(1.0),
        format!(
            "All {} Git-tracked files and their directories have exactly one contains parent.",
            files.len()
        ),
    );

    if manifests.manifest_count == 0 {
        graph.set_capability(
            "packages",
            "unavailable",
            Some(0.0),
            "No Cargo.toml or package.json manifest was tracked.",
        );
    } else {
        let coverage = manifests.parsed_manifest_count as f64 / manifests.manifest_count as f64;
        let status = if manifests.errors.is_empty() {
            "available"
        } else {
            "degraded"
        };
        graph.set_capability(
            "packages",
            status,
            Some(coverage),
            format!(
                "Parsed {}/{} manifests into {} internal packages and {} resolved dependency edges; {} parse errors.",
                manifests.parsed_manifest_count,
                manifests.manifest_count,
                manifests.packages.len(),
                manifests.dependency_edges,
                manifests.errors.len()
            ),
        );
    }

    if syntax.supported_files() == 0 {
        graph.set_capability(
            "syntax_graph",
            "unavailable",
            Some(0.0),
            "No TypeScript/TSX or Rust source files were tracked.",
        );
    } else {
        graph.set_capability(
            "syntax_graph",
            "degraded",
            Some(syntax.parsed_files() as f64 / syntax.supported_files() as f64),
            format!(
                "Conservative file/package resolution: TypeScript {}/{} statements resolved across {}/{} files; Rust {}/{} module/use statements resolved across {}/{} files. Path aliases, macros, inline modules, and symbol-level resolution are outside MVP coverage.",
                syntax.typescript_resolved,
                syntax.typescript_statements,
                syntax.typescript_files_parsed,
                syntax.typescript_files,
                syntax.rust_resolved,
                syntax.rust_statements,
                syntax.rust_files_parsed,
                syntax.rust_files,
            ),
        );
    }
    set_language_capability(
        graph,
        "typescript_imports",
        syntax.typescript_files,
        syntax.typescript_files_parsed,
        syntax.typescript_statements,
        syntax.typescript_resolved,
        "Static import/export, side-effect import, and literal dynamic import resolution; tsconfig path aliases are not resolved.",
    );
    set_language_capability(
        graph,
        "rust_imports",
        syntax.rust_files,
        syntax.rust_files_parsed,
        syntax.rust_statements,
        syntax.rust_resolved,
        "File-backed mod declarations, crate-relative uses, and manifest dependency crates; macro-expanded and symbol-level uses require a future SCIP adapter.",
    );

    if history_policy == HistoryPolicy::Off {
        graph.set_capability(
            "git_history",
            "unavailable",
            None,
            "Git history collection was intentionally disabled by --history off.",
        );
        graph.set_capability(
            "issue_file_touches",
            "unavailable",
            None,
            "Issue-to-file touch collection was intentionally disabled by --history off.",
        );
        return;
    }

    graph.set_capability(
        "git_history",
        if repository.shallow { "degraded" } else { "available" },
        (!repository.shallow).then_some(1.0),
        if repository.shallow {
            format!(
                "Git reports a shallow checkout with {} visible commit(s); the grafted root is not presented as complete history.",
                repository.commits.len()
            )
        } else {
            format!(
                "All {} commits reachable from HEAD were inspected; {}/{} changed paths resolve to current snapshot files.",
                repository.commits.len(),
                history.resolved_changed_paths,
                history.changed_paths
            )
        },
    );
    if repository.shallow {
        graph.set_capability(
            "issue_file_touches",
            "degraded",
            None,
            format!(
                "The checkout is shallow: {} visible commit(s), {} issue reference(s), and {} derived touches. Root-commit modifications are retained as evidence but do not represent complete history.",
                repository.commits.len(),
                history.issue_references,
                history.touches
            ),
        );
    } else if history.issue_references == 0 {
        graph.set_capability(
            "issue_file_touches",
            "unavailable",
            Some(0.0),
            "Full visible history contained no #<n> issue-reference convention.",
        );
    } else {
        let coverage = if history.changed_paths == 0 {
            1.0
        } else {
            history.resolved_changed_paths as f64 / history.changed_paths as f64
        };
        graph.set_capability(
            "issue_file_touches",
            "available",
            Some(coverage),
            format!(
                "Mined {} issue reference(s) and {} unique issue-to-current-file touches from complete visible history.",
                history.issue_references, history.touches
            ),
        );
    }
}

#[allow(clippy::too_many_arguments)]
fn set_language_capability(
    graph: &mut Graph,
    name: &str,
    files: usize,
    parsed: usize,
    statements: usize,
    resolved: usize,
    limitation: &str,
) {
    if files == 0 {
        graph.set_capability(
            name,
            "unavailable",
            Some(0.0),
            format!("No supported source files were tracked. {limitation}"),
        );
    } else {
        graph.set_capability(
            name,
            "degraded",
            Some(parsed as f64 / files as f64),
            format!(
                "Parsed {parsed}/{files} files and resolved {resolved}/{statements} recognized statements. {limitation}"
            ),
        );
    }
}

fn effective_history_mode(
    repository: &RepositoryInfo,
    history_policy: HistoryPolicy,
) -> &'static str {
    match history_policy {
        HistoryPolicy::Off => "absent",
        HistoryPolicy::Auto => repository.history_mode(),
    }
}

fn content_hash(revision: &str, files: &[FileRecord], history_policy: HistoryPolicy) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"CodebaseConstellation/content/v1\0");
    hasher.update(revision.as_bytes());
    hasher.update([0]);
    // Preserve the original auto-mode content identity. The off marker prevents an
    // absent-history graph from colliding with an auto graph for the same checkout.
    if history_policy == HistoryPolicy::Off {
        hasher.update(b"history-policy:off\0");
    }
    for file in files {
        hasher.update((file.path.len() as u64).to_le_bytes());
        hasher.update(file.path.as_bytes());
        hasher.update((file.bytes.len() as u64).to_le_bytes());
        hasher.update(&file.bytes);
    }
    format!("{:x}", hasher.finalize())
}

fn language_for_path(path: &str) -> Option<&'static str> {
    let file_name = path.rsplit('/').next().unwrap_or(path);
    if matches!(file_name, "Cargo.lock" | "Cargo.toml") {
        return Some("toml");
    }
    if matches!(file_name, "Dockerfile" | "Containerfile") {
        return Some("dockerfile");
    }
    let extension = file_name.rsplit_once('.')?.1.to_ascii_lowercase();
    Some(match extension.as_str() {
        "rs" => "rust",
        "ts" | "tsx" | "mts" | "cts" => "typescript",
        "js" | "jsx" | "mjs" | "cjs" => "javascript",
        "json" => "json",
        "toml" => "toml",
        "md" | "mdx" => "markdown",
        "py" => "python",
        "ps1" => "powershell",
        "sh" | "bash" => "shell",
        "css" | "scss" | "sass" | "less" => "css",
        "html" | "htm" => "html",
        "yaml" | "yml" => "yaml",
        "sql" => "sql",
        "xml" => "xml",
        "svg" => "svg",
        "txt" | "gitignore" | "gitattributes" => "text",
        _ => return None,
    })
}

fn physical_line_count(bytes: &[u8]) -> u64 {
    if bytes.is_empty() {
        return 0;
    }
    let newlines = bytes.iter().filter(|byte| **byte == b'\n').count() as u64;
    newlines + u64::from(bytes.last() != Some(&b'\n'))
}

fn tracker_display(tracker: &str) -> &'static str {
    if tracker == "github" {
        "GitHub"
    } else {
        "Git"
    }
}

#[cfg(test)]
mod tests {
    use super::{content_hash, physical_line_count, HistoryPolicy, ScanOptions};
    use crate::model::FileRecord;

    #[test]
    fn physical_loc_has_explicit_empty_and_unterminated_behavior() {
        assert_eq!(physical_line_count(b""), 0);
        assert_eq!(physical_line_count(b"one\n"), 1);
        assert_eq!(physical_line_count(b"one\ntwo"), 2);
    }

    #[test]
    fn content_identity_includes_revision_paths_and_bytes() {
        let files = vec![FileRecord {
            path: "src/lib.rs".to_owned(),
            bytes: b"pub fn example() {}\n".to_vec(),
            language: Some("rust".to_owned()),
            loc: Some(1),
        }];
        let auto = content_hash("abc", &files, HistoryPolicy::Auto);
        assert_eq!(auto, content_hash("abc", &files, HistoryPolicy::Auto));
        assert_ne!(auto, content_hash("def", &files, HistoryPolicy::Auto));
        assert_ne!(auto, content_hash("abc", &files, HistoryPolicy::Off));
    }

    #[test]
    fn library_options_default_to_history_off() {
        let options = ScanOptions::new("repository", "constellation.sqlite");
        assert_eq!(options.history, HistoryPolicy::Off);
        assert_eq!(HistoryPolicy::Auto.as_str(), "auto");
    }
}

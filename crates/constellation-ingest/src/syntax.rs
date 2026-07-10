use std::collections::{HashMap, HashSet};

use anyhow::Result;
use regex::Regex;
use serde_json::json;

use crate::manifests::{Ecosystem, PackageSpec};
use crate::model::{evidence, FileRecord, Graph};

#[derive(Debug, Clone, Default)]
pub(crate) struct SyntaxSummary {
    pub typescript_files: usize,
    pub typescript_files_parsed: usize,
    pub typescript_statements: usize,
    pub typescript_resolved: usize,
    pub rust_files: usize,
    pub rust_files_parsed: usize,
    pub rust_statements: usize,
    pub rust_resolved: usize,
}

impl SyntaxSummary {
    pub fn supported_files(&self) -> usize {
        self.typescript_files + self.rust_files
    }

    pub fn parsed_files(&self) -> usize {
        self.typescript_files_parsed + self.rust_files_parsed
    }
}

pub(crate) fn analyze_syntax(
    files: &[FileRecord],
    packages: &[PackageSpec],
    graph: &mut Graph,
) -> Result<SyntaxSummary> {
    let tracked: HashSet<&str> = files.iter().map(|file| file.path.as_str()).collect();
    let mut summary = SyntaxSummary::default();
    analyze_typescript(files, &tracked, graph, &mut summary)?;
    analyze_rust(files, packages, &tracked, graph, &mut summary)?;
    Ok(summary)
}

fn analyze_typescript(
    files: &[FileRecord],
    tracked: &HashSet<&str>,
    graph: &mut Graph,
    summary: &mut SyntaxSummary,
) -> Result<()> {
    let patterns = [
        Regex::new(
            r#"(?ms)^[ \t]*import(?:[ \t]+type)?[ \t]+.*?[ \t]+from[ \t]*[\"']([^\"'\r\n]+)[\"']"#,
        )?,
        Regex::new(r#"(?m)^[ \t]*import[ \t]*[\"']([^\"'\r\n]+)[\"']"#)?,
        Regex::new(
            r#"(?ms)^[ \t]*export(?:[ \t]+type)?[ \t]+(?:\*|\{.*?\})[ \t]+from[ \t]*[\"']([^\"'\r\n]+)[\"']"#,
        )?,
        Regex::new(r#"\bimport[ \t\r\n]*\([ \t\r\n]*[\"']([^\"'\r\n]+)[\"']"#)?,
    ];

    for file in files.iter().filter(|file| is_typescript(&file.path)) {
        summary.typescript_files += 1;
        let Some(text) = file.text() else {
            continue;
        };
        summary.typescript_files_parsed += 1;
        let mut seen = HashSet::new();
        for pattern in &patterns {
            for capture in pattern.captures_iter(text) {
                let Some(statement) = capture.get(0) else {
                    continue;
                };
                let Some(specifier) = capture.get(1) else {
                    continue;
                };
                let identity = (statement.start(), specifier.as_str().to_owned());
                if !seen.insert(identity) {
                    continue;
                }
                summary.typescript_statements += 1;
                let Some((target_key, resolution)) =
                    resolve_typescript_import(&file.path, specifier.as_str(), tracked, graph)
                else {
                    continue;
                };
                let source_key = file.node_key();
                if source_key == target_key {
                    continue;
                }
                let line = line_number(text, statement.start());
                graph.add_edge(
                    "imports",
                    &source_key,
                    &target_key,
                    1.0,
                    false,
                    json!({"language": "typescript", "resolution": resolution}),
                    Some(evidence(
                        "syntax",
                        Some(source_key.clone()),
                        Some(line),
                        None,
                        None,
                        Some(compact_excerpt(statement.as_str())),
                    )),
                )?;
                summary.typescript_resolved += 1;
            }
        }
    }
    Ok(())
}

fn resolve_typescript_import(
    source: &str,
    raw_specifier: &str,
    tracked: &HashSet<&str>,
    graph: &Graph,
) -> Option<(String, &'static str)> {
    let specifier = raw_specifier
        .split(['?', '#'])
        .next()
        .unwrap_or(raw_specifier);
    if specifier.starts_with('.') {
        let base = source
            .rsplit_once('/')
            .map(|(parent, _)| parent)
            .unwrap_or("");
        let joined = normalize_relative(base, specifier)?;
        for candidate in typescript_candidates(&joined) {
            if tracked.contains(candidate.as_str()) {
                return Some((format!("fs:{candidate}"), "relative"));
            }
        }
        return None;
    }
    let package = npm_package_name(specifier)?;
    let key = format!("pkg:npm:{package}");
    graph
        .nodes
        .contains_key(&key)
        .then_some((key, "manifest_dependency"))
}

fn typescript_candidates(path: &str) -> Vec<String> {
    let mut candidates = vec![path.to_owned()];
    let extensions = ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs", "json"];
    let has_known_extension = path
        .rsplit_once('.')
        .map(|(_, extension)| extensions.contains(&extension))
        .unwrap_or(false);
    if !has_known_extension {
        for extension in extensions {
            candidates.push(format!("{path}.{extension}"));
        }
        for extension in extensions {
            candidates.push(format!("{path}/index.{extension}"));
        }
    } else if let Some(stem) = path
        .strip_suffix(".js")
        .or_else(|| path.strip_suffix(".jsx"))
        .or_else(|| path.strip_suffix(".mjs"))
        .or_else(|| path.strip_suffix(".cjs"))
    {
        for extension in ["ts", "tsx", "mts", "cts"] {
            candidates.push(format!("{stem}.{extension}"));
        }
    }
    candidates
}

fn npm_package_name(specifier: &str) -> Option<String> {
    if specifier.is_empty() || specifier.starts_with("node:") || specifier.starts_with('#') {
        return None;
    }
    let mut parts = specifier.split('/');
    let first = parts.next()?;
    if first.starts_with('@') {
        Some(format!("{first}/{}", parts.next()?))
    } else {
        Some(first.to_owned())
    }
}

fn analyze_rust(
    files: &[FileRecord],
    packages: &[PackageSpec],
    tracked: &HashSet<&str>,
    graph: &mut Graph,
    summary: &mut SyntaxSummary,
) -> Result<()> {
    let cargo_packages: Vec<&PackageSpec> = packages
        .iter()
        .filter(|package| package.ecosystem == Ecosystem::Cargo)
        .collect();
    let module_maps = build_module_maps(files, &cargo_packages);
    let module_pattern = Regex::new(
        r"(?m)^[ \t]*(?:pub(?:\([^\r\n)]*\))?[ \t]+)?mod[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*;",
    )?;
    let use_pattern = Regex::new(r"(?ms)^[ \t]*(?:pub(?:\([^\r\n)]*\))?[ \t]+)?use[ \t]+([^;]+);")?;

    for file in files.iter().filter(|file| file.path.ends_with(".rs")) {
        summary.rust_files += 1;
        let Some(text) = file.text() else {
            continue;
        };
        summary.rust_files_parsed += 1;
        let package = package_for_path(&file.path, &cargo_packages);

        for capture in module_pattern.captures_iter(text) {
            let Some(statement) = capture.get(0) else {
                continue;
            };
            let Some(module_name) = capture.get(1) else {
                continue;
            };
            summary.rust_statements += 1;
            let Some(target_path) =
                resolve_module_declaration(&file.path, module_name.as_str(), tracked)
            else {
                continue;
            };
            let source_key = file.node_key();
            graph.add_edge(
                "imports",
                &source_key,
                &format!("fs:{target_path}"),
                1.0,
                false,
                json!({"language": "rust", "resolution": "module_declaration"}),
                Some(evidence(
                    "syntax",
                    Some(source_key.clone()),
                    Some(line_number(text, statement.start())),
                    None,
                    None,
                    Some(compact_excerpt(statement.as_str())),
                )),
            )?;
            summary.rust_resolved += 1;
        }

        let Some(package) = package else {
            continue;
        };
        for capture in use_pattern.captures_iter(text) {
            let Some(statement) = capture.get(0) else {
                continue;
            };
            let Some(use_path) = capture.get(1) else {
                continue;
            };
            summary.rust_statements += 1;
            let Some((target_key, resolution)) = resolve_rust_use(
                &file.path,
                use_path.as_str(),
                package,
                module_maps.get(&package.node_key),
            ) else {
                continue;
            };
            let source_key = file.node_key();
            if source_key == target_key {
                continue;
            }
            graph.add_edge(
                "imports",
                &source_key,
                &target_key,
                1.0,
                false,
                json!({"language": "rust", "resolution": resolution}),
                Some(evidence(
                    "syntax",
                    Some(source_key.clone()),
                    Some(line_number(text, statement.start())),
                    None,
                    None,
                    Some(compact_excerpt(statement.as_str())),
                )),
            )?;
            summary.rust_resolved += 1;
        }
    }
    Ok(())
}

fn build_module_maps(
    files: &[FileRecord],
    packages: &[&PackageSpec],
) -> HashMap<String, HashMap<String, String>> {
    let mut maps: HashMap<String, HashMap<String, String>> = HashMap::new();
    for package in packages {
        let source_prefix = if package.root_path.is_empty() {
            "src/".to_owned()
        } else {
            format!("{}/src/", package.root_path)
        };
        for file in files
            .iter()
            .filter(|file| file.path.starts_with(&source_prefix) && file.path.ends_with(".rs"))
        {
            let relative = &file.path[source_prefix.len()..];
            let Some(module) = rust_module_name(relative) else {
                continue;
            };
            maps.entry(package.node_key.clone())
                .or_default()
                .entry(module)
                .or_insert_with(|| file.node_key());
        }
    }
    maps
}

fn rust_module_name(relative: &str) -> Option<String> {
    if relative == "lib.rs" || relative == "main.rs" {
        return Some(String::new());
    }
    if relative.starts_with("bin/") || !relative.ends_with(".rs") {
        return None;
    }
    let without_extension = relative.strip_suffix(".rs")?;
    let module = without_extension
        .strip_suffix("/mod")
        .unwrap_or(without_extension);
    Some(module.replace('/', "::"))
}

fn package_for_path<'a>(path: &str, packages: &'a [&PackageSpec]) -> Option<&'a PackageSpec> {
    packages
        .iter()
        .copied()
        .filter(|package| path_is_under(path, &package.root_path))
        .max_by_key(|package| package.root_path.len())
}

fn resolve_module_declaration(
    source: &str,
    module_name: &str,
    tracked: &HashSet<&str>,
) -> Option<String> {
    let parent = source
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .unwrap_or("");
    let file_name = source.rsplit('/').next()?;
    let base = if matches!(file_name, "lib.rs" | "main.rs" | "mod.rs") {
        parent.to_owned()
    } else {
        let stem = file_name.strip_suffix(".rs")?;
        if parent.is_empty() {
            stem.to_owned()
        } else {
            format!("{parent}/{stem}")
        }
    };
    [
        join_path(&base, &format!("{module_name}.rs")),
        join_path(&base, &format!("{module_name}/mod.rs")),
    ]
    .into_iter()
    .find(|candidate| tracked.contains(candidate.as_str()))
}

fn resolve_rust_use(
    source: &str,
    raw_path: &str,
    package: &PackageSpec,
    module_map: Option<&HashMap<String, String>>,
) -> Option<(String, &'static str)> {
    let compact: String = raw_path
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect();
    let compact = compact.trim_start_matches("::");
    if compact.starts_with('{') {
        return None;
    }
    let prefix = compact
        .split("::{")
        .next()
        .unwrap_or(compact)
        .trim_end_matches("::*");
    let mut segments: Vec<String> = prefix
        .split("::")
        .map(|segment| segment.trim_matches(['{', '}', '*']))
        .filter(|segment| !segment.is_empty())
        .map(str::to_owned)
        .collect();
    if segments.is_empty() {
        return None;
    }

    let first = segments[0].as_str();
    if matches!(first, "std" | "core" | "alloc" | "proc_macro" | "test") {
        return None;
    }
    for dependency in &package.dependencies {
        let import_alias = dependency.alias.replace('-', "_");
        if first == import_alias {
            return dependency
                .resolved_key
                .clone()
                .map(|key| (key, "manifest_dependency"));
        }
    }
    if package.aliases.iter().any(|alias| alias == first) {
        return Some((package.node_key.clone(), "package_crate"));
    }

    let current_module = module_for_source(source, package);
    let mut absolute: Vec<String> = Vec::new();
    match first {
        "crate" => {
            segments.remove(0);
            absolute.extend(segments);
        }
        "self" => {
            segments.remove(0);
            absolute.extend(current_module);
            absolute.extend(segments);
        }
        "super" => {
            absolute = current_module;
            while segments.first().map(String::as_str) == Some("super") {
                segments.remove(0);
                absolute.pop();
            }
            absolute.extend(segments);
        }
        _ => absolute.extend(segments),
    }
    let module_map = module_map?;
    for length in (0..=absolute.len()).rev() {
        let candidate = absolute[..length].join("::");
        if let Some(target) = module_map.get(&candidate) {
            return Some((target.clone(), "crate_module"));
        }
    }
    None
}

fn module_for_source(source: &str, package: &PackageSpec) -> Vec<String> {
    let relative = if package.root_path.is_empty() {
        source
    } else {
        source
            .strip_prefix(&format!("{}/", package.root_path))
            .unwrap_or(source)
    };
    let Some(relative) = relative.strip_prefix("src/") else {
        return Vec::new();
    };
    let Some(module) = rust_module_name(relative) else {
        return Vec::new();
    };
    module
        .split("::")
        .filter(|part| !part.is_empty())
        .map(str::to_owned)
        .collect()
}

fn is_typescript(path: &str) -> bool {
    [".ts", ".tsx", ".mts", ".cts"]
        .iter()
        .any(|extension| path.ends_with(extension))
}

fn normalize_relative(base: &str, relative: &str) -> Option<String> {
    let mut parts: Vec<&str> = base.split('/').filter(|part| !part.is_empty()).collect();
    let normalized = relative.replace('\\', "/");
    for part in normalized.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            value => parts.push(value),
        }
    }
    Some(parts.join("/"))
}

fn join_path(base: &str, child: &str) -> String {
    if base.is_empty() {
        child.to_owned()
    } else {
        format!("{base}/{child}")
    }
}

fn path_is_under(path: &str, root: &str) -> bool {
    root.is_empty() || path.starts_with(&format!("{root}/"))
}

fn line_number(text: &str, byte_offset: usize) -> u64 {
    text.as_bytes()[..byte_offset]
        .iter()
        .filter(|byte| **byte == b'\n')
        .count() as u64
        + 1
}

fn compact_excerpt(statement: &str) -> String {
    let collapsed = statement.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.chars().take(240).collect()
}

#[cfg(test)]
mod tests {
    use super::{normalize_relative, npm_package_name, rust_module_name, typescript_candidates};

    #[test]
    fn resolves_typescript_candidate_shapes() {
        let candidates = typescript_candidates("src/shared/types");
        assert!(candidates.contains(&"src/shared/types.ts".to_owned()));
        assert!(candidates.contains(&"src/shared/types/index.tsx".to_owned()));
        assert_eq!(
            normalize_relative("src/sidebar", "../shared/types"),
            Some("src/shared/types".to_owned())
        );
        assert_eq!(
            npm_package_name("@tauri-apps/api/core").as_deref(),
            Some("@tauri-apps/api")
        );
    }

    #[test]
    fn maps_file_backed_rust_modules() {
        assert_eq!(rust_module_name("lib.rs"), Some(String::new()));
        assert_eq!(rust_module_name("api/mod.rs").as_deref(), Some("api"));
        assert_eq!(
            rust_module_name("api/message_store.rs").as_deref(),
            Some("api::message_store")
        );
    }
}

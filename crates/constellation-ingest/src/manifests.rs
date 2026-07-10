use std::collections::HashMap;

use anyhow::Result;
use serde_json::{json, Value as JsonValue};
use toml::Value as TomlValue;

use crate::model::{evidence, FileRecord, Graph, NodeDraft};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum Ecosystem {
    Npm,
    Cargo,
}

impl Ecosystem {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Npm => "npm",
            Self::Cargo => "cargo",
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct DependencySpec {
    pub alias: String,
    pub package_name: String,
    pub scope: String,
    pub requirement: Option<String>,
    pub path: Option<String>,
    pub line: Option<u64>,
    pub resolved_key: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct PackageSpec {
    pub node_key: String,
    pub name: String,
    pub ecosystem: Ecosystem,
    pub manifest_path: String,
    pub root_path: String,
    pub version: Option<String>,
    pub aliases: Vec<String>,
    pub dependencies: Vec<DependencySpec>,
}

#[derive(Debug, Clone)]
pub(crate) struct ManifestSummary {
    pub packages: Vec<PackageSpec>,
    pub manifest_count: usize,
    pub parsed_manifest_count: usize,
    pub errors: Vec<String>,
    pub dependency_edges: usize,
}

pub(crate) fn discover_packages(
    files: &[FileRecord],
    graph: &mut Graph,
) -> Result<ManifestSummary> {
    let mut packages = Vec::new();
    let mut manifest_count = 0;
    let mut parsed_manifest_count = 0;
    let mut errors = Vec::new();

    for file in files {
        let file_name = file.path.rsplit('/').next().unwrap_or(&file.path);
        if file_name != "package.json" && file_name != "Cargo.toml" {
            continue;
        }
        manifest_count += 1;
        mark_manifest(graph, file, file_name == "Cargo.toml");
        let Some(text) = file.text() else {
            errors.push(format!("{} is not UTF-8", file.path));
            continue;
        };
        let parsed = if file_name == "package.json" {
            parse_npm_manifest(file, text)
        } else {
            parse_cargo_manifest(file, text)
        };
        match parsed {
            Ok(mut found) => {
                parsed_manifest_count += 1;
                packages.append(&mut found);
            }
            Err(error) => errors.push(format!("{}: {error:#}", file.path)),
        }
    }

    packages.sort_by(|left, right| left.node_key.cmp(&right.node_key));
    for package in &packages {
        graph.add_node(NodeDraft {
            stable_key: package.node_key.clone(),
            kind: "package".to_owned(),
            name: package.name.clone(),
            qualified_name: Some(format!("{}:{}", package.ecosystem.as_str(), package.name)),
            path: None,
            language: (package.ecosystem == Ecosystem::Cargo).then(|| "rust".to_owned()),
            external: false,
            start_line: None,
            end_line: None,
            confidence: 1.0,
            attributes: json!({
                "ecosystem": package.ecosystem.as_str(),
                "manifest": package.manifest_path,
                "root": package.root_path,
                "version": package.version,
            }),
        })?;
    }

    add_package_groups(files, &packages, graph)?;
    let dependency_edges = resolve_dependencies(&mut packages, graph)?;

    Ok(ManifestSummary {
        packages,
        manifest_count,
        parsed_manifest_count,
        errors,
        dependency_edges,
    })
}

fn mark_manifest(graph: &mut Graph, file: &FileRecord, cargo: bool) {
    if let Some(node) = graph.nodes.get_mut(&file.node_key()) {
        let mut attributes = node.attributes.as_object().cloned().unwrap_or_default();
        attributes.insert("manifest".to_owned(), JsonValue::Bool(true));
        if cargo {
            attributes.insert(
                "ecosystem".to_owned(),
                JsonValue::String("cargo".to_owned()),
            );
        } else {
            attributes.insert("ecosystem".to_owned(), JsonValue::String("npm".to_owned()));
        }
        node.attributes = JsonValue::Object(attributes);
    }
}

fn parse_npm_manifest(file: &FileRecord, text: &str) -> Result<Vec<PackageSpec>> {
    let value: JsonValue = serde_json::from_str(text)?;
    let Some(name) = value.get("name").and_then(JsonValue::as_str) else {
        return Ok(Vec::new());
    };
    let version = value
        .get("version")
        .and_then(JsonValue::as_str)
        .map(str::to_owned);
    let mut dependencies = Vec::new();
    for (table, scope) in [
        ("dependencies", "runtime"),
        ("devDependencies", "development"),
        ("optionalDependencies", "optional"),
        ("peerDependencies", "peer"),
    ] {
        if let Some(entries) = value.get(table).and_then(JsonValue::as_object) {
            for (dependency, requirement) in entries {
                dependencies.push(DependencySpec {
                    alias: dependency.clone(),
                    package_name: dependency.clone(),
                    scope: scope.to_owned(),
                    requirement: requirement.as_str().map(str::to_owned),
                    path: None,
                    line: find_manifest_line(text, dependency),
                    resolved_key: None,
                });
            }
        }
    }
    Ok(vec![PackageSpec {
        node_key: format!("pkg:npm:{name}"),
        name: name.to_owned(),
        ecosystem: Ecosystem::Npm,
        manifest_path: file.path.clone(),
        root_path: parent_path(&file.path),
        version,
        aliases: vec![name.to_owned()],
        dependencies,
    }])
}

fn parse_cargo_manifest(file: &FileRecord, text: &str) -> Result<Vec<PackageSpec>> {
    let value: TomlValue = toml::from_str(text)?;
    let Some(package) = value.get("package").and_then(TomlValue::as_table) else {
        if value.get("workspace").is_some() {
            return Ok(Vec::new());
        }
        return Ok(Vec::new());
    };
    let Some(name) = package.get("name").and_then(TomlValue::as_str) else {
        return Ok(Vec::new());
    };
    let version = package
        .get("version")
        .and_then(TomlValue::as_str)
        .map(str::to_owned);
    let mut aliases = vec![name.replace('-', "_")];
    if let Some(lib_name) = value
        .get("lib")
        .and_then(TomlValue::as_table)
        .and_then(|table| table.get("name"))
        .and_then(TomlValue::as_str)
    {
        if !aliases.iter().any(|alias| alias == lib_name) {
            aliases.push(lib_name.to_owned());
        }
    }
    let mut dependencies = Vec::new();
    collect_cargo_dependency_tables(&value, text, "", &mut dependencies);
    if let Some(targets) = value.get("target").and_then(TomlValue::as_table) {
        for (target, target_value) in targets {
            collect_cargo_dependency_tables(
                target_value,
                text,
                &format!("target:{target}:"),
                &mut dependencies,
            );
        }
    }
    Ok(vec![PackageSpec {
        node_key: format!("pkg:cargo:{name}"),
        name: name.to_owned(),
        ecosystem: Ecosystem::Cargo,
        manifest_path: file.path.clone(),
        root_path: parent_path(&file.path),
        version,
        aliases,
        dependencies,
    }])
}

fn collect_cargo_dependency_tables(
    value: &TomlValue,
    text: &str,
    scope_prefix: &str,
    dependencies: &mut Vec<DependencySpec>,
) {
    for (table_name, scope) in [
        ("dependencies", "runtime"),
        ("dev-dependencies", "development"),
        ("build-dependencies", "build"),
    ] {
        let Some(table) = value.get(table_name).and_then(TomlValue::as_table) else {
            continue;
        };
        for (alias, declaration) in table {
            let package_name = declaration
                .as_table()
                .and_then(|details| details.get("package"))
                .and_then(TomlValue::as_str)
                .unwrap_or(alias)
                .to_owned();
            let requirement = declaration.as_str().map(str::to_owned).or_else(|| {
                declaration
                    .as_table()
                    .and_then(|details| details.get("version"))
                    .and_then(TomlValue::as_str)
                    .map(str::to_owned)
            });
            let path = declaration
                .as_table()
                .and_then(|details| details.get("path"))
                .and_then(TomlValue::as_str)
                .map(str::to_owned);
            dependencies.push(DependencySpec {
                alias: alias.clone(),
                package_name,
                scope: format!("{scope_prefix}{scope}"),
                requirement,
                path,
                line: find_manifest_line(text, alias),
                resolved_key: None,
            });
        }
    }
}

fn add_package_groups(
    files: &[FileRecord],
    packages: &[PackageSpec],
    graph: &mut Graph,
) -> Result<()> {
    for package in packages {
        let manifest_key = format!("fs:{}", package.manifest_path);
        for file in files
            .iter()
            .filter(|file| path_is_under(&file.path, &package.root_path))
        {
            let role = if file.path == package.manifest_path {
                "manifest"
            } else {
                "package_root"
            };
            graph.add_edge(
                "groups",
                &package.node_key,
                &file.node_key(),
                1.0,
                false,
                json!({"role": role}),
                (file.path == package.manifest_path).then(|| {
                    evidence(
                        "manifest",
                        Some(manifest_key.clone()),
                        None,
                        None,
                        None,
                        Some(format!(
                            "{} package is declared by {}",
                            package.ecosystem.as_str(),
                            package.manifest_path
                        )),
                    )
                }),
            )?;
        }
    }
    Ok(())
}

fn resolve_dependencies(packages: &mut [PackageSpec], graph: &mut Graph) -> Result<usize> {
    let internal_by_name: HashMap<(Ecosystem, String), String> = packages
        .iter()
        .map(|package| {
            (
                (package.ecosystem, package.name.clone()),
                package.node_key.clone(),
            )
        })
        .collect();
    let internal_by_root: HashMap<(Ecosystem, String), String> = packages
        .iter()
        .map(|package| {
            (
                (package.ecosystem, package.root_path.clone()),
                package.node_key.clone(),
            )
        })
        .collect();
    let mut edge_count = 0;

    for package in packages {
        let manifest_key = format!("fs:{}", package.manifest_path);
        for dependency in &mut package.dependencies {
            let path_target = dependency.path.as_deref().and_then(|path| {
                normalize_join(&package.root_path, path)
                    .and_then(|root| internal_by_root.get(&(package.ecosystem, root)).cloned())
            });
            let target_key = path_target
                .or_else(|| {
                    internal_by_name
                        .get(&(package.ecosystem, dependency.package_name.clone()))
                        .cloned()
                })
                .unwrap_or_else(|| {
                    format!(
                        "pkg:{}:{}",
                        package.ecosystem.as_str(),
                        dependency.package_name
                    )
                });
            if !graph.nodes.contains_key(&target_key) {
                graph.add_node(NodeDraft {
                    stable_key: target_key.clone(),
                    kind: "package".to_owned(),
                    name: dependency.package_name.clone(),
                    qualified_name: Some(format!(
                        "{}:{}",
                        package.ecosystem.as_str(),
                        dependency.package_name
                    )),
                    path: None,
                    language: (package.ecosystem == Ecosystem::Cargo).then(|| "rust".to_owned()),
                    external: true,
                    start_line: None,
                    end_line: None,
                    confidence: 1.0,
                    attributes: json!({
                        "ecosystem": package.ecosystem.as_str(),
                        "declared_dependency": true,
                    }),
                })?;
            }
            dependency.resolved_key = Some(target_key.clone());
            if target_key == package.node_key {
                continue;
            }
            let edge_key = format!("depends_on:{}->{}", package.node_key, target_key);
            let was_new = !graph.edges.contains_key(&edge_key);
            graph.add_edge(
                "depends_on",
                &package.node_key,
                &target_key,
                1.0,
                false,
                json!({"ecosystem": package.ecosystem.as_str()}),
                Some(evidence(
                    "manifest",
                    Some(manifest_key.clone()),
                    dependency.line,
                    None,
                    None,
                    Some(format!(
                        "{} dependency {} ({}){}",
                        package.ecosystem.as_str(),
                        dependency.alias,
                        dependency.scope,
                        dependency
                            .requirement
                            .as_deref()
                            .map(|requirement| format!(": {requirement}"))
                            .unwrap_or_default()
                    )),
                )),
            )?;
            if was_new {
                edge_count += 1;
            }
        }
    }
    Ok(edge_count)
}

fn parent_path(path: &str) -> String {
    path.rsplit_once('/')
        .map(|(parent, _)| parent.to_owned())
        .unwrap_or_default()
}

fn path_is_under(path: &str, root: &str) -> bool {
    root.is_empty() || path == root || path.starts_with(&format!("{root}/"))
}

fn find_manifest_line(text: &str, needle: &str) -> Option<u64> {
    text.lines()
        .position(|line| line.contains(needle))
        .map(|index| index as u64 + 1)
}

fn normalize_join(base: &str, relative: &str) -> Option<String> {
    let relative = relative.replace('\\', "/");
    if relative.starts_with('/') || relative.contains(':') {
        return None;
    }
    let mut parts: Vec<&str> = base.split('/').filter(|part| !part.is_empty()).collect();
    for part in relative.split('/') {
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

#[cfg(test)]
mod tests {
    use super::normalize_join;

    #[test]
    fn resolves_manifest_paths_without_platform_separators() {
        assert_eq!(
            normalize_join("crates/app", "../shared"),
            Some("crates/shared".to_owned())
        );
        assert_eq!(normalize_join("", "../../outside"), None);
    }
}

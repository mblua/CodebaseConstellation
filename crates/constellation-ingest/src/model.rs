use std::collections::BTreeMap;

use anyhow::{bail, Result};
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone)]
pub(crate) struct FileRecord {
    pub path: String,
    pub bytes: Vec<u8>,
    pub language: Option<String>,
    pub loc: Option<u64>,
}

impl FileRecord {
    pub fn node_key(&self) -> String {
        format!("fs:{}", self.path)
    }

    pub fn text(&self) -> Option<&str> {
        std::str::from_utf8(&self.bytes).ok()
    }
}

#[derive(Debug, Clone)]
pub(crate) struct NodeDraft {
    pub stable_key: String,
    pub kind: String,
    pub name: String,
    pub qualified_name: Option<String>,
    pub path: Option<String>,
    pub language: Option<String>,
    pub external: bool,
    pub start_line: Option<u64>,
    pub end_line: Option<u64>,
    pub confidence: f64,
    pub attributes: Value,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct EvidenceDraft {
    pub kind: String,
    pub file_key: Option<String>,
    pub start_line: Option<u64>,
    pub end_line: Option<u64>,
    pub commit_hash: Option<String>,
    pub issue_key: Option<String>,
    pub excerpt: Option<String>,
    pub attributes: Value,
}

#[derive(Debug, Clone)]
pub(crate) struct EdgeDraft {
    pub stable_key: String,
    pub source_key: String,
    pub target_key: String,
    pub kind: String,
    pub weight: f64,
    pub confidence: f64,
    pub is_derived: bool,
    pub attributes: Value,
    pub evidence: Vec<EvidenceDraft>,
}

#[derive(Debug, Clone)]
pub(crate) struct NodeMetricDraft {
    pub node_key: String,
    pub key: String,
    pub value: f64,
    pub unit: String,
    pub provenance: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CapabilityReport {
    pub status: String,
    pub coverage: Option<f64>,
    pub detail: String,
}

#[derive(Debug, Clone)]
pub(crate) struct Graph {
    pub nodes: BTreeMap<String, NodeDraft>,
    pub edges: BTreeMap<String, EdgeDraft>,
    pub node_metrics: BTreeMap<(String, String), NodeMetricDraft>,
    pub capabilities: BTreeMap<String, CapabilityReport>,
}

impl Graph {
    pub fn new() -> Self {
        Self {
            nodes: BTreeMap::new(),
            edges: BTreeMap::new(),
            node_metrics: BTreeMap::new(),
            capabilities: BTreeMap::new(),
        }
    }

    pub fn add_node(&mut self, node: NodeDraft) -> Result<()> {
        if let Some(existing) = self.nodes.get(&node.stable_key) {
            if existing.kind != node.kind {
                bail!(
                    "stable key {} was assigned to both {} and {} nodes",
                    node.stable_key,
                    existing.kind,
                    node.kind
                );
            }
            return Ok(());
        }
        self.nodes.insert(node.stable_key.clone(), node);
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn add_edge(
        &mut self,
        kind: &str,
        source_key: &str,
        target_key: &str,
        confidence: f64,
        is_derived: bool,
        attributes: Value,
        evidence: Option<EvidenceDraft>,
    ) -> Result<()> {
        if source_key == target_key {
            return Ok(());
        }
        if !self.nodes.contains_key(source_key) {
            bail!("edge source does not exist: {source_key}");
        }
        if !self.nodes.contains_key(target_key) {
            bail!("edge target does not exist: {target_key}");
        }
        let stable_key = format!("{kind}:{source_key}->{target_key}");
        if let Some(existing) = self.edges.get_mut(&stable_key) {
            existing.confidence = existing.confidence.min(confidence);
            existing.is_derived |= is_derived;
            if let Some(evidence) = evidence {
                if !existing.evidence.contains(&evidence) {
                    existing.evidence.push(evidence);
                }
            }
            return Ok(());
        }
        let evidence = evidence.into_iter().collect();
        self.edges.insert(
            stable_key.clone(),
            EdgeDraft {
                stable_key,
                source_key: source_key.to_owned(),
                target_key: target_key.to_owned(),
                kind: kind.to_owned(),
                weight: 1.0,
                confidence,
                is_derived,
                attributes,
                evidence,
            },
        );
        Ok(())
    }

    pub fn add_node_metric(
        &mut self,
        node_key: &str,
        key: &str,
        value: f64,
        unit: &str,
        provenance: &str,
    ) {
        let metric = NodeMetricDraft {
            node_key: node_key.to_owned(),
            key: key.to_owned(),
            value,
            unit: unit.to_owned(),
            provenance: provenance.to_owned(),
        };
        self.node_metrics
            .insert((node_key.to_owned(), key.to_owned()), metric);
    }

    pub fn set_capability(
        &mut self,
        name: &str,
        status: &str,
        coverage: Option<f64>,
        detail: impl Into<String>,
    ) {
        self.capabilities.insert(
            name.to_owned(),
            CapabilityReport {
                status: status.to_owned(),
                coverage,
                detail: detail.into(),
            },
        );
    }
}

pub(crate) fn evidence(
    kind: &str,
    file_key: Option<String>,
    start_line: Option<u64>,
    commit_hash: Option<String>,
    issue_key: Option<String>,
    excerpt: Option<String>,
) -> EvidenceDraft {
    EvidenceDraft {
        kind: kind.to_owned(),
        file_key,
        start_line,
        end_line: start_line,
        commit_hash,
        issue_key,
        excerpt,
        attributes: serde_json::json!({}),
    }
}

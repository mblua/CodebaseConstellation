export const NODE_ADJACENCY_QUERY = `
  WITH adjacent AS (
    SELECT * FROM edges
    WHERE snapshot_id = ? AND (source_node_id = ? OR target_node_id = ?)
    ORDER BY kind, id
    LIMIT 200
  )
  SELECT e.id AS edge_id, e.kind AS edge_kind, ek.category AS edge_category,
         e.confidence AS edge_confidence, e.weight AS edge_weight,
         e.is_derived, ek.directed,
         CASE WHEN e.source_node_id = ? THEN e.target_node_id ELSE e.source_node_id END AS neighbor_id,
         CASE WHEN ek.directed = 0 THEN 'undirected'
              WHEN e.source_node_id = ? THEN 'outgoing' ELSE 'incoming' END AS direction,
         neighbor.name AS neighbor_name, neighbor.kind AS neighbor_kind,
         neighbor.path AS neighbor_path,
         ev.id AS evidence_id, ev.evidence_kind, ev.file_node_id,
         ev.start_line, ev.end_line, ev.commit_hash, ev.issue_key, ev.excerpt
  FROM adjacent AS e
  JOIN edge_kinds AS ek ON ek.key = e.kind
  JOIN nodes AS neighbor
    ON neighbor.snapshot_id = e.snapshot_id
   AND neighbor.id = CASE WHEN e.source_node_id = ? THEN e.target_node_id ELSE e.source_node_id END
  LEFT JOIN edge_evidence AS ev
    ON ev.snapshot_id = e.snapshot_id AND ev.edge_id = e.id
  ORDER BY e.kind, neighbor.name, e.id, ev.id
`;

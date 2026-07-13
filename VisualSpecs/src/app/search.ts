import type { GraphModel } from '../contract/model.ts';
import type { NodeId } from '../contract/types.ts';

/** Case-insensitive substring over the label and the real physical path. Simple,
 *  predictable, and it never needs to explain itself. */
export function matchNodes(model: GraphModel, query: string): ReadonlySet<NodeId> {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === '') return new Set<NodeId>();

  const matches = new Set<NodeId>();
  for (const node of model.nodes) {
    if (node.label.toLowerCase().includes(trimmed)) {
      matches.add(node.id);
      continue;
    }
    if (node.path !== undefined && node.path.toLowerCase().includes(trimmed)) {
      matches.add(node.id);
    }
  }
  return matches;
}

// Denial-of-service caps (§11). Checked BEFORE graph construction, so a hostile
// document is refused rather than hanging the tab.
//
// The numbers are sized for real repositories with headroom, not for elegance:
// AgentsCommander is ~640 files. A cap that a real dataset trips is a bug.

export interface Limits {
  /** Raw JSON text length, in UTF-16 code units. */
  maxBytes: number;
  maxNodes: number;
  maxEdges: number;
  /** Any single string value anywhere in the document. */
  maxStringLength: number;
  /** Nesting depth of the parsed JSON tree. */
  maxDepth: number;
  /** Evidence entries per node or edge. */
  maxEvidencePerItem: number;
  /** Total object/array nodes in the JSON tree — the real work bound. */
  maxJsonNodes: number;
  /** |x| and |y| bound in world coordinates. */
  maxCoordinate: number;
  minZoom: number;
  maxZoom: number;
}

export const DEFAULT_LIMITS: Limits = {
  maxBytes: 64 * 1024 * 1024,
  maxNodes: 200_000,
  maxEdges: 500_000,
  maxStringLength: 100_000,
  maxDepth: 64,
  maxEvidencePerItem: 1_000,
  maxJsonNodes: 5_000_000,
  maxCoordinate: 1_000_000,
  minZoom: 0.02,
  maxZoom: 50,
};

/** Keys that are never legal, anywhere, at any depth (§11: prototype pollution).
 *  This is the one place forward-compatibility yields to safety. */
export const DANGEROUS_KEYS: readonly string[] = ['__proto__', 'constructor', 'prototype'];

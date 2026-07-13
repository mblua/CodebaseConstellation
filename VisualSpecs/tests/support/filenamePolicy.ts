/** Shared conformance table for the deliberately duplicated contract/adapter validators. */
export const acceptedJsonSegments = [
  '20260712-153529_project.json',
  'visual-specs-2.json',
  'a.b.json',
] as const;

export const unicodeWhitespaceEdgeCharacters = [
  '\u00a0',
  '\u1680',
  '\u2009',
  '\u2028',
  '\u205f',
  '\u3000',
] as const;

export const rejectedJsonSegments = [
  '../project.json',
  'project.txt',
  '.hidden.json',
  '-leading.json',
  'trailing-.json',
  'trailing..json',
  'space .json',
  'vis\u200bual.json',
  'vis\u2060ual.json',
  'vis\ufeffual.json',
  'vis\u202eual.json',
  ...unicodeWhitespaceEdgeCharacters.map((space) => `report${space}.json`),
] as const;

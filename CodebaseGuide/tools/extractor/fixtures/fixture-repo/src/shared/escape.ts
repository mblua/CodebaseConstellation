// An import that climbs ABOVE the repository root.
//
// The old path normaliser popped an empty stack and silently handed back
// `package.json` — a real, git-tracked file at the root of this fixture. So this
// import, which reaches for something OUTSIDE the repository entirely, became an edge
// to an unrelated file INSIDE it: a relation the map asserted and could not point at.
//
// It must produce NO edge.
import '../../../package.json';

export const ESCAPE = 1;

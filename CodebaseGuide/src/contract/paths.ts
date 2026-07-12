// Known path fields are POSIX-relative and validated hard (§11, I7).
//
// Scoped deliberately: this covers `node.path`, `Evidence.path` and
// `source.root`. It is NOT claimed for `metadata`, `label`, `note`, `snippet` or
// preserved unknown fields, which are free-form and are scanned-and-warned
// instead (see json.ts).

export type PathProblem =
  | 'empty'
  | 'absolute'
  | 'drive-letter'
  | 'unc'
  | 'backslash'
  | 'parent-segment'
  | 'current-segment'
  | 'empty-segment'
  | 'trailing-slash'
  | 'nul'
  | 'control-character';

const PROBLEM_TEXT: Record<PathProblem, string> = {
  empty: 'is empty',
  absolute: 'is absolute',
  'drive-letter': 'carries a drive letter',
  unc: 'is a UNC path',
  backslash: 'contains a backslash',
  'parent-segment': 'contains a ".." segment',
  'current-segment': 'contains a "." segment',
  'empty-segment': 'contains an empty segment',
  'trailing-slash': 'ends with a slash',
  nul: 'contains a NUL byte',
  'control-character': 'contains a control character',
};

export function describePathProblem(problem: PathProblem): string {
  return PROBLEM_TEXT[problem];
}

/**
 * @param allowEmpty the empty string denotes the repository root directory. It is
 *   legal only where the contract says so: a root node, or a node declaring
 *   `metadata.rootAnchor === true` (see types.ts, `GuideNode.path`).
 */
export function checkRelativePath(value: string, allowEmpty: boolean): PathProblem | null {
  if (value === '') return allowEmpty ? null : 'empty';

  if (value.includes('\0')) return 'nul';
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return 'control-character';
  }

  if (value.startsWith('\\\\') || value.startsWith('//')) return 'unc';
  if (value.includes('\\')) return 'backslash';
  if (/^[A-Za-z]:/.test(value)) return 'drive-letter';
  if (value.startsWith('/')) return 'absolute';
  if (value.endsWith('/')) return 'trailing-slash';

  const segments = value.split('/');
  for (const segment of segments) {
    if (segment === '') return 'empty-segment';
    if (segment === '..') return 'parent-segment';
    if (segment === '.') return 'current-segment';
  }
  return null;
}

/** `source.root` is a validated basename: a single segment, no separators. */
export function checkSourceRoot(value: string): PathProblem | null {
  const problem = checkRelativePath(value, false);
  if (problem !== null) return problem;
  if (value.includes('/')) return 'empty-segment';
  return null;
}

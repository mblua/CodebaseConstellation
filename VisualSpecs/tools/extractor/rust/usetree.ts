// A dedicated use-tree parser (§10.3).
//
// A naive line scanner is not adequate, and the repository proves it: grouped
// use-trees — `use crate::{…}`, `use crate::a::{…}`, `use super::{…}` — are real
// and common, and a per-line regex mis-parses every one of them. Nesting is
// arbitrary: `use crate::a::{b, c::{d, e}, f as g};` is four distinct imports.
//
// The grammar is small and closed, so it gets a real parser rather than a regex:
//
//   use-tree := path                       // use a::b::c;
//             | path '::' '*'              // use a::b::*;      → glob
//             | path '::' '{' list '}'     // use a::{b, c};
//             | '{' list '}'
//   list     := use-tree (',' use-tree)* ','?
//   path     := segment ('::' segment)*
//   segment  := ident | 'crate' | 'self' | 'super'
//
// `as` aliases are parsed and dropped: an alias renames a binding, it does not
// change which file the import reaches.

export interface UseLeaf {
  /** Full path segments, e.g. ['crate', 'commands', 'config', 'get_settings']. */
  path: string[];
  /** `use a::b::*` — a glob. Never guessed at; always goes to `unresolved`. */
  glob: boolean;
}

export interface UseStatement {
  leaves: UseLeaf[];
  /** 1-based line of the `use` keyword. */
  line: number;
}

/** Strip line comments and block comments, preserving offsets so lines stay right. */
export function stripComments(source: string): string {
  let out = '';
  let i = 0;
  let inLine = false;
  let inBlock = 0;
  let inString: '"' | null = null;

  while (i < source.length) {
    const ch = source[i] as string;
    const next = source[i + 1];

    if (inLine) {
      if (ch === '\n') {
        inLine = false;
        out += ch;
      } else {
        out += ' ';
      }
      i += 1;
      continue;
    }
    if (inBlock > 0) {
      if (ch === '/' && next === '*') {
        inBlock += 1;
        out += '  ';
        i += 2;
        continue;
      }
      if (ch === '*' && next === '/') {
        inBlock -= 1;
        out += '  ';
        i += 2;
        continue;
      }
      out += ch === '\n' ? '\n' : ' ';
      i += 1;
      continue;
    }
    if (inString !== null) {
      out += ch;
      if (ch === '\\') {
        out += source[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (ch === inString) inString = null;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      inLine = true;
      out += '  ';
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlock = 1;
      out += '  ';
      i += 2;
      continue;
    }
    if (ch === '"') {
      inString = '"';
      out += ch;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

const USE_RE = /(^|[;{}\s])(?:pub(?:\s*\([^)]*\))?\s+)?use\s+/g;

/** Every `use` statement in a Rust source, with its nested tree fully expanded. */
export function parseUseStatements(source: string): UseStatement[] {
  const text = stripComments(source);
  const out: UseStatement[] = [];

  USE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = USE_RE.exec(text)) !== null) {
    const bodyStart = match.index + match[0].length;
    const end = findStatementEnd(text, bodyStart);
    if (end === -1) continue;
    const body = text.slice(bodyStart, end);
    const line = text.slice(0, match.index + match[0].length).split('\n').length;

    const leaves = parseTree(body);
    if (leaves.length > 0) out.push({ leaves, line });
    USE_RE.lastIndex = end;
  }

  return out;
}

/** The `;` that closes the statement, skipping any it finds inside braces. */
function findStatementEnd(text: string, from: number): number {
  let depth = 0;
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === ';' && depth <= 0) return i;
  }
  return -1;
}

export function parseTree(body: string): UseLeaf[] {
  const leaves: UseLeaf[] = [];
  walk(body.trim(), [], leaves);
  return leaves;
}

function walk(input: string, prefix: string[], out: UseLeaf[]): void {
  const trimmed = input.trim();
  if (trimmed === '') return;

  const brace = indexOfTopLevelBrace(trimmed);
  if (brace === -1) {
    // A plain path, possibly a glob, possibly aliased.
    const withoutAlias = trimmed.split(/\s+as\s+/)[0] as string;
    const segments = withoutAlias
      .split('::')
      .map((s) => s.trim())
      .filter((s) => s !== '');
    if (segments.length === 0) return;
    if (segments[segments.length - 1] === '*') {
      out.push({ path: [...prefix, ...segments.slice(0, -1)], glob: true });
      return;
    }
    out.push({ path: [...prefix, ...segments], glob: false });
    return;
  }

  const head = trimmed.slice(0, brace);
  const close = matchBrace(trimmed, brace);
  if (close === -1) return;
  const inner = trimmed.slice(brace + 1, close);

  const headSegments = head
    .split('::')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  const nextPrefix = [...prefix, ...headSegments];

  for (const part of splitTopLevel(inner)) {
    const p = part.trim();
    if (p === '') continue;
    if (p === 'self') {
      // `use a::{self, b}` imports `a` itself.
      out.push({ path: [...nextPrefix], glob: false });
      continue;
    }
    if (p.startsWith('self as ')) {
      out.push({ path: [...nextPrefix], glob: false });
      continue;
    }
    walk(p, nextPrefix, out);
  }
}

function indexOfTopLevelBrace(s: string): number {
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '{') return i;
  }
  return -1;
}

function matchBrace(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

export interface ModDeclaration {
  name: string;
  line: number;
}

/**
 * `mod foo;` — a DECLARATION, which has a backing file. `mod tests { … }` is an
 * INLINE module and has none. The difference is the semicolon, and conflating them
 * would invent a file that does not exist.
 */
export function parseModDeclarations(source: string): ModDeclaration[] {
  const text = stripComments(source);
  const out: ModDeclaration[] = [];
  const re = /(^|[;{}\s])(?:pub(?:\s*\([^)]*\))?\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    out.push({
      name: match[2] as string,
      line: text.slice(0, match.index + match[0].length).split('\n').length,
    });
  }
  return out;
}

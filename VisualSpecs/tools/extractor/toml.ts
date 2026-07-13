// A deliberately small TOML reader: enough to read a Cargo manifest, and no more.
//
// It understands `[table]`, `[[array-of-tables]]`, `key = "string"`, `key = 123`,
// `key = true` and `key = ["a", "b"]`, plus comments. It does NOT understand
// inline tables, multi-line strings, or dotted keys — Cargo uses those for
// dependency specs, which this tool has no opinion about. Anything it does not
// understand it SKIPS, and the fields it needs (`[package].name`, `[workspace]`,
// `[lib].name`, `[[bin]].name/path`) are covered by fixture tests.
//
// A full TOML parser is a dependency; this is 90 lines and its limits are stated.

export type TomlValue = string | number | boolean | string[];
export interface TomlTable {
  [key: string]: TomlValue | undefined;
}

export interface TomlDoc {
  tables: Map<string, TomlTable>;
  arrays: Map<string, TomlTable[]>;
  has(section: string): boolean;
  table(section: string): TomlTable | undefined;
  array(section: string): TomlTable[];
}

export function parseToml(text: string): TomlDoc {
  const tables = new Map<string, TomlTable>();
  const arrays = new Map<string, TomlTable[]>();

  let current: TomlTable = {};
  tables.set('', current);

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (line === '') continue;

    const arrayHeader = /^\[\[\s*([^\]]+?)\s*\]\]$/.exec(line);
    if (arrayHeader !== null) {
      const name = (arrayHeader[1] as string).trim();
      const list = arrays.get(name) ?? [];
      current = {};
      list.push(current);
      arrays.set(name, list);
      continue;
    }

    const header = /^\[\s*([^\]]+?)\s*\]$/.exec(line);
    if (header !== null) {
      const name = (header[1] as string).trim();
      current = tables.get(name) ?? {};
      tables.set(name, current);
      continue;
    }

    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^"|"$/g, '');
    const value = parseValue(line.slice(eq + 1).trim());
    if (value !== undefined) current[key] = value;
  }

  return {
    tables,
    arrays,
    has: (section: string) => tables.has(section) || arrays.has(section),
    table: (section: string) => tables.get(section),
    array: (section: string) => arrays.get(section) ?? [],
  };
}

function stripComment(line: string): string {
  let inString = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') inString = !inString;
    else if (ch === '#' && !inString) return line.slice(0, i);
  }
  return line;
}

function parseValue(raw: string): TomlValue | undefined {
  if (raw === '') return undefined;
  if (raw.startsWith('"')) {
    const m = /^"((?:[^"\\]|\\.)*)"/.exec(raw);
    return m === null ? undefined : unescape(m[1] as string);
  }
  if (raw.startsWith("'")) {
    const m = /^'([^']*)'/.exec(raw);
    return m === null ? undefined : (m[1] as string);
  }
  if (raw.startsWith('[')) {
    const inner = raw.slice(1, raw.lastIndexOf(']'));
    const out: string[] = [];
    for (const part of inner.split(',')) {
      const t = part.trim();
      if (t === '') continue;
      if (t.startsWith('"') || t.startsWith("'")) out.push(t.slice(1, -1));
    }
    return out;
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const n = Number(raw);
  if (Number.isFinite(n) && /^[-+0-9._]+$/.test(raw)) return n;
  return undefined; // an inline table or something else this reader does not claim to know
}

function unescape(s: string): string {
  return s.replace(/\\(.)/g, (_, c: string) => {
    if (c === 'n') return '\n';
    if (c === 't') return '\t';
    return c;
  });
}

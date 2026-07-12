// The raw envelope: parse, scan, freeze, clone, and serialise canonically.
//
// Every walk here is ITERATIVE. A document is untrusted input, and a recursive
// walk over a depth bomb overflows the stack before any cap can fire.

import type { JsonObject, JsonValue } from './types.ts';
import { DANGEROUS_KEYS, type Limits } from './limits.ts';
import { InvalidJsonError, SchemaError } from './errors.ts';

export function isJsonObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * The UTF-8 size of a string, in BYTES — which is what `maxBytes` says, and what the
 * README and the architecture promise.
 *
 * The first cut compared `text.length`, which counts UTF-16 code units. A document of
 * emoji and CJK is up to three times bigger than its `.length` suggests, so the cap
 * could be sailed straight past. This is measured, not estimated.
 *
 * No allocation. `TextEncoder().encode(text).length` would allocate a byte array the
 * size of the document just to count it, which is a strange thing for a
 * denial-of-service guard to do. Two O(1) bounds settle almost every real case
 * without looking at the string at all:
 *
 *   bytes >= units          (every code unit costs at least one byte)
 *   bytes <= 3 * units      (a BMP char costs at most 3; a surrogate PAIR is 2 units
 *                            and 4 bytes, i.e. only 2 bytes per unit)
 */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4; // a surrogate pair is one code point
        i += 1;
        continue;
      }
      bytes += 3; // a lone surrogate encodes as U+FFFD
    } else bytes += 3;
  }
  return bytes;
}

/** True when the text is certainly over the cap, certainly under it, or — only then —
 *  after actually counting. */
export function exceedsByteCap(text: string, maxBytes: number): number | null {
  if (text.length > maxBytes) return utf8ByteLength(text); // bytes >= units: certainly over
  if (text.length * 3 <= maxBytes) return null; // bytes <= 3 * units: certainly under
  const bytes = utf8ByteLength(text);
  return bytes > maxBytes ? bytes : null;
}

/** Parse untrusted text. A depth bomb makes V8 throw RangeError, not SyntaxError;
 *  both are turned into contract errors rather than escaping as raw engine errors. */
export function parseJson(text: string, limits: Limits): JsonValue {
  const over = exceedsByteCap(text, limits.maxBytes);
  if (over !== null) {
    throw new SchemaError([`document is ${over} bytes, over the ${limits.maxBytes} byte cap`]);
  }
  try {
    return JSON.parse(text) as JsonValue;
  } catch (err) {
    if (err instanceof RangeError) {
      throw new SchemaError(['document is nested too deeply to parse']);
    }
    throw new InvalidJsonError(err instanceof Error ? err.message : String(err));
  }
}

export interface ScanResult {
  depth: number;
  jsonNodes: number;
  /** Paths (dotted, for humans) at which a dangerous key was found. */
  dangerousKeyPaths: string[];
  /** Paths at which a non-finite number was found. */
  nonFinitePaths: string[];
  /** Paths at which a string exceeded the cap. */
  oversizedStringPaths: string[];
  /** Strings anywhere in the document whose value looks like an absolute path (§11).
   *  Capped for sanity; `absolutePathLikeTotal` is the exact count. */
  absolutePathLike: { where: string; value: string }[];
  absolutePathLikeTotal: number;
}

/**
 * Anything that is not a plain relative path.
 *
 * The first cut required a character AFTER the slash (`\/[^/]`), so the POSIX root
 * `"/"` itself produced no warning at all — a free-form `metadata.cwd = "/"` was
 * reported as clean. It also missed a drive-RELATIVE path (`C:foo`), which resolves
 * against a per-drive working directory and is every bit as much a leak of the
 * machine it came from.
 *
 * A leading `/` or `\`, or a drive letter in any form, is enough. Everything else —
 * `./styles.css`, `src/main.ts`, `@shared/util.ts` — is a relative path and is left
 * alone.
 */
const ABSOLUTE_LOOKING = /^(?:[A-Za-z]:|[\\/])/;

/**
 * One iterative pass over the parsed tree. Enforces the caps that must hold
 * BEFORE graph construction, and collects the warnings §11 owes the user.
 *
 * Non-finite numbers are rejected DOCUMENT-WIDE, not only inside `view`.
 * `JSON.parse('1e400')` yields `Infinity`, and `JSON.stringify(Infinity)` yields
 * `null` — so a non-finite number anywhere would silently become `null` on
 * export and break the round-trip promise of §3.3. The architecture only
 * required this for `view` (I11); honouring the round-trip promise requires it
 * everywhere, so the stronger rule is what ships. See README, "Corrections".
 */
export function scanJson(root: JsonValue, limits: Limits): ScanResult {
  const res: ScanResult = {
    depth: 0,
    jsonNodes: 0,
    dangerousKeyPaths: [],
    nonFinitePaths: [],
    oversizedStringPaths: [],
    absolutePathLike: [],
    absolutePathLikeTotal: 0,
  };

  const stack: { value: JsonValue; depth: number; path: string }[] = [
    { value: root, depth: 1, path: '$' },
  ];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) break;
    const { value, depth, path } = frame;

    if (depth > res.depth) res.depth = depth;
    if (depth > limits.maxDepth) {
      throw new SchemaError([`document nests deeper than the ${limits.maxDepth} level cap (at ${path})`]);
    }

    res.jsonNodes += 1;
    if (res.jsonNodes > limits.maxJsonNodes) {
      throw new SchemaError([`document has more than ${limits.maxJsonNodes} JSON values`]);
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) res.nonFinitePaths.push(path);
      continue;
    }

    if (typeof value === 'string') {
      if (value.length > limits.maxStringLength) res.oversizedStringPaths.push(path);
      // EVERY string, at every depth — not three hand-picked field names.
      //
      // §11 promises that free-form values are "scanned, and absolute-path-looking
      // values are surfaced as warnings". The first cut only looked at `label`,
      // `note` and `snippet`, so `metadata.cwd = "C:\\Users\\secret"` — and any
      // preserved unknown field, and anything inside a nested object or an array —
      // slipped through silently. That is precisely the leak the warning exists to
      // point at, so the scan now covers everything the document carries.
      //
      // Known path fields are NOT exempted here: they are hard-validated and a
      // document carrying an absolute one is rejected outright, so it never reaches
      // a warning.
      if (ABSOLUTE_LOOKING.test(value)) {
        res.absolutePathLikeTotal += 1;
        if (res.absolutePathLike.length < MAX_REPORTED_ABSOLUTE_PATHS) {
          res.absolutePathLike.push({ where: path, value });
        }
      }
      continue;
    }

    if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i -= 1) {
        const item = value[i];
        if (item === undefined) continue;
        stack.push({ value: item, depth: depth + 1, path: `${path}[${i}]` });
      }
      continue;
    }

    if (isJsonObject(value)) {
      for (const key of Object.keys(value)) {
        if (DANGEROUS_KEYS.includes(key)) {
          res.dangerousKeyPaths.push(`${path}.${key}`);
          continue; // do not descend into it; it is about to be a hard rejection
        }
        const child = value[key];
        if (child === undefined) continue;
        stack.push({ value: child, depth: depth + 1, path: `${path}.${key}` });
      }
    }
  }

  return res;
}

/** A hostile document could carry a million absolute-looking strings; the warning is
 *  a signal, not a transcript. The count is still exact — only the LIST is capped. */
const MAX_REPORTED_ABSOLUTE_PATHS = 50;

/** Deep-freeze, iteratively. `raw` is never mutated after this. */
export function deepFreeze<T extends JsonValue>(root: T): T {
  const stack: JsonValue[] = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (value === undefined) break;
    if (value === null || typeof value !== 'object') continue;
    if (Object.isFrozen(value)) continue;
    Object.freeze(value);
    if (Array.isArray(value)) {
      for (const item of value) stack.push(item);
    } else {
      for (const key of Object.keys(value)) {
        const child = (value as JsonObject)[key];
        if (child !== undefined) stack.push(child);
      }
    }
  }
  return root;
}

/** Structural deep clone of a (possibly frozen) JSON tree, iteratively.
 *  `structuredClone` would work but throws on frozen-in-a-Proxy edge cases and
 *  is harder to reason about; this is 20 lines and exact. */
export function deepClone<T extends JsonValue>(value: T): T {
  return cloneValue(value) as T;
}

function cloneValue(value: JsonValue): JsonValue {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const out: JsonValue[] = new Array<JsonValue>(value.length);
    for (let i = 0; i < value.length; i += 1) {
      const item = value[i];
      out[i] = item === undefined ? null : cloneValue(item);
    }
    return out;
  }
  const out: JsonObject = Object.create(null) as JsonObject;
  for (const key of Object.keys(value)) {
    const child = (value as JsonObject)[key];
    if (child !== undefined) out[key] = cloneValue(child);
  }
  return out;
}

/**
 * Deterministic serialisation: keys sorted by UTF-16 code unit, 2-space indent.
 *
 * §3.3 is explicit that input key order and numeric literal spelling are NOT
 * preserved — only every reachable VALUE is. Sorting keys is what buys the
 * "deterministic key order" half of that promise.
 */
export function canonicalStringify(value: JsonValue): string {
  const out: string[] = [];
  writeValue(value, 0, out);
  return out.join('') + '\n';
}

function writeValue(value: JsonValue, indent: number, out: string[]): void {
  if (value === null || typeof value === 'boolean') {
    out.push(String(value));
    return;
  }
  if (typeof value === 'number') {
    // Validation rejects non-finite numbers document-wide, so this is total.
    out.push(JSON.stringify(value));
    return;
  }
  if (typeof value === 'string') {
    out.push(JSON.stringify(value));
    return;
  }
  const pad = '  '.repeat(indent);
  const padInner = '  '.repeat(indent + 1);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.push('[]');
      return;
    }
    out.push('[\n');
    for (let i = 0; i < value.length; i += 1) {
      out.push(padInner);
      const item = value[i];
      writeValue(item === undefined ? null : item, indent + 1, out);
      out.push(i === value.length - 1 ? '\n' : ',\n');
    }
    out.push(pad, ']');
    return;
  }

  const keys = Object.keys(value).sort();
  if (keys.length === 0) {
    out.push('{}');
    return;
  }
  out.push('{\n');
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i] as string;
    out.push(padInner, JSON.stringify(key), ': ');
    const child = (value as JsonObject)[key];
    writeValue(child === undefined ? null : child, indent + 1, out);
    out.push(i === keys.length - 1 ? '\n' : ',\n');
  }
  out.push(pad, '}');
}

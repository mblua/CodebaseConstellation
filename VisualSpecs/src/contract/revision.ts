import { DEFAULT_LIMITS, type Limits } from './limits.ts';
import { canonicalStringify, parseJson } from './json.ts';
import { sha256 } from './sha256.ts';

export type DocRevision = `sha256:${string}`;

export function computeDocRevision(currentText: string, limits: Limits = DEFAULT_LIMITS): DocRevision {
  return `sha256:${sha256(canonicalStringify(parseJson(currentText, limits)))}`;
}

export function isDocRevision(value: unknown): value is DocRevision {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
}

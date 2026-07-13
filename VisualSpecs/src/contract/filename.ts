const RESERVED_BASENAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

const ILLEGAL = /[\u0000-\u001f\u007f-\u009f\\/:*?"<>|]/gu;
const ILLEGAL_TEST = /[\u0000-\u001f\u007f-\u009f\\/:*?"<>|]/u;
const FORMAT_CONTROLS = /\p{Cf}/gu;
const FORMAT_CONTROLS_TEST = /\p{Cf}/u;
const COLLAPSE = /[\s-]+/g;

export function utcTimestamp(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

export function sanitizeFileStem(input: string, fallback = 'visual-specs'): string {
  let stem = input
    .normalize('NFC')
    .trim()
    .replace(ILLEGAL, '')
    .replace(FORMAT_CONTROLS, '')
    .replace(COLLAPSE, '-');
  stem = stripEdges(stem);
  stem = [...stem].slice(0, 80).join('');
  stem = stripEdges(stem);
  if (stem === '') stem = fallback;

  const base = stem.split('.')[0]?.toUpperCase() ?? stem.toUpperCase();
  if (RESERVED_BASENAMES.has(base)) stem = `${stem}-project`;
  return stem;
}

export function timestampedJsonName(input: string, d = new Date()): string {
  return `${utcTimestamp(d)}_${sanitizeFileStem(input)}.json`;
}

export function withCollisionSuffix(fileName: string, attempt: number): string {
  if (attempt <= 1) return fileName;
  return fileName.replace(/\.json$/u, `-${attempt}.json`);
}

export function isSingleJsonSegment(fileName: string): boolean {
  if (fileName !== fileName.normalize('NFC')) return false;
  if (!fileName.endsWith('.json')) return false;
  if (fileName.includes('/') || fileName.includes('\\')) return false;
  if (fileName !== fileName.trim()) return false;
  if (ILLEGAL_TEST.test(fileName) || FORMAT_CONTROLS_TEST.test(fileName)) return false;
  const stem = fileName.slice(0, -'.json'.length);
  return stripEdges(stem) === stem && stem.length > 0;
}

function stripEdges(value: string): string {
  return value.replace(/^[.\s-]+|[.\s-]+$/gu, '');
}

// The architecture test (§2, §12). It parses EVERY source file with the TypeScript
// API and fails the build on any violating import — because a convention that is not
// executable is a convention that is already broken.
//
// The sink check (§11) is AST-based for the same reason: grepping for the string
// "innerHTML" would miss `el[prop] = html` and would trip over the word in a comment.
//
// ── One amendment to §2, stated rather than smuggled ──────────────────────────
// §2 says "ui/ imports app/ and ports/". The implementation also lets `ui/` import
// `contract/`, `domain/` and `projection/` — the INNER, pure layers — because the
// detail panel renders `Evidence`, `VisualSpecsEdge` and `InternalBucket` values directly,
// and routing those types back out through `app/` would be re-export ceremony with
// no architectural benefit. The rule that actually matters is the DIRECTIONAL one,
// and it is enforced below without exception: no inner layer may import an outer
// one, `app/` may never import `ui/`, and nothing but a composition root may touch
// `adapters/`.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const VISUAL_SPECS_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = join(VISUAL_SPECS_ROOT, 'src');

/** Files that are allowed to wire concrete things together. */
const COMPOSITION_ROOTS = ['main.ts', 'conformance.ts'];

type Layer = 'contract' | 'domain' | 'projection' | 'ports' | 'app' | 'ui' | 'adapters' | 'root';

/** What each layer may import. The directional rule, executable. */
const ALLOWED: Record<Layer, Layer[]> = {
  contract: ['contract'],
  domain: ['contract', 'domain'],
  projection: ['contract', 'domain', 'projection'],
  ports: ['ports'],
  app: ['contract', 'domain', 'projection', 'ports', 'app'],
  ui: ['contract', 'domain', 'projection', 'ports', 'app', 'ui'],
  adapters: ['ports', 'adapters'],
  root: ['contract', 'domain', 'projection', 'ports', 'app', 'ui', 'adapters', 'root'],
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function layerOf(file: string): Layer {
  const rel = relative(SRC, file).split(sep).join('/');
  const top = rel.split('/')[0] ?? '';
  if (rel.split('/').length === 1) return 'root';
  if (
    top === 'contract' ||
    top === 'domain' ||
    top === 'projection' ||
    top === 'ports' ||
    top === 'app' ||
    top === 'ui' ||
    top === 'adapters'
  ) {
    return top;
  }
  throw new Error(`unknown layer for ${rel}`);
}

interface Import {
  specifier: string;
  file: string;
}

function importsOf(file: string): Import[] {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const out: Import[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      out.push({ specifier: node.moduleSpecifier.text, file });
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      out.push({ specifier: (node.arguments[0] as ts.StringLiteral).text, file });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

const FILES = walk(SRC);

describe('the import DAG (§2)', () => {
  it('finds the sources it is supposed to guard', () => {
    expect(FILES.length).toBeGreaterThan(15);
  });

  it('no layer imports a layer above it', () => {
    const violations: string[] = [];

    for (const file of FILES) {
      const from = layerOf(file);
      const rel = relative(SRC, file).split(sep).join('/');

      for (const imp of importsOf(file)) {
        if (!imp.specifier.startsWith('.')) continue; // bare specifiers: checked below
        const target = resolve(file, '..', imp.specifier);
        if (!target.startsWith(SRC)) continue; // outside src/: checked below
        const to = layerOf(target);
        const allowed = ALLOWED[from];
        if (!allowed.includes(to)) {
          violations.push(`${rel} (${from}) imports ${imp.specifier} (${to})`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('app/ NEVER imports ui/', () => {
    const bad = FILES.filter((f) => layerOf(f) === 'app').flatMap((f) =>
      importsOf(f)
        .filter((i) => i.specifier.includes('/ui/') || i.specifier.startsWith('../ui/'))
        .map((i) => `${relative(SRC, f)} → ${i.specifier}`),
    );
    expect(bad).toEqual([]);
  });

  it('ONLY a composition root imports a concrete adapter', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const rel = relative(SRC, file).split(sep).join('/');
      if (COMPOSITION_ROOTS.includes(rel)) continue;
      if (layerOf(file) === 'adapters') continue;
      for (const imp of importsOf(file)) {
        if (imp.specifier.includes('adapters/')) offenders.push(`${rel} → ${imp.specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('src/ has ZERO bare imports — so no renderer library can be hiding anywhere', () => {
    // This is the strongest possible form of "the graphics library is a detail":
    // there is no graphics library, and no runtime dependency at all. Swapping the
    // renderer adds a dependency to exactly one directory.
    const bare: string[] = [];
    for (const file of FILES) {
      for (const imp of importsOf(file)) {
        if (imp.specifier.startsWith('.') || imp.specifier.startsWith('/')) continue;
        bare.push(`${relative(SRC, file)} → ${imp.specifier}`);
      }
    }
    expect(bare).toEqual([]);
  });

  it('nothing in src/ imports outside VisualSpecs/', () => {
    const escapes: string[] = [];
    for (const file of FILES) {
      for (const imp of importsOf(file)) {
        if (!imp.specifier.startsWith('.')) continue;
        const target = resolve(file, '..', imp.specifier.split('?')[0] as string);
        const rel = relative(VISUAL_SPECS_ROOT, target);
        if (rel.split(sep)[0] === '..') escapes.push(`${relative(SRC, file)} → ${imp.specifier}`);
      }
    }
    expect(escapes).toEqual([]);
  });
});

describe('the pure layers are pure (§2)', () => {
  const PURE: Layer[] = ['contract', 'domain', 'projection'];
  const DOM_GLOBALS = [
    'document',
    'window',
    'HTMLElement',
    'HTMLCanvasElement',
    'CanvasRenderingContext2D',
    'navigator',
    'requestAnimationFrame',
    'ResizeObserver',
    'PointerEvent',
    'Blob',
    'URL',
  ];

  it('contract/, domain/ and projection/ touch no DOM and no I/O — they run headless in Node', () => {
    const violations: string[] = [];

    for (const file of FILES) {
      if (!PURE.includes(layerOf(file))) continue;
      const text = readFileSync(file, 'utf8');
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

      const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && DOM_GLOBALS.includes(node.text)) {
          // A property name (`style.text`) is not a global reference.
          const parent = node.parent;
          const isPropertyName =
            (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
            (ts.isPropertySignature(parent) && parent.name === node) ||
            (ts.isPropertyAssignment(parent) && parent.name === node);
          if (!isPropertyName) {
            const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
            violations.push(`${relative(SRC, file)}:${line + 1} references ${node.text}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }

    expect(violations).toEqual([]);
  });
});

describe('platform storage APIs stay behind adapters', () => {
  const FILESYSTEM_IDENTIFIERS = [
    /^FileSystem/,
    /^showDirectoryPicker$/,
    /^showOpenFilePicker$/,
    /^showSaveFilePicker$/,
    /^IDB/,
    /^indexedDB$/,
  ];
  const DOWNLOAD_IDENTIFIERS = [/^Blob$/, /^URL$/];

  function identifierViolations(
    patterns: readonly RegExp[],
    allowed: (rel: string) => boolean,
  ): string[] {
    const violations: string[] = [];
    for (const file of FILES) {
      const rel = relative(SRC, file).split(sep).join('/');
      const text = readFileSync(file, 'utf8');
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && patterns.some((p) => p.test(node.text)) && !allowed(rel)) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
          violations.push(`${rel}:${line + 1} references ${node.text}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    return violations;
  }

  it('FSA, pickers and IDB names appear only in adapters/filesystem/', () => {
    expect(
      identifierViolations(FILESYSTEM_IDENTIFIERS, (rel) =>
        rel.startsWith('adapters/filesystem/'),
      ),
    ).toEqual([]);
  });

  it('Blob and URL appear only under adapters/', () => {
    expect(
      identifierViolations(DOWNLOAD_IDENTIFIERS, (rel) => rel.startsWith('adapters/')),
    ).toEqual([]);
  });
});

describe('the AST sink check (§11)', () => {
  const HTML_SINKS = ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'srcdoc', 'dangerouslySetInnerHTML'];
  const EVAL_SINKS = ['eval', 'Function'];
  const NETWORK = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'sendBeacon'];

  it('no source writes HTML into the DOM, anywhere', () => {
    const violations: string[] = [];
    for (const file of FILES) {
      const text = readFileSync(file, 'utf8');
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (ts.isPropertyAccessExpression(node) && HTML_SINKS.includes(node.name.text)) {
          violations.push(`${relative(SRC, file)} uses ${node.name.text}`);
        }
        if (ts.isElementAccessExpression(node)) {
          const arg = node.argumentExpression;
          if (ts.isStringLiteral(arg) && HTML_SINKS.includes(arg.text)) {
            violations.push(`${relative(SRC, file)} uses ["${arg.text}"]`);
          }
        }
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'write'
        ) {
          const receiver = node.expression.expression;
          if (ts.isIdentifier(receiver) && receiver.text === 'document') {
            violations.push(`${relative(SRC, file)} uses document.write`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(violations).toEqual([]);
  });

  it('no source evaluates a string', () => {
    const violations: string[] = [];
    for (const file of FILES) {
      const text = readFileSync(file, 'utf8');
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'eval') {
          violations.push(`${relative(SRC, file)} calls eval`);
        }
        if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && EVAL_SINKS.includes(node.expression.text)) {
          violations.push(`${relative(SRC, file)} constructs ${node.expression.text}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(violations).toEqual([]);
  });

  it('no source makes a network call — an imported document cannot make the app phone home', () => {
    const violations: string[] = [];
    for (const file of FILES) {
      const text = readFileSync(file, 'utf8');
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && NETWORK.includes(node.expression.text)) {
          violations.push(`${relative(SRC, file)} calls ${node.expression.text}`);
        }
        if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && NETWORK.includes(node.expression.text)) {
          violations.push(`${relative(SRC, file)} constructs ${node.expression.text}`);
        }
        if (ts.isPropertyAccessExpression(node) && NETWORK.includes(node.name.text)) {
          violations.push(`${relative(SRC, file)} references .${node.name.text}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(violations).toEqual([]);
  });
});

describe('Visual Specs stays self-contained (§14)', () => {
  it('no script reads or writes web/, crates/, schema/, graph-analytics/ or fixtures/', () => {
    const pkg = JSON.parse(
      readFileSync(join(VISUAL_SPECS_ROOT, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };
    const scripts = Object.values(pkg.scripts ?? {}).join(' ');
    for (const forbidden of ['web/', 'crates/', 'schema/', 'graph-analytics/', 'fixtures/']) {
      // `tools/extractor/fixtures/` is the Visual Specs OWN fixtures directory; the
      // repository-root `fixtures/` is the one that must not be touched.
      const pattern = new RegExp(`(^|[\\s"'=])(\\.\\./)*${forbidden.replace('/', '\\/')}`);
      expect(pattern.test(scripts), `a script references ${forbidden}`).toBe(false);
    }
  });
});

// Config parsing, config→flags equivalence (A1-F1, §Verification 1/1a) and the
// out-inside-watched-repo startup validation (A1-P1-3).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, ExtractorError } from '../../tools/extractor/errors.ts';
import { extract } from '../../tools/extractor/extract.ts';
import {
  assembleExtractOptions,
  assertOutsOutsideWatchedRepos,
  parseCliArgs,
  parseIntervalMs,
  parseWatchConfig,
  type ExtractInputs,
  type WatchTarget,
} from '../../tools/extractor/watchconfig.ts';

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'vs-watchconfig-'));
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

const capture = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return undefined;
};

const expectError = (fn: () => unknown, exitCode: number, messagePart?: string): void => {
  const err = capture(fn);
  expect(err).toBeInstanceOf(ExtractorError);
  expect((err as ExtractorError).exitCode).toBe(exitCode);
  if (messagePart !== undefined) {
    expect((err as ExtractorError).message).toContain(messagePart);
  }
};

const configOf = (entries: unknown[]): string => JSON.stringify({ repos: entries });

describe('config→flags equivalence (A1-F1, pinned)', () => {
  interface Case {
    title: string;
    entry: Record<string, unknown>;
    argv: string[];
  }
  const cases: Case[] = [
    {
      title: 'defaults only',
      entry: { repo: 'r', out: 'o.json' },
      argv: ['--repo', 'r', '--out', 'o.json'],
    },
    {
      title: 'every optional field set',
      entry: {
        repo: 'r',
        out: 'o.json',
        name: 'X',
        hierarchy: 'physical',
        invokeFacade: 'ipc.call',
        bareInvoke: true,
        snippets: true,
        tsconfig: 't.json',
        stamp: true,
      },
      argv: [
        '--repo', 'r', '--out', 'o.json', '--name', 'X', '--hierarchy', 'physical',
        '--invoke-facade', 'ipc.call', '--bare-invoke', '--snippets', '--tsconfig', 't.json', '--stamp',
      ],
    },
    { title: 'name alone', entry: { repo: 'r', out: 'o.json', name: 'N' }, argv: ['--repo', 'r', '--out', 'o.json', '--name', 'N'] },
    { title: 'hierarchy alone', entry: { repo: 'r', out: 'o.json', hierarchy: 'physical' }, argv: ['--repo', 'r', '--out', 'o.json', '--hierarchy', 'physical'] },
    { title: 'invokeFacade alone', entry: { repo: 'r', out: 'o.json', invokeFacade: 'f.g' }, argv: ['--repo', 'r', '--out', 'o.json', '--invoke-facade', 'f.g'] },
    { title: 'bareInvoke alone', entry: { repo: 'r', out: 'o.json', bareInvoke: true }, argv: ['--repo', 'r', '--out', 'o.json', '--bare-invoke'] },
    { title: 'snippets alone', entry: { repo: 'r', out: 'o.json', snippets: true }, argv: ['--repo', 'r', '--out', 'o.json', '--snippets'] },
    { title: 'tsconfig alone', entry: { repo: 'r', out: 'o.json', tsconfig: 'tt.json' }, argv: ['--repo', 'r', '--out', 'o.json', '--tsconfig', 'tt.json'] },
    { title: 'stamp alone', entry: { repo: 'r', out: 'o.json', stamp: true }, argv: ['--repo', 'r', '--out', 'o.json', '--stamp'] },
  ];

  for (const c of cases) {
    it(`config entry ≡ command line — ${c.title} (deep-equal incl. flags order)`, () => {
      const fromConfig = parseWatchConfig(configOf([c.entry]), cwd)[0]?.options;
      const cli = parseCliArgs(c.argv);
      expect(cli.kind).toBe('run');
      const fromFlags = assembleExtractOptions(
        (cli as { kind: 'run'; inputs: ExtractInputs }).inputs,
      );
      expect(fromConfig).toEqual(fromFlags);
    });
  }

  it('pins the exact historical flags composition order of cli.ts', () => {
    const options = assembleExtractOptions({
      repo: 'r',
      out: 'o.json',
      name: 'X',
      hierarchy: 'physical',
      invokeFacade: 'ipc.call',
      bareInvoke: true,
      snippets: true,
      tsconfig: 't.json',
      stamp: true,
    });
    expect(options.flags).toEqual([
      '--name', 'X',
      '--hierarchy', 'physical',
      '--invoke-facade', 'ipc.call',
      '--bare-invoke',
      '--snippets',
      '--tsconfig', 't.json',
    ]);
  });

  it('defaults are DECLARED in flags, and --repo/--out/--stamp are deliberately absent', () => {
    const options = assembleExtractOptions({ repo: 'r', out: 'o.json' });
    expect(options.flags).toEqual(['--hierarchy', 'logical', '--invoke-facade', 'transport.invoke']);
  });
});

describe('config→flags equivalence on a real repo: identical document, identical configDigest', () => {
  let repoRoot: string;
  beforeAll(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'vs-equiv-repo-'));
    writeFileSync(join(repoRoot, 'package.json'), '{"name":"tiny"}\n');
    mkdirSync(join(repoRoot, 'src'));
    writeFileSync(join(repoRoot, 'src/main.ts'), 'export const x = 1;\n');
    const git = (args: string[]): void => {
      execFileSync('git', args, { cwd: repoRoot, stdio: 'pipe', windowsHide: true });
    };
    git(['init', '--quiet']);
    git(['config', 'user.email', 't@example.com']);
    git(['config', 'user.name', 'T']);
    git(['config', 'commit.gpgsign', 'false']);
    git(['add', '-A']);
    git(['commit', '--quiet', '-m', 'tiny']);
  });
  afterAll(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it('the two spellings of one configuration produce byte-identical text', () => {
    const entry = { repo: repoRoot, out: 'data/tiny.json', name: 'Tiny' };
    const fromConfig = parseWatchConfig(configOf([entry]), cwd)[0]?.options;
    const cli = parseCliArgs(['--repo', repoRoot, '--out', 'data/tiny.json', '--name', 'Tiny']);
    const fromFlags = assembleExtractOptions((cli as { kind: 'run'; inputs: ExtractInputs }).inputs);

    const a = extract(fromFlags);
    const b = extract(fromConfig as NonNullable<typeof fromConfig>);
    expect(b.text).toBe(a.text);
    expect(b.doc.generator?.flags).toEqual(a.doc.generator?.flags);
    expect(b.doc.generator?.configDigest).toBe(a.doc.generator?.configDigest);
  });
});

describe('config validation (badConfig = 10, fail fast, name the sin)', () => {
  it('rejects invalid JSON', () => {
    expectError(() => parseWatchConfig('{nope', cwd), EXIT.badConfig, 'not valid JSON');
  });
  it('rejects a non-object root and unknown top-level keys', () => {
    expectError(() => parseWatchConfig('[1]', cwd), EXIT.badConfig);
    expectError(() => parseWatchConfig('{"repos":[],"extra":1}', cwd), EXIT.badConfig, 'extra');
  });
  it('rejects an empty or missing repos array', () => {
    expectError(() => parseWatchConfig('{"repos":[]}', cwd), EXIT.badConfig, 'non-empty');
    expectError(() => parseWatchConfig('{}', cwd), EXIT.badConfig, 'non-empty');
  });
  it('rejects an unknown entry key (typo protection)', () => {
    expectError(
      () => parseWatchConfig(configOf([{ repo: 'r', out: 'o', nmae: 'X' }]), cwd),
      EXIT.badConfig,
      'nmae',
    );
  });
  it('rejects missing repo / missing out', () => {
    expectError(() => parseWatchConfig(configOf([{ out: 'o' }]), cwd), EXIT.badConfig, 'repo is required');
    expectError(() => parseWatchConfig(configOf([{ repo: 'r' }]), cwd), EXIT.badConfig, 'out is required');
  });
  it('rejects wrong types and a bad hierarchy', () => {
    expectError(() => parseWatchConfig(configOf([{ repo: 'r', out: 'o', bareInvoke: 'yes' }]), cwd), EXIT.badConfig, 'boolean');
    expectError(() => parseWatchConfig(configOf([{ repo: 'r', out: 'o', hierarchy: 'deep' }]), cwd), EXIT.badConfig, 'hierarchy');
  });
  it('rejects a duplicate out (exact)', () => {
    expectError(
      () =>
        parseWatchConfig(
          configOf([
            { repo: 'a', out: 'data/x.json' },
            { repo: 'b', out: 'data/x.json' },
          ]),
          cwd,
        ),
      EXIT.badConfig,
      'same file',
    );
  });
  it('rejects a case-folded duplicate out under win32 semantics (A1-F2)', () => {
    expectError(
      () =>
        parseWatchConfig(
          configOf([
            { repo: 'a', out: 'data/Corpus.json' },
            { repo: 'b', out: 'data/corpus.json' },
          ]),
          cwd,
          'win32',
        ),
      EXIT.badConfig,
      'same file',
    );
  });
  it('rejects a case-folded duplicate effective name — on every platform', () => {
    expectError(
      () =>
        parseWatchConfig(
          configOf([
            { repo: 'a', out: 'data/a.json', name: 'Corpus' },
            { repo: 'b', out: 'data/b.json', name: 'corpus' },
          ]),
          cwd,
          'linux',
        ),
      EXIT.badConfig,
      'identity',
    );
  });
  it('accepts the SAME repo twice with different name/out (two configured views)', () => {
    const targets = parseWatchConfig(
      configOf([
        { repo: 'shared', out: 'data/logical.json', name: 'A' },
        { repo: 'shared', out: 'data/physical.json', name: 'B', hierarchy: 'physical' },
      ]),
      cwd,
    );
    expect(targets.map((t) => t.label)).toEqual(['A', 'B']);
  });
});

describe('--interval validation: reject, never clamp', () => {
  it('accepts an integer ≥ 100', () => {
    expect(parseIntervalMs('100')).toBe(100);
    expect(parseIntervalMs('2500')).toBe(2500);
  });
  for (const bad of ['99', '0', '-5', 'abc', '1000.5', '']) {
    it(`rejects "${bad}" with exit 1`, () => {
      expectError(() => parseIntervalMs(bad), EXIT.usage);
    });
  }
});

describe('CLI flag matrix (parseCliArgs)', () => {
  it('--config is mutually exclusive with per-repo flags', () => {
    expectError(() => parseCliArgs(['--config', 'c.json', '--repo', 'r']), EXIT.usage, 'mutually exclusive');
  });
  it('--interval without --watch is a usage error', () => {
    expectError(() => parseCliArgs(['--repo', 'r', '--out', 'o', '--interval', '500']), EXIT.usage, '--watch');
  });
  it('still requires --repo and --out without a config', () => {
    expectError(() => parseCliArgs(['--out', 'o']), EXIT.usage, '--repo is required');
    expectError(() => parseCliArgs(['--repo', 'r']), EXIT.usage, '--out is required');
  });
  it('rejects an unknown option', () => {
    expectError(() => parseCliArgs(['--frobnicate']), EXIT.usage, 'unknown option');
  });
  it('returns help without side effects', () => {
    expect(parseCliArgs(['--help'])).toEqual({ kind: 'help' });
  });
});

describe('out inside a watched repo (A1-P1-3)', () => {
  const target = (repo: string, out: string): WatchTarget => ({
    options: assembleExtractOptions({ repo, out }),
    label: repo,
  });

  it('rejects an out inside a watched repo when not ignored there', () => {
    mkdirSync(join(cwd, 'repoA'));
    expectError(
      () => assertOutsOutsideWatchedRepos([target('repoA', 'repoA/data/self.json')], cwd, () => false),
      EXIT.badConfig,
      'not git-ignored',
    );
  });

  it('accepts an out inside a watched repo when git-ignored there', () => {
    mkdirSync(join(cwd, 'repoA'));
    expect(
      capture(() =>
        assertOutsOutsideWatchedRepos([target('repoA', 'repoA/.local/self.json')], cwd, () => true),
      ),
    ).toBeUndefined();
  });

  it('does not care about an out outside every watched repo', () => {
    mkdirSync(join(cwd, 'repoA'));
    expect(
      capture(() =>
        assertOutsOutsideWatchedRepos([target('repoA', 'data/out.json')], cwd, () => false),
      ),
    ).toBeUndefined();
  });

  it('checks CROSS pairs: entry B out inside entry A repo', () => {
    mkdirSync(join(cwd, 'repoA'));
    mkdirSync(join(cwd, 'repoB'));
    const targets = [target('repoA', 'data/a.json'), target('repoB', 'repoA/data/b.json')];
    expectError(() => assertOutsOutsideWatchedRepos(targets, cwd, () => false), EXIT.badConfig);
  });

  it('works against a REAL repo and its real .gitignore', () => {
    const repoRoot = join(cwd, 'real');
    mkdirSync(repoRoot);
    writeFileSync(join(repoRoot, '.gitignore'), '.local/\n');
    writeFileSync(join(repoRoot, 'a.txt'), 'a');
    const git = (args: string[]): void => {
      execFileSync('git', args, { cwd: repoRoot, stdio: 'pipe', windowsHide: true });
    };
    git(['init', '--quiet']);
    git(['config', 'user.email', 't@example.com']);
    git(['config', 'user.name', 'T']);
    git(['config', 'commit.gpgsign', 'false']);
    git(['add', '-A']);
    git(['commit', '--quiet', '-m', 'init']);

    expect(
      capture(() => assertOutsOutsideWatchedRepos([target('real', 'real/.local/self.json')], cwd)),
    ).toBeUndefined();
    expectError(
      () => assertOutsOutsideWatchedRepos([target('real', 'real/data/self.json')], cwd),
      EXIT.badConfig,
    );
  });
});

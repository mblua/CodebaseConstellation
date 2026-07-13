// The privacy scanner (§11), which for one release only looked at three field names.
//
// README and architecture both promise that `metadata` and preserved unknown fields
// are "scanned, and absolute-path-looking values are surfaced as warnings". They were
// not: `metadata.cwd = "C:\\Users\\secret"` produced nothing at all. The mitigation
// the documentation described did not exist, which is worse than not having it —
// a user was told the app would point at the leak.
//
// Known path fields remain HARD validation: an absolute one is a rejection, not a
// warning. Free-form values are preserved verbatim and reported; they are never
// rewritten, because a document that has been silently "cleaned" cannot be trusted
// either.

import { describe, expect, it } from 'vitest';
import { importDoc } from '../../src/contract/load.ts';
import { SchemaError } from '../../src/contract/errors.ts';
import { docText, edge, node } from '../support/doc.ts';

function warningsOf(text: string): string[] {
  return importDoc(text)
    .warnings.filter((w) => w.code === 'absolute-path-in-free-form-field')
    .map((w) => w.message);
}

describe('absolute-looking values are surfaced wherever they hide', () => {
  it('warns about a Windows path in metadata — the case that produced nothing', () => {
    const text = docText(
      [node('r', 'repository', null, { metadata: { cwd: 'C:\\Users\\secret\\repo' } })],
      [],
    );
    const warnings = warningsOf(text);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('metadata.cwd');
    expect(warnings[0]).toContain('C:\\Users\\secret\\repo');

    // …and the value is PRESERVED, not scrubbed. Claiming it was clean would be a lie.
    const loaded = importDoc(text);
    expect(loaded.model.nodes[0]?.metadata?.['cwd']).toBe('C:\\Users\\secret\\repo');
  });

  it('warns about NESTED metadata, and inside arrays', () => {
    const text = docText(
      [
        node('r', 'repository', null, {
          metadata: {
            build: { outDir: '/var/lib/secrets/out' },
            searchPaths: ['src', 'D:\\other\\drive'],
          },
        }),
      ],
      [],
    );
    const warnings = warningsOf(text);
    expect(warnings).toHaveLength(2);
    expect(warnings.join(' ')).toContain('metadata.build.outDir');
    expect(warnings.join(' ')).toContain('metadata.searchPaths[1]');
  });

  it('warns about a preserved UNKNOWN field, at the root and deep inside one', () => {
    const text = JSON.stringify({
      formatVersion: '1.0',
      nodes: [node('r', 'repository', null)],
      edges: [],
      somethingFromTheFuture: { audit: { home: '/home/maria/.ssh' } },
    });
    const warnings = warningsOf(text);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('somethingFromTheFuture.audit.home');
  });

  it('warns about an absolute path in an edge metadata and in a note', () => {
    const text = docText(
      [node('r', 'repository', null), node('a', 'file', 'r'), node('b', 'file', 'r')],
      [
        edge('e', 'imports', 'a', 'b', {
          metadata: { resolvedFrom: '\\\\fileserver\\share\\lib' },
          evidence: [{ path: 'a.ts', line: 1, note: '/absolute/note' }],
        }),
      ],
    );
    const warnings = warningsOf(text);
    expect(warnings.join(' ')).toContain('resolvedFrom');
    expect(warnings.join(' ')).toContain('note');
  });

  it('warns about the POSIX ROOT itself — "/" is an absolute path', () => {
    // The first regex required a character AFTER the slash (`\/[^/]`), so `"/"` produced
    // no warning at all: the one path that is nothing BUT absolute was reported as clean.
    const text = docText([node('r', 'repository', null, { metadata: { cwd: '/' } })], []);
    const warnings = warningsOf(text);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('metadata.cwd');
  });

  it('warns about "/" nested inside metadata and inside an array', () => {
    const text = docText(
      [
        node('r', 'repository', null, {
          metadata: { build: { root: '/' }, roots: ['src', '/'] },
        }),
      ],
      [],
    );
    const warnings = warningsOf(text);
    expect(warnings).toHaveLength(2);
    expect(warnings.join(' ')).toContain('metadata.build.root');
    expect(warnings.join(' ')).toContain('metadata.roots[1]');
  });

  it('warns about a drive-RELATIVE path, which resolves against a per-drive cwd', () => {
    const text = docText([node('r', 'repository', null, { metadata: { out: 'C:out' } })], []);
    expect(warningsOf(text)).toHaveLength(1);
  });

  it('does NOT warn about ordinary relative values', () => {
    const text = docText(
      [
        node('r', 'repository', null, {
          metadata: {
            specifier: './styles.css',
            alias: '@shared/util.ts',
            version: '0.10.0',
            ecosystem: 'npm',
            note: 'src/shared/ipc.ts:105',
          },
        }),
      ],
      [],
    );
    expect(warningsOf(text)).toEqual([]);
  });
});

describe('known path fields are still a HARD rejection, not a warning', () => {
  it('refuses an absolute node.path rather than warning about it', () => {
    const text = docText(
      [node('r', 'repository', null), node('a', 'file', 'r', { path: 'C:/Users/secret/a.ts' })],
      [],
    );
    expect(() => importDoc(text)).toThrow(SchemaError);
  });

  it('refuses an absolute Evidence.path rather than warning about it', () => {
    const text = docText(
      [node('r', 'repository', null, { evidence: [{ path: '/etc/shadow' }] })],
      [],
    );
    expect(() => importDoc(text)).toThrow(SchemaError);
  });
});

describe('the committed dataset is clean by this stricter standard', () => {
  it('carries no absolute-looking string anywhere at all', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const text = readFileSync(
      fileURLToPath(new URL('../../data/agentscommander.json', import.meta.url)),
      'utf8',
    );
    const loaded = importDoc(text);
    const leaks = loaded.warnings.filter((w) => w.code === 'absolute-path-in-free-form-field');
    expect(leaks.map((w) => w.message)).toEqual([]);
  });
});

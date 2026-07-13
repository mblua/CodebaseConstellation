import { describe, expect, it } from 'vitest';
import { autosaveMatches, autosaveViewText, parseAutosaveView } from '../../src/contract/autosaveView.ts';
import {
  isSingleJsonSegment,
  sanitizeFileStem,
  timestampedJsonName,
  utcTimestamp,
  withCollisionSuffix,
} from '../../src/contract/filename.ts';
import { SchemaError } from '../../src/contract/errors.ts';
import {
  makeProjectManifest,
  parseProjectManifest,
  projectManifestText,
  validateProjectName,
} from '../../src/contract/projectManifest.ts';
import { computeDocRevision } from '../../src/contract/revision.ts';
import { sha256 } from '../../src/contract/sha256.ts';
import { sampleDoc } from '../support/doc.ts';
import { acceptedJsonSegments, rejectedJsonSegments } from '../support/filenamePolicy.ts';

describe('pure SHA-256 and document revisions', () => {
  it('matches known SHA-256 vectors', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hashes canonical JSON semantics, not bytes or key order', () => {
    const a = '{ "b": 2, "a": 1 }\r\n';
    const b = '{\n  "a": 1,\n  "b": 2\n}\n';
    expect(computeDocRevision(a)).toBe(computeDocRevision(b));
    expect(computeDocRevision('{ "a": 1 }')).not.toBe(computeDocRevision('{ "a": 2 }'));
  });
});

describe('generated project filenames', () => {
  it('uses UTC timestamps and safe JSON segments', () => {
    const d = new Date('2026-07-12T15:35:29.100Z');
    expect(utcTimestamp(d)).toBe('20260712-153529');
    expect(timestampedJsonName('CON.txt', d)).toBe('20260712-153529_CON.txt-project.json');
    expect(timestampedJsonName(' a/..\\b:\u202ec?.json ', d)).toBe('20260712-153529_a..bc.json.json');
  });

  it('validates single JSON segments and collision suffixes', () => {
    for (const name of acceptedJsonSegments) expect(isSingleJsonSegment(name), name).toBe(true);
    for (const name of rejectedJsonSegments) expect(isSingleJsonSegment(name), name).toBe(false);
    expect(sanitizeFileStem('   ')).toBe('visual-specs');
    expect(withCollisionSuffix('20260712-153529_project.json', 3)).toBe(
      '20260712-153529_project-3.json',
    );
  });

  it.each(['\u200b', '\u2060', '\ufeff', '\u202e'])(
    'removes Unicode format control %j from generated and accepted names',
    (control) => {
      expect(sanitizeFileStem(`vis${control}ual`)).toBe('visual');
      expect(isSingleJsonSegment(`20260712-153529_vis${control}ual.json`)).toBe(false);
    },
  );
});

describe('project manifest', () => {
  it('round-trips exact v1 manifest fields and preserves unknown fields', () => {
    const currentText = sampleDoc();
    const manifest = makeProjectManifest({
      id: 'project-1',
      name: 'Agents Commander',
      docId: 'doc-1',
      revision: computeDocRevision(currentText),
      nowUtc: '2026-07-12T15:35:29.000Z',
    });
    const raw = JSON.parse(projectManifestText(manifest)) as Record<string, unknown>;
    raw['localNote'] = 'preserved';
    (raw['project'] as Record<string, unknown>)['projectNote'] = { nested: true };
    (raw['current'] as Record<string, unknown>)['currentNote'] = ['keep'];
    (raw['files'] as Record<string, unknown>)['filesNote'] = 'fixed destinations only';
    (raw['migration'] as Record<string, unknown>)['migrationNote'] = 7;
    const parsed = parseProjectManifest(JSON.stringify(raw));
    expect(parsed.manifest.files).toEqual({
      current: 'data/current.json',
      autosaveView: 'data/autosave-view.json',
    });

    const written = JSON.parse(projectManifestText(parsed.manifest, parsed.raw)) as Record<string, unknown>;
    expect(written['localNote']).toBe('preserved');
    expect((written['project'] as Record<string, unknown>)['projectNote']).toEqual({ nested: true });
    expect((written['current'] as Record<string, unknown>)['currentNote']).toEqual(['keep']);
    expect((written['files'] as Record<string, unknown>)['filesNote']).toBe('fixed destinations only');
    expect((written['migration'] as Record<string, unknown>)['migrationNote']).toBe(7);
  });

  it('rejects non-canonical local metadata before it can drive I/O', () => {
    const manifest = JSON.parse(
      projectManifestText(
        makeProjectManifest({
          id: 'project-1',
          name: 'Agents Commander',
          docId: 'doc-1',
          revision: computeDocRevision(sampleDoc()),
          nowUtc: '2026-07-12T15:35:29.000Z',
        }),
      ),
    ) as Record<string, unknown>;
    manifest['files'] = { current: '../outside.json', autosaveView: 'data/autosave-view.json' };
    expect(() => parseProjectManifest(JSON.stringify(manifest))).toThrow(SchemaError);
    expect(() => validateProjectName(' '.repeat(3))).toThrow(SchemaError);
  });
});

describe('autosave view', () => {
  it('stores only a view overlay and matches by semantic base revision', () => {
    const revision = computeDocRevision(sampleDoc());
    const text = autosaveViewText({
      schema: 'visual-specs.autosave-view',
      formatVersion: '1.0',
      projectId: 'project-1',
      docId: 'doc-1',
      baseRevision: revision,
      savedAtUtc: '2026-07-12T15:35:29.000Z',
      view: {
        expanded: ['repo'],
        positions: { repo: { x: 1, y: 2, pinned: true } },
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    });
    expect(text).not.toContain('"nodes"');
    expect(text).not.toContain('"edges"');
    const parsed = parseAutosaveView(text);
    expect(autosaveMatches(parsed, { projectId: 'project-1', docId: 'doc-1', revision })).toBe(true);
    expect(
      autosaveMatches(parsed, {
        projectId: 'project-1',
        docId: 'doc-1',
        revision: computeDocRevision('{ "formatVersion": "1.0", "nodes": [], "edges": [] }'),
      }),
    ).toBe(false);
  });
});

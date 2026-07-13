import { expect, test } from '@playwright/test';

test('FsaProjectStore enforces create, collision, fresh backup and ignored-directory invariants on OPFS', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const storeUrl = '/src/adapters/filesystem/FsaProjectStore.ts';
    const manifestUrl = '/src/contract/projectManifest.ts';
    const revisionUrl = '/src/contract/revision.ts';
    const [{ FsaProjectStore }, manifestMod, revisionMod] = await Promise.all([
      import(storeUrl),
      import(manifestUrl),
      import(revisionUrl),
    ]);
    const {
      makeProjectManifest,
      projectManifestText,
      parseProjectManifest,
      withProjectUpdate,
    } = manifestMod as typeof import('../../src/contract/projectManifest.ts');
    const { computeDocRevision } = revisionMod as typeof import('../../src/contract/revision.ts');

    const opfs = await navigator.storage.getDirectory();
    const rootName = `visual-specs-opfs-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const root = await opfs.getDirectoryHandle(rootName, { create: true });
    const globals = globalThis as unknown as Record<string, unknown>;
    const previousPicker = globals['showDirectoryPicker'];
    const order: string[] = [];
    globals['showDirectoryPicker'] = async () => {
      order.push('picker');
      return root;
    };
    try {
      const currentText = JSON.stringify({
        formatVersion: '1.0',
        nodes: [{ id: 'repo', kind: 'repository', label: 'repo', parentId: null, path: '' }],
        edges: [],
      });
      const manifest = makeProjectManifest({
        id: 'project-1',
        name: 'OPFS Project',
        docId: 'doc-1',
        revision: computeDocRevision(currentText),
        nowUtc: '2026-07-12T15:35:29.000Z',
      });
      const manifestText = projectManifestText(manifest);
      const store = new FsaProjectStore({
        maxBytes: 1024,
        clock: () => new Date('2026-07-12T15:35:29.000Z'),
        implicitWritePermission: true,
      });

      const created = await store.createProject(() => {
        order.push('prepare');
        return {
          manifestText,
          currentText,
          gitignoreText: '/data/autosave-view.json\n/exports/\n/backups/\n',
          gitattributesText: '* text eol=lf\n',
        };
      });
      const projectDir = await root.getDirectoryHandle('.visual-specs');
      await projectDir.getFileHandle('project.json');
      await projectDir.getFileHandle('.gitattributes');
      await projectDir.getFileHandle('.gitignore');
      const dataDir = await projectDir.getDirectoryHandle('data');
      await dataDir.getFileHandle('current.json');
      await (await projectDir.getDirectoryHandle('imports')).getFileHandle('.gitkeep');
      await projectDir.getDirectoryHandle('exports');
      await projectDir.getDirectoryHandle('backups');

      let secondPrepareCalled = false;
      let nonDestructiveError = '';
      const secondStore = new FsaProjectStore({ maxBytes: 1024, implicitWritePermission: true });
      try {
        await secondStore.createProject(() => {
          secondPrepareCalled = true;
          throw new Error('must not prepare');
        });
      } catch (err) {
        nonDestructiveError = err instanceof Error ? err.message : String(err);
      }
      const afterSecondCreate = await (
        await (await dataDir.getFileHandle('current.json')).getFile()
      ).text();

      const opened = await store.openProjectRead();
      const edited = await store.enableEditing(opened.ref);
      const first = await store.writeImport(edited.ref, '20260712-153529_import.json', currentText);
      const second = await store.writeImport(edited.ref, '20260712-153529_import.json', currentText);
      const imports = await store.listStoredDocs(edited.ref, 'imports');

      await projectDir.removeEntry('exports', { recursive: true });
      await projectDir.removeEntry('backups', { recursive: true });
      await store.exportPortable({
        project: edited.ref,
        suggestedName: '20260712-153529_OPFS-Project.json',
        text: currentText,
      });

      const nextText = JSON.stringify({
        formatVersion: '1.0',
        nodes: [{ id: 'repo', kind: 'repository', label: 'changed', parentId: null, path: '' }],
        edges: [],
      });
      const nowUtc = '2026-07-12T15:36:00.000Z';
      const nextManifest = withProjectUpdate(manifest, {
        revision: computeDocRevision(nextText),
        committedAtUtc: nowUtc,
        updatedAtUtc: nowUtc,
      });
      let freshCurrentRead = '';
      await store.commitCurrent({
        ref: edited.ref,
        prepare: (actual: { manifestText: string; currentText: string }) => {
          freshCurrentRead = actual.currentText;
          return {
            manifestText: projectManifestText(nextManifest),
            currentText: nextText,
            clearAutosaveView: true,
          };
        },
      });
      const finalText = JSON.stringify({
        formatVersion: '1.0',
        nodes: [{ id: 'repo', kind: 'repository', label: 'final', parentId: null, path: '' }],
        edges: [],
      });
      const finalManifest = withProjectUpdate(nextManifest, {
        revision: computeDocRevision(finalText),
        committedAtUtc: '2026-07-12T15:37:00.000Z',
        updatedAtUtc: '2026-07-12T15:37:00.000Z',
      });
      let secondFreshCurrentRead = '';
      await store.commitCurrent({
        ref: edited.ref,
        prepare: (actual: { manifestText: string; currentText: string }) => {
          secondFreshCurrentRead = actual.currentText;
          return {
            manifestText: projectManifestText(finalManifest),
            currentText: finalText,
            clearAutosaveView: true,
          };
        },
      });
      const exportCopies = await store.listStoredDocs(edited.ref, 'exports');
      const backupDir = await projectDir.getDirectoryHandle('backups');
      const backupEntries: { name: string; text: string }[] = [];
      for await (const handle of backupDir.values()) {
        if (handle.kind !== 'file') continue;
        backupEntries.push({
          name: handle.name,
          text: await (await (handle as FileSystemFileHandle).getFile()).text(),
        });
      }
      const currentAfter = await (await dataDir.getFileHandle('current.json')).getFile();
      const manifestAfter = parseProjectManifest(
        await (await (await projectDir.getFileHandle('project.json')).getFile()).text(),
      ).manifest;

      const hugeName = '20260712-153529_huge.json';
      const huge = await (await projectDir.getDirectoryHandle('imports')).getFileHandle(hugeName, {
        create: true,
      });
      const writable = await huge.createWritable();
      await writable.write('x'.repeat(2048));
      await writable.close();
      let oversized = '';
      try {
        await store.readStoredDoc(edited.ref, {
          id: `${edited.ref.id}:imports:${hugeName}`,
          area: 'imports',
          displayName: hugeName,
          fileName: hugeName,
        });
      } catch (err) {
        oversized = err instanceof Error ? err.message : String(err);
      }
      await projectDir.removeEntry('imports', { recursive: true });
      const importsAfterRemoval = await store.listStoredDocs(edited.ref, 'imports');

      return {
        order: order.slice(0, 2),
        createdAccess: created.access,
        openedAccess: opened.access,
        editedAccess: edited.access,
        first: first.fileName,
        second: second.fileName,
        imports: imports.map((i: { fileName: string }) => i.fileName),
        exports: exportCopies.map((i: { fileName: string }) => i.fileName),
        backupEntries,
        freshCurrentRead,
        secondFreshCurrentRead,
        currentAfter: await currentAfter.text(),
        manifestRevision: manifestAfter.current.revision,
        expectedRevision: computeDocRevision(finalText),
        secondPrepareCalled,
        nonDestructiveError,
        afterSecondCreate,
        oversized,
        importsAfterRemoval: importsAfterRemoval.map((entry: { fileName: string }) => entry.fileName),
      };
    } finally {
      if (previousPicker === undefined) delete globals['showDirectoryPicker'];
      else globals['showDirectoryPicker'] = previousPicker;
      await opfs.removeEntry(rootName, { recursive: true });
    }
  });

  expect(result.order).toEqual(['picker', 'prepare']);
  expect(result.createdAccess).toBe('readwrite');
  expect(result.openedAccess).toBe('readonly');
  expect(result.editedAccess).toBe('readwrite');
  expect(result.first).toBe('20260712-153529_import.json');
  expect(result.second).toBe('20260712-153529_import-2.json');
  expect(result.imports).toEqual(['20260712-153529_import-2.json', '20260712-153529_import.json']);
  expect(result.exports).toEqual(['20260712-153529_OPFS-Project.json']);
  const backupByName = new Map(result.backupEntries.map((entry) => [entry.name, entry.text]));
  expect([...backupByName.keys()].sort()).toEqual(
    ['20260712-153529_current-2.json', '20260712-153529_current.json'].sort(),
  );
  expect(backupByName.get('20260712-153529_current.json')).toBe(result.freshCurrentRead);
  expect(backupByName.get('20260712-153529_current-2.json')).toBe(result.secondFreshCurrentRead);
  expect(result.freshCurrentRead).toBe(result.afterSecondCreate);
  expect(result.secondFreshCurrentRead).not.toBe(result.freshCurrentRead);
  expect(result.currentAfter).not.toBe(result.secondFreshCurrentRead);
  expect(result.manifestRevision).toBe(result.expectedRevision);
  expect(result.secondPrepareCalled).toBe(false);
  expect(result.nonDestructiveError).toMatch(
    /already exists.*if its metadata is valid.*repair or migrate it manually/i,
  );
  expect(result.oversized).toContain('byte cap');
  expect(result.importsAfterRemoval).toEqual([]);
});

test('Create preserves unvalidated existing metadata without writes or preparation', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const storeUrl = '/src/adapters/filesystem/FsaProjectStore.ts';
    const { FsaProjectStore } = await import(storeUrl);
    const metadataBytes = '{not json';
    let writeCalls = 0;
    let prepareCalls = 0;

    const metadata = {
      kind: 'file' as const,
      name: 'project.json',
      getFile: async () => new File([metadataBytes], 'project.json'),
      createWritable: async () => {
        writeCalls += 1;
        throw new Error('Create must not open existing metadata for writing.');
      },
    } as unknown as FileSystemFileHandle;
    const projectDir = {
      kind: 'directory' as const,
      name: '.visual-specs',
      getFileHandle: async (name: string, options?: { create?: boolean }) => {
        if (options?.create === true) writeCalls += 1;
        if (name === 'project.json') return metadata;
        throw new DOMException('missing', 'NotFoundError');
      },
      getDirectoryHandle: async (_name: string, options?: { create?: boolean }) => {
        if (options?.create === true) writeCalls += 1;
        throw new DOMException('missing', 'NotFoundError');
      },
      removeEntry: async () => {
        writeCalls += 1;
      },
      async *keys() {
        yield 'project.json';
      },
      async *values() {
        yield metadata;
      },
    } as unknown as FileSystemDirectoryHandle;
    const root = {
      kind: 'directory' as const,
      name: 'invalid-metadata-root',
      getDirectoryHandle: async (name: string, options?: { create?: boolean }) => {
        if (options?.create === true) writeCalls += 1;
        if (name === '.visual-specs') return projectDir;
        throw new DOMException('missing', 'NotFoundError');
      },
    } as unknown as FileSystemDirectoryHandle;
    const globals = globalThis as unknown as Record<string, unknown>;
    const previous = globals['showDirectoryPicker'];
    globals['showDirectoryPicker'] = async () => root;
    let error = '';
    try {
      const store = new FsaProjectStore({ maxBytes: 1024, implicitWritePermission: true });
      await store.createProject(() => {
        prepareCalls += 1;
        throw new Error('prepare must not run');
      });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      if (previous === undefined) delete globals['showDirectoryPicker'];
      else globals['showDirectoryPicker'] = previous;
    }
    return {
      bytesAfter: await (await metadata.getFile()).text(),
      error,
      prepareCalls,
      writeCalls,
    };
  });

  expect(result.bytesAfter).toBe('{not json');
  expect(result.prepareCalls).toBe(0);
  expect(result.writeCalls).toBe(0);
  expect(result.error).toMatch(
    /no files were written.*if its metadata is valid.*repair or migrate it manually/i,
  );
});

test('real FsaProjectStore gates replacement on backup close order and ignores only autosave cleanup failure', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const storeUrl = '/src/adapters/filesystem/FsaProjectStore.ts';
    const manifestUrl = '/src/contract/projectManifest.ts';
    const revisionUrl = '/src/contract/revision.ts';
    const [{ FsaProjectStore }, manifestMod, revisionMod] = await Promise.all([
      import(storeUrl),
      import(manifestUrl),
      import(revisionUrl),
    ]);
    const { makeProjectManifest, projectManifestText, withProjectUpdate } =
      manifestMod as typeof import('../../src/contract/projectManifest.ts');
    const { computeDocRevision } = revisionMod as typeof import('../../src/contract/revision.ts');
    type Scenario = 'success' | 'backup-create' | 'backup-write' | 'backup-close' | 'cleanup';
    type Stage = 'backup' | 'current' | 'project';
    interface ScenarioResult {
      resolved: boolean;
      error: string;
      events: string[];
      backupText: string | null;
      currentText: string;
      manifestText: string;
      autosaveExists: boolean;
    }

    const beforeCurrent = JSON.stringify({
      formatVersion: '1.0',
      nodes: [{ id: 'before', kind: 'repository', label: 'before', parentId: null, path: '' }],
      edges: [],
    });
    const afterCurrent = JSON.stringify({
      formatVersion: '1.0',
      nodes: [{ id: 'after', kind: 'repository', label: 'after', parentId: null, path: '' }],
      edges: [],
    });
    const beforeManifest = makeProjectManifest({
      id: 'durability-project',
      name: 'Durability',
      docId: 'durability-doc',
      revision: computeDocRevision(beforeCurrent),
      nowUtc: '2026-07-12T15:35:29.000Z',
    });
    const beforeManifestText = projectManifestText(beforeManifest);
    const afterManifestText = projectManifestText(
      withProjectUpdate(beforeManifest, {
        revision: computeDocRevision(afterCurrent),
        committedAtUtc: '2026-07-12T15:36:00.000Z',
        updatedAtUtc: '2026-07-12T15:36:00.000Z',
      }),
    );
    const globals = globalThis as unknown as Record<string, unknown>;
    const previous = globals['showDirectoryPicker'];

    const run = async (scenario: Scenario): Promise<ScenarioResult> => {
      const events: string[] = [];
      const bytes = { current: beforeCurrent, project: beforeManifestText };
      let backupText: string | null = null;
      let autosaveExists = true;

      const writable = (
        stage: Stage,
        commit: (text: string) => void,
      ): FileSystemWritableFileStream => {
        let pending = '';
        return {
          write: async (chunk: FileSystemWriteChunkType) => {
            events.push(`${stage}.write`);
            if (scenario === 'backup-write' && stage === 'backup') {
              throw new Error('backup write failed');
            }
            if (typeof chunk !== 'string') throw new Error('instrumented test expects text writes');
            pending = chunk;
          },
          close: async () => {
            events.push(`${stage}.close`);
            if (scenario === 'backup-close' && stage === 'backup') {
              throw new Error('backup close failed');
            }
            commit(pending);
          },
        } as unknown as FileSystemWritableFileStream;
      };
      const textHandle = (
        stage: 'current' | 'project',
        name: string,
      ): FileSystemFileHandle =>
        ({
          kind: 'file' as const,
          name,
          getFile: async () => new File([bytes[stage]], name, { type: 'application/json' }),
          createWritable: async () => {
            events.push(`${stage}.createWritable`);
            return writable(stage, (text) => {
              bytes[stage] = text;
            });
          },
        }) as unknown as FileSystemFileHandle;
      const currentHandle = textHandle('current', 'current.json');
      const projectHandle = textHandle('project', 'project.json');
      const autosaveHandle = {
        kind: 'file' as const,
        name: 'autosave-view.json',
        getFile: async () => new File(['{"stale":true}'], 'autosave-view.json'),
      } as unknown as FileSystemFileHandle;
      const backupHandle = {
        kind: 'file' as const,
        name: '20260712-153529_current.json',
        getFile: async () => new File([backupText ?? ''], '20260712-153529_current.json'),
        createWritable: async () => {
          events.push('backup.createWritable');
          if (scenario === 'backup-create') throw new Error('backup createWritable failed');
          return writable('backup', (text) => {
            backupText = text;
          });
        },
      } as FileSystemFileHandle;
      const dataDir = {
        kind: 'directory' as const,
        name: 'data',
        getFileHandle: async (name: string) => {
          if (name === 'current.json') return currentHandle;
          if (name === 'autosave-view.json' && autosaveExists) return autosaveHandle;
          throw new DOMException('missing', 'NotFoundError');
        },
        removeEntry: async (name: string) => {
          events.push(`${name}.remove`);
          if (scenario === 'cleanup') throw new Error('autosave cleanup failed');
          if (name === 'autosave-view.json' && autosaveExists) {
            autosaveExists = false;
            return;
          }
          throw new DOMException('missing', 'NotFoundError');
        },
      } as unknown as FileSystemDirectoryHandle;
      const backupsDir = {
        kind: 'directory' as const,
        name: 'backups',
        getFileHandle: async (_name: string, options?: { create?: boolean }) => {
          if (options?.create === true || backupText !== null) return backupHandle;
          throw new DOMException('missing', 'NotFoundError');
        },
      } as unknown as FileSystemDirectoryHandle;
      const projectDir = {
        kind: 'directory' as const,
        name: '.visual-specs',
        getDirectoryHandle: async (name: string) => {
          if (name === 'data') return dataDir;
          if (name === 'backups') return backupsDir;
          throw new DOMException('missing', 'NotFoundError');
        },
        getFileHandle: async (name: string) => {
          if (name === 'project.json') return projectHandle;
          throw new DOMException('missing', 'NotFoundError');
        },
      } as unknown as FileSystemDirectoryHandle;
      const root = {
        kind: 'directory' as const,
        name: 'durability-root',
        getDirectoryHandle: async (name: string) => {
          if (name === '.visual-specs') return projectDir;
          throw new DOMException('missing', 'NotFoundError');
        },
        requestPermission: async () => 'granted' as PermissionState,
        resolve: async () => ['.visual-specs'],
      } as unknown as FileSystemDirectoryHandle;
      globals['showDirectoryPicker'] = async () => root;
      const store = new FsaProjectStore({
        maxBytes: 4096,
        clock: () => new Date('2026-07-12T15:35:29.000Z'),
      });
      let resolved = false;
      let error = '';
      try {
        const opened = await store.openProjectRead();
        const edited = await store.enableEditing(opened.ref);
        await store.commitCurrent({
          ref: edited.ref,
          prepare: () => ({
            currentText: afterCurrent,
            manifestText: afterManifestText,
            clearAutosaveView: true,
          }),
        });
        resolved = true;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      return {
        resolved,
        error,
        events,
        backupText,
        currentText: bytes.current,
        manifestText: bytes.project,
        autosaveExists,
      };
    };

    try {
      return {
        beforeCurrent,
        beforeManifestText,
        afterCurrent,
        afterManifestText,
        success: await run('success'),
        backupCreate: await run('backup-create'),
        backupWrite: await run('backup-write'),
        backupClose: await run('backup-close'),
        cleanup: await run('cleanup'),
      };
    } finally {
      if (previous === undefined) delete globals['showDirectoryPicker'];
      else globals['showDirectoryPicker'] = previous;
    }
  });

  expect(result.success).toMatchObject({
    resolved: true,
    error: '',
    backupText: result.beforeCurrent,
    currentText: result.afterCurrent,
    manifestText: result.afterManifestText,
    autosaveExists: false,
  });
  const backupClose = result.success.events.indexOf('backup.close');
  const currentClose = result.success.events.indexOf('current.close');
  const projectClose = result.success.events.indexOf('project.close');
  expect(backupClose).toBeGreaterThanOrEqual(0);
  expect(currentClose).toBeGreaterThan(backupClose);
  expect(projectClose).toBeGreaterThan(currentClose);

  for (const failed of [result.backupCreate, result.backupWrite, result.backupClose]) {
    expect(failed.resolved).toBe(false);
    expect(failed.error).toMatch(/backup (?:createWritable|write|close) failed/);
    expect(failed.currentText).toBe(result.beforeCurrent);
    expect(failed.manifestText).toBe(result.beforeManifestText);
    expect(failed.events).not.toContain('current.write');
    expect(failed.events).not.toContain('current.close');
    expect(failed.events).not.toContain('project.write');
    expect(failed.events).not.toContain('project.close');
  }

  expect(result.cleanup).toMatchObject({
    resolved: true,
    error: '',
    backupText: result.beforeCurrent,
    currentText: result.afterCurrent,
    manifestText: result.afterManifestText,
    autosaveExists: true,
  });
  expect(result.cleanup.events.indexOf('autosave-view.json.remove')).toBeGreaterThan(
    result.cleanup.events.indexOf('project.close'),
  );
});

test('OPFS implicit write permission is explicit rather than a production fail-open', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const storeUrl = '/src/adapters/filesystem/FsaProjectStore.ts';
    const manifestUrl = '/src/contract/projectManifest.ts';
    const revisionUrl = '/src/contract/revision.ts';
    const [{ FsaProjectStore }, manifestMod, revisionMod] = await Promise.all([
      import(storeUrl),
      import(manifestUrl),
      import(revisionUrl),
    ]);
    const { makeProjectManifest, projectManifestText } =
      manifestMod as typeof import('../../src/contract/projectManifest.ts');
    const { computeDocRevision } = revisionMod as typeof import('../../src/contract/revision.ts');
    const opfs = await navigator.storage.getDirectory();
    const rootName = `visual-specs-permission-${Date.now()}`;
    const root = await opfs.getDirectoryHandle(rootName, { create: true });
    const globals = globalThis as unknown as Record<string, unknown>;
    const previous = globals['showDirectoryPicker'];
    globals['showDirectoryPicker'] = async () => root;
    try {
      const text = '{"formatVersion":"1.0","nodes":[],"edges":[]}';
      const manifestText = projectManifestText(
        makeProjectManifest({
          id: 'p',
          name: 'Permission',
          docId: 'd',
          revision: computeDocRevision(text),
          nowUtc: '2026-07-12T15:35:29.000Z',
        }),
      );
      const creator = new FsaProjectStore({ maxBytes: 1024, implicitWritePermission: true });
      await creator.createProject(() => ({
        manifestText,
        currentText: text,
        gitignoreText: '',
        gitattributesText: '',
      }));
      const rootWithoutPermission = {
        kind: 'directory' as const,
        name: root.name,
        getDirectoryHandle: root.getDirectoryHandle.bind(root),
        getFileHandle: root.getFileHandle.bind(root),
        removeEntry: root.removeEntry.bind(root),
        keys: root.keys.bind(root),
        values: root.values.bind(root),
        resolve: root.resolve?.bind(root),
      };
      globals['showDirectoryPicker'] = async () => rootWithoutPermission;
      const strict = new FsaProjectStore({ maxBytes: 1024 });
      const opened = await strict.openProjectRead();
      let strictError = '';
      try {
        await strict.enableEditing(opened.ref);
      } catch (err) {
        strictError = err instanceof Error ? err.message : String(err);
      }
      const explicit = new FsaProjectStore({ maxBytes: 1024, implicitWritePermission: true });
      const openedExplicit = await explicit.openProjectRead();
      const edited = await explicit.enableEditing(openedExplicit.ref);
      return { strictError, explicitAccess: edited.access };
    } finally {
      if (previous === undefined) delete globals['showDirectoryPicker'];
      else globals['showDirectoryPicker'] = previous;
      await opfs.removeEntry(rootName, { recursive: true });
    }
  });
  expect(result.strictError).toMatch(/cannot request write permission/i);
  expect(result.explicitAccess).toBe('readwrite');
});

test('manifest/current/autosave/import size preflight happens before File.text()', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const storeUrl = '/src/adapters/filesystem/FsaProjectStore.ts';
    const manifestUrl = '/src/contract/projectManifest.ts';
    const revisionUrl = '/src/contract/revision.ts';
    const [{ FsaProjectStore }, manifestMod, revisionMod] = await Promise.all([
      import(storeUrl),
      import(manifestUrl),
      import(revisionUrl),
    ]);
    const { makeProjectManifest, projectManifestText } =
      manifestMod as typeof import('../../src/contract/projectManifest.ts');
    const { computeDocRevision } = revisionMod as typeof import('../../src/contract/revision.ts');
    const currentText = '{"formatVersion":"1.0","nodes":[],"edges":[]}';
    const manifestText = projectManifestText(
      makeProjectManifest({
        id: 'p',
        name: 'Preflight',
        docId: 'd',
        revision: computeDocRevision(currentText),
        nowUtc: '2026-07-12T15:35:29.000Z',
      }),
    );
    const globals = globalThis as unknown as Record<string, unknown>;
    const previous = globals['showDirectoryPicker'];

    const run = async (oversized: 'manifest' | 'current' | 'autosave' | 'import') => {
      const calls: Record<string, number> = { manifest: 0, current: 0, autosave: 0, import: 0 };
      const fileHandle = (key: keyof typeof calls, name: string, text: string) => ({
        kind: 'file' as const,
        name,
        getFile: async () => ({
          name,
          size: key === oversized ? 4097 : new TextEncoder().encode(text).byteLength,
          text: async () => {
            calls[key] = (calls[key] ?? 0) + 1;
            return text;
          },
        }),
      });
      const files = {
        manifest: fileHandle('manifest', 'project.json', manifestText),
        current: fileHandle('current', 'current.json', currentText),
        autosave: fileHandle('autosave', 'autosave-view.json', '{}'),
        import: fileHandle('import', '20260712-153529_import.json', currentText),
      };
      const data = {
        kind: 'directory' as const,
        name: 'data',
        getFileHandle: async (name: string) => {
          if (name === 'current.json') return files.current;
          if (name === 'autosave-view.json') {
            if (oversized === 'autosave') return files.autosave;
            throw new DOMException('missing', 'NotFoundError');
          }
          throw new DOMException('missing', 'NotFoundError');
        },
      };
      const imports = {
        kind: 'directory' as const,
        name: 'imports',
        getFileHandle: async (name: string) => {
          if (name === files.import.name) return files.import;
          throw new DOMException('missing', 'NotFoundError');
        },
      };
      const project = {
        kind: 'directory' as const,
        name: '.visual-specs',
        getDirectoryHandle: async (name: string) => {
          if (name === 'data') return data;
          if (name === 'imports') return imports;
          throw new DOMException('missing', 'NotFoundError');
        },
        getFileHandle: async (name: string) => {
          if (name === 'project.json') return files.manifest;
          throw new DOMException('missing', 'NotFoundError');
        },
      };
      const root = {
        kind: 'directory' as const,
        name: 'root',
        getDirectoryHandle: async (name: string) => {
          if (name === '.visual-specs') return project;
          throw new DOMException('missing', 'NotFoundError');
        },
        resolve: async () => ['.visual-specs'],
      };
      globals['showDirectoryPicker'] = async () => root;
      const store = new FsaProjectStore({ maxBytes: 4096 });
      try {
        const opened = await store.openProjectRead();
        if (oversized === 'import') {
          await store.readStoredDoc(opened.ref, {
            id: `${opened.ref.id}:imports:${files.import.name}`,
            area: 'imports',
            displayName: files.import.name,
            fileName: files.import.name,
          });
        }
      } catch {
        // Every case intentionally rejects at its oversized target.
      }
      return calls;
    };

    try {
      return {
        manifest: await run('manifest'),
        current: await run('current'),
        autosave: await run('autosave'),
        import: await run('import'),
      };
    } finally {
      if (previous === undefined) delete globals['showDirectoryPicker'];
      else globals['showDirectoryPicker'] = previous;
    }
  });

  expect(result.manifest).toEqual({ manifest: 0, current: 0, autosave: 0, import: 0 });
  expect(result.current).toEqual({ manifest: 1, current: 0, autosave: 0, import: 0 });
  expect(result.autosave).toEqual({ manifest: 1, current: 1, autosave: 0, import: 0 });
  expect(result.import).toEqual({ manifest: 1, current: 1, autosave: 0, import: 0 });
});

test('no-project export uses Save Picker when present', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const storeUrl = '/src/adapters/filesystem/FsaProjectStore.ts';
    const { FsaProjectStore } = await import(storeUrl);
    const opfs = await navigator.storage.getDirectory();
    const fileName = `visual-specs-save-${Date.now()}.json`;
    const handle = await opfs.getFileHandle(fileName, { create: true });
    const globals = globalThis as unknown as Record<string, unknown>;
    const previous = globals['showSaveFilePicker'];
    globals['showSaveFilePicker'] = async () => handle;
    try {
      const store = new FsaProjectStore({ maxBytes: 1024 });
      const exported = await store.exportPortable({
        project: null,
        suggestedName: '20260712-153529_Save.json',
        text: '{"ok":true}',
      });
      const text = await (await handle.getFile()).text();
      return { exported, text };
    } finally {
      if (previous === undefined) delete globals['showSaveFilePicker'];
      else globals['showSaveFilePicker'] = previous;
      await opfs.removeEntry(fileName);
    }
  });
  expect(result.exported.mode).toBe('save-picker');
  expect(result.text).toBe('{"ok":true}');
});

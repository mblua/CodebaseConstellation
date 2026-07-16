// Follow-file auto-reload over the REAL FsaProjectStore and REAL OPFS handles,
// driven through the real UI (plan/9-follow-file-reload.md, smoke lane).
//
// The picker is stubbed to hand back an OPFS file handle — the projectUi.spec.ts
// precedent — so the poll loop, hashing, and reload path run unmodified while the
// test rewrites the file underneath them. Headless Chromium has no permission
// prompt UI, so N successful unprompted re-reads ARE the no-re-prompt evidence.

import { expect, test, type Page } from '@playwright/test';
import { docText, edge, node, sampleDoc } from '../support/doc.ts';

const FOLLOWED = 'followed.json';

function docVariant(marker: string): string {
  return docText(
    [
      node('repo', 'repository', null, { path: '' }),
      node('pkg-a', 'package', 'repo', { path: 'a' }),
      node('pkg-b', 'package', 'repo', { path: 'b' }),
      node(marker, 'package', 'repo', { path: marker }),
    ],
    [edge('e1', 'imports', 'pkg-a', 'pkg-b')],
  );
}

function docWithoutPkgB(): string {
  return docText(
    [
      node('repo', 'repository', null, { path: '' }),
      node('pkg-a', 'package', 'repo', { path: 'a' }),
    ],
    [],
  );
}

test('picker-opened dataset follows its file: reloads on rewrite, N times, without any prompt', async ({ page }) => {
  const rootName = await installFollowHarness(page, sampleDoc());
  try {
    await boot(page);
    await page.getByRole('button', { name: 'Open JSON temporarily', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Opened followed.json temporarily');
    await expect(page.locator('.project-message')).toContainText('Following followed.json');

    for (let i = 1; i <= 3; i += 1) {
      await rewriteFollowed(page, rootName, docVariant(`round-${i}`));
      await expect(page.locator('.project-message')).toContainText('Reloaded followed.json from disk', {
        timeout: 5000,
      });
      await expect
        .poll(async () => (await rawDocument(page)).nodes)
        .toEqual(expect.arrayContaining([expect.objectContaining({ id: `round-${i}` })]));
      // Consume the message so the next round's assertion cannot match this one.
      await page.evaluate(() => {
        const el = document.querySelector('.project-message');
        if (el !== null) el.textContent = '';
      });
    }

    // The banner carries the reload time — a persistent banner stays truthful.
    await expect(page.locator('.banner', { hasText: 'Refreshed at' })).toBeVisible();
    expect(await harnessValue<number>(page, 'openCalls')).toBe(1);
  } finally {
    await cleanup(page, rootName);
  }
});

test('invalid or torn content never replaces the last good state; the next good write reloads', async ({ page }) => {
  const rootName = await installFollowHarness(page, sampleDoc());
  try {
    await boot(page);
    await page.getByRole('button', { name: 'Open JSON temporarily', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Following followed.json');
    const before = await rawDocument(page);

    await rewriteFollowed(page, rootName, '{"formatVersion":"1.0","nodes":[{"id":"tor');
    await expect(page.locator('.project-message')).toContainText('Auto-reload skipped', { timeout: 5000 });
    await expect(page.locator('.project-message')).toContainText('invalid or mid-write');
    expect(await rawDocument(page)).toEqual(before);

    await rewriteFollowed(page, rootName, docVariant('after-torn'));
    await expect(page.locator('.project-message')).toContainText('Reloaded followed.json from disk', {
      timeout: 5000,
    });
    await expect
      .poll(async () => (await rawDocument(page)).nodes)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'after-torn' })]));
  } finally {
    await cleanup(page, rootName);
  }
});

test('announcements: the live region hears the reload, never a bare "Selection cleared." (A2-P1-1)', async ({ page }) => {
  const rootName = await installFollowHarness(page, sampleDoc());
  try {
    await boot(page);
    await page.getByRole('button', { name: 'Open JSON temporarily', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Following followed.json');

    // Select the node the next rewrite will drop.
    await page.locator('.node-row', { hasText: 'pkg-b' }).first().click();
    await expect(page.locator('.status')).toContainText('Selected package pkg-b');

    await rewriteFollowed(page, rootName, docWithoutPkgB());
    await expect(page.locator('.status')).toContainText(
      'Reloaded followed.json: 1 selected item(s) no longer exist.',
      { timeout: 5000 },
    );
    expect(await page.locator('.status').textContent()).not.toContain('Selection cleared.');
  } finally {
    await cleanup(page, rootName);
  }
});

test('stop conditions: opening another document stops the poll — no further reloads', async ({ page }) => {
  const rootName = await installFollowHarness(page, sampleDoc());
  try {
    await boot(page);
    await page.getByRole('button', { name: 'Open JSON temporarily', exact: true }).click();
    await expect(page.locator('.project-message')).toContainText('Following followed.json');

    await page.locator('#import-input').setInputFiles({
      name: 'other.json',
      mimeType: 'application/json',
      buffer: Buffer.from(docVariant('other-doc'), 'utf8'),
    });
    await expect(page.locator('.project-message')).toContainText('Opened other.json temporarily');
    await expect(page.locator('.project-message')).not.toContainText('Following');

    await rewriteFollowed(page, rootName, docVariant('should-not-load'));
    await page.waitForTimeout(2600);
    expect(await page.locator('.project-message').textContent()).not.toContain('Reloaded');
    const raw = await rawDocument(page);
    expect(JSON.stringify(raw)).not.toContain('should-not-load');
    expect(JSON.stringify(raw)).toContain('other-doc');
  } finally {
    await cleanup(page, rootName);
  }
});

test('picker order (A2-P2-6): the picker runs on the click activation; a confirm-cancel leaves the session untouched', async ({ page }) => {
  const rootName = await installFollowHarness(page, sampleDoc());
  try {
    await boot(page);
    // Make the session discardable so confirmDestructive actually asks.
    await page.locator('.node-row').first().click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const hooks = (globalThis as unknown as Record<string, unknown>)['__visualSpecs'] as {
            project(): { hasDiscardableChanges: boolean };
          };
          return hooks.project().hasDiscardableChanges;
        }),
      )
      .toBe(true);

    const dialogs: string[] = [];
    const onDialog = (dialog: import('@playwright/test').Dialog): void => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    };
    page.on('dialog', onDialog);
    await page.getByRole('button', { name: 'Open JSON temporarily', exact: true }).click();

    // The picker already ran — BEFORE the confirm — on the click's activation.
    await expect.poll(() => harnessValue<number>(page, 'openCalls')).toBe(1);
    expect(await harnessValue<boolean[]>(page, 'openActivations')).toEqual([true]);
    await expect.poll(() => dialogs.length).toBe(1);
    expect(dialogs[0]).toMatch(/unsaved view changes/iu);
    // Cancel discarded the picked source: still the example session, no follow.
    await expect(page.locator('.status')).toContainText('Cancelled. No project or document state changed.');
    expect(await page.locator('.project-message').textContent()).not.toContain('Following');
    expect(JSON.stringify(await rawDocument(page))).toContain('AgentsCommander');
    expect(dialogs).toHaveLength(1);
    page.off('dialog', onDialog);
  } finally {
    await cleanup(page, rootName);
  }
});

// ── Harness ───────────────────────────────────────────────────────────────────

async function installFollowHarness(page: Page, initialText: string): Promise<string> {
  const rootName = `visual-specs-follow-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await page.addInitScript(
    ({ rootName: injectedRoot, fileName, text }) => {
      const globals = globalThis as unknown as Record<string, unknown>;
      const harness = {
        rootName: injectedRoot,
        openCalls: 0,
        openActivations: [] as boolean[],
      };
      globals['__followHarness'] = harness;
      globals['showOpenFilePicker'] = async () => {
        harness.openCalls += 1;
        harness.openActivations.push(navigator.userActivation.isActive);
        const opfs = await navigator.storage.getDirectory();
        const root = await opfs.getDirectoryHandle(injectedRoot, { create: true });
        const handle = await root.getFileHandle(fileName, { create: true });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        return [handle];
      };
    },
    { rootName, fileName: FOLLOWED, text: initialText },
  );
  return rootName;
}

async function rewriteFollowed(page: Page, rootName: string, text: string): Promise<void> {
  await page.evaluate(
    async ({ root, fileName, next }) => {
      const opfs = await navigator.storage.getDirectory();
      const dir = await opfs.getDirectoryHandle(root, { create: true });
      const handle = await dir.getFileHandle(fileName, { create: true });
      const writable = await handle.createWritable();
      await writable.write(next);
      await writable.close();
    },
    { root: rootName, fileName: FOLLOWED, next: text },
  );
}

async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('.canvas-host canvas');
  await page.waitForFunction(() => '__visualSpecs' in globalThis);
}

async function rawDocument(page: Page): Promise<Record<string, unknown> & { nodes?: unknown }> {
  return page.evaluate(() => {
    const hooks = (globalThis as unknown as Record<string, unknown>)['__visualSpecs'] as {
      raw(): Record<string, unknown>;
    };
    return hooks.raw();
  });
}

async function harnessValue<T>(page: Page, key: string): Promise<T> {
  return page.evaluate((name) => {
    const harness = (globalThis as unknown as Record<string, unknown>)['__followHarness'] as Record<
      string,
      unknown
    >;
    return harness[name] as T;
  }, key);
}

async function cleanup(page: Page, rootName: string): Promise<void> {
  await page.evaluate(async (name) => {
    const opfs = await navigator.storage.getDirectory();
    try {
      await opfs.removeEntry(name, { recursive: true });
    } catch {
      // best-effort: the sandboxed OPFS dies with the browser context anyway
    }
  }, rootName);
}

# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: final-gate.spec.ts >> editable Preview must not write a wrong-document recovery copy into project exports
- Location: final-gate.spec.ts:79:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "UNDERLYING-CURRENT-B"
Received: undefined
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - complementary "Project" [ref=e5]:
    - generic [ref=e6]:
      - heading "Project" [level=2] [ref=e7]
      - button "Collapse project rail" [expanded] [ref=e8] [cursor=pointer]
    - generic [ref=e9]:
      - paragraph [ref=e10]:
        - generic [ref=e11]: "Project preview:"
        - generic [ref=e12]: Editable preview recovery
      - generic [ref=e13]:
        - generic [ref=e14]: Project name
        - textbox "Project name" [ref=e15]:
          - /placeholder: Visual Specs
          - text: Editable preview recovery
      - button "Open Project" [ref=e16] [cursor=pointer]
    - generic [ref=e17]:
      - group "Project Editable preview recovery. Project ID 81d1f39d-b2c2-43b9-9e9a-eb5e54ba9a43." [ref=e18]:
        - generic [ref=e19]: Project Editable preview recovery. Project ID 81d1f39d-b2c2-43b9-9e9a-eb5e54ba9a43.
        - generic [ref=e20]: Project preview
        - generic [ref=e21]: Editable preview recovery
        - generic [ref=e22]: Project ID
        - generic [ref=e23]: 81d1f39d-b2c2-43b9-9e9a- eb5e54ba9a43
      - generic "Project state" [ref=e24]: "Project access: editable · Preview · Recovery available"
      - button "Return to project" [ref=e26] [cursor=pointer]
      - generic [ref=e27]:
        - button "Restore view" [ref=e28] [cursor=pointer]
        - button "Keep current" [ref=e29] [cursor=pointer]
        - button "Export autosave copy" [ref=e30] [cursor=pointer]
    - region "Document" [ref=e31]:
      - heading "Document" [level=3] [ref=e32]
      - generic [ref=e33]:
        - button "Open JSON temporarily" [ref=e34] [cursor=pointer]
        - button "Export JSON" [ref=e35] [cursor=pointer]
    - generic [ref=e36]: "Project access: editable. Preview only; the project remains open and export uses save picker. Exported autosave copy 20260714-064610_Editable-preview-recovery-autosave.json using project-export."
  - generic [ref=e37]:
    - toolbar "Map controls" [ref=e38]:
      - generic [ref=e39]:
        - generic [ref=e40]: ◈
        - generic [ref=e41]: Visual Specs
      - button "Explorer" [expanded] [ref=e42] [cursor=pointer]
      - button "Details" [expanded] [ref=e43] [cursor=pointer]
      - button "Fit" [ref=e45] [cursor=pointer]
      - button "Zoom out" [ref=e46] [cursor=pointer]: −
      - button "Zoom in" [ref=e47] [cursor=pointer]: +
      - button "Expand all" [ref=e49] [cursor=pointer]
      - button "Collapse all" [ref=e50] [cursor=pointer]
      - button "Reset layout" [ref=e51] [cursor=pointer]
    - generic [ref=e52]:
      - generic [ref=e53]:
        - strong [ref=e54]: "Coverage:"
        - generic [ref=e55]:
          - code [ref=e56]: rust-imports
          - generic [ref=e57]: degraded
          - generic [ref=e58]: "no macro expansion, no #[path], no cfg evaluation; glob imports are unresolved and item-level symbols are not resolved"
      - generic [ref=e59]:
        - strong [ref=e60]: 118 unresolved
        - generic [ref=e61]: relation(s) were seen but not guessed at. They are listed in the document, with evidence.
    - generic [ref=e62]:
      - complementary "Explorer" [ref=e63]:
        - searchbox "Search nodes by name or path" [ref=e65]
        - generic [ref=e67]:
          - term [ref=e68]: Nodes
          - definition [ref=e69]: "744"
          - term [ref=e70]: Relations
          - definition [ref=e71]: "1609"
          - term [ref=e72]: Drawn
          - definition [ref=e73]: "14"
          - term [ref=e74]: Folded away
          - definition [ref=e75]: "1419"
        - listbox "All nodes" [ref=e76]:
          - option "AgentsCommander repository" [ref=e77] [cursor=pointer]:
            - generic [ref=e79]: AgentsCommander
            - generic [ref=e80]: repository
          - option "@mblua/agentscommander (cli) application" [ref=e81] [cursor=pointer]:
            - generic [ref=e83]: "@mblua/agentscommander (cli)"
            - generic [ref=e84]: application
          - option "Agents Commander (desktop) application" [ref=e85] [cursor=pointer]:
            - generic [ref=e87]: Agents Commander (desktop)
            - generic [ref=e88]: application
          - option "agentscommander (web) application" [ref=e89] [cursor=pointer]:
            - generic [ref=e91]: agentscommander (web)
            - generic [ref=e92]: application
          - option "agentscommander-api-helper application" [ref=e93] [cursor=pointer]:
            - generic [ref=e95]: agentscommander-api-helper
            - generic [ref=e96]: application
          - option "session-bridge application" [ref=e97] [cursor=pointer]:
            - generic [ref=e99]: session-bridge
            - generic [ref=e100]: application
          - option "@mblua/agentscommander package" [ref=e101] [cursor=pointer]:
            - generic [ref=e103]: "@mblua/agentscommander"
            - generic [ref=e104]: package
          - option "agentscommander package" [ref=e105] [cursor=pointer]:
            - generic [ref=e107]: agentscommander
            - generic [ref=e108]: package
          - option "agentscommander-new crate" [ref=e109] [cursor=pointer]:
            - generic [ref=e111]: agentscommander-new
            - generic [ref=e112]: crate
          - option "session-bridge crate" [ref=e113] [cursor=pointer]:
            - generic [ref=e115]: session-bridge
            - generic [ref=e116]: crate
        - heading "Legend" [level=3] [ref=e117]
        - generic [ref=e118]:
          - button "application" [pressed] [ref=e119] [cursor=pointer]:
            - generic [ref=e121]: application
          - button "crate" [pressed] [ref=e122] [cursor=pointer]:
            - generic [ref=e124]: crate
          - button "directory" [pressed] [ref=e125] [cursor=pointer]:
            - generic [ref=e127]: directory
          - button "file" [pressed] [ref=e128] [cursor=pointer]:
            - generic [ref=e130]: file
          - button "package" [pressed] [ref=e131] [cursor=pointer]:
            - generic [ref=e133]: package
          - button "repository" [pressed] [ref=e134] [cursor=pointer]:
            - generic [ref=e136]: repository
          - button "bundles" [pressed] [ref=e137] [cursor=pointer]:
            - generic [ref=e139]: bundles
          - button "entrypoint" [pressed] [ref=e140] [cursor=pointer]:
            - generic [ref=e142]: entrypoint
          - button "imports" [pressed] [ref=e143] [cursor=pointer]:
            - generic [ref=e145]: imports
          - button "rust-imports" [pressed] [ref=e146] [cursor=pointer]:
            - generic [ref=e148]: rust-imports
          - button "tauri-command" [pressed] [ref=e149] [cursor=pointer]:
            - generic [ref=e151]: tauri-command
          - button "web-command" [pressed] [ref=e152] [cursor=pointer]:
            - generic [ref=e154]: web-command
          - button "hide tests" [ref=e155] [cursor=pointer]:
            - generic [ref=e157]: hide tests
      - img "Repository map. Use the node list panel for a keyboard-navigable view." [ref=e159]
      - complementary "Details" [ref=e160]:
        - generic [ref=e162]:
          - paragraph [ref=e163]: Nothing selected.
          - paragraph [ref=e164]: Click a box to see what it is and what is hidden inside it. Click a line to see every relation behind it, with its evidence. Double-click to expand or collapse.
    - status [ref=e165]
```

# Test source

```ts
  21  |   const pageErrors: string[] = [];
  22  |   page.on('pageerror', (error) => pageErrors.push(error.message));
  23  |   try {
  24  |     await boot(page);
  25  |     await page.getByLabel('Project name').fill('Preview recovery owner');
  26  |     await page.getByRole('button', { name: 'Create Project', exact: true }).click();
  27  |     await expect(page.locator('.project-message')).toContainText('Created project.');
  28  | 
  29  |     // Freeze an export of document A, then make current document B and give B a
  30  |     // matching recovery view. Opening the old export makes A the active Preview.
  31  |     await page.locator('#export-btn').click();
  32  |     await expect(page.locator('.project-message')).toContainText('Exported');
  33  |     await rewriteUnderlyingCurrentWithRecovery(page, rootName);
  34  | 
  35  |     await page.reload();
  36  |     await waitForBoot(page);
  37  |     await page.getByRole('button', { name: 'Open Project', exact: true }).click();
  38  |     await expect(page.locator('.project-states')).toContainText('Recovery available');
  39  |     await expect(page.getByLabel('Project export copies').locator('option')).toHaveCount(1);
  40  |     await page.getByRole('button', { name: 'Open export copy', exact: true }).click();
  41  |     await expect(page.locator('.project-states')).toContainText('Preview');
  42  |     await expect(page.locator('.project-states')).toContainText('Recovery available');
  43  | 
  44  |     const before = await readProjectState(page);
  45  |     expect(before).toMatchObject({
  46  |       sessionKind: 'project-preview',
  47  |       previewing: true,
  48  |       pendingAutosave: true,
  49  |     });
  50  |     await page.getByRole('button', { name: 'Export autosave copy', exact: true }).click();
  51  |     await expect.poll(() => harnessValue<number>(page, 'saveCalls')).toBe(1);
  52  |     await expect(page.locator('.project-message')).toContainText('Exported autosave copy');
  53  | 
  54  |     const saved = await readOnlySavedCopy(page, rootName);
  55  |     const underlying = await readUnderlyingCurrent(page, rootName);
  56  |     const evidence = {
  57  |       sessionKind: before.sessionKind,
  58  |       pendingAutosave: before.pendingAutosave,
  59  |       activePreviewMarker: saved['resilienceUnderlyingMarker'] ?? null,
  60  |       underlyingMarker: underlying['resilienceUnderlyingMarker'] ?? null,
  61  |       savedNodeCount: Array.isArray(saved['nodes']) ? saved['nodes'].length : -1,
  62  |       underlyingNodeCount: Array.isArray(underlying['nodes']) ? underlying['nodes'].length : -1,
  63  |       saveCalls: await harnessValue<number>(page, 'saveCalls'),
  64  |       saveActivations: await harnessValue<boolean[]>(page, 'saveActivations'),
  65  |       pageErrors,
  66  |     };
  67  |     console.log('PREVIEW_RECOVERY_EVIDENCE=' + JSON.stringify(evidence));
  68  |     expect(evidence.saveActivations).toEqual([true]);
  69  |     expect(pageErrors).toEqual([]);
  70  | 
  71  |     // Approved invariant: Preview/recovery actions cannot operate on the wrong
  72  |     // document. This intentionally fails if the copy combines Preview A with B's view.
  73  |     expect(saved['resilienceUnderlyingMarker']).toBe('UNDERLYING-CURRENT-B');
  74  |   } finally {
  75  |     await cleanup(page, rootName);
  76  |   }
  77  | });
  78  | 
  79  | test('editable Preview must not write a wrong-document recovery copy into project exports', async ({ page }) => {
  80  |   const rootName = await installHarness(page);
  81  |   const pageErrors: string[] = [];
  82  |   page.on('pageerror', (error) => pageErrors.push(error.message));
  83  |   try {
  84  |     await boot(page);
  85  |     await page.getByLabel('Project name').fill('Editable preview recovery');
  86  |     await page.getByRole('button', { name: 'Create Project', exact: true }).click();
  87  |     await expect(page.locator('.project-message')).toContainText('Created project.');
  88  |     await page.locator('#export-btn').click();
  89  |     await expect(page.locator('.project-message')).toContainText('Exported');
  90  |     await rewriteUnderlyingCurrentWithRecovery(page, rootName);
  91  |     await page.reload();
  92  |     await waitForBoot(page);
  93  |     await page.getByRole('button', { name: 'Open Project', exact: true }).click();
  94  |     await page.getByRole('button', { name: 'Enable editing', exact: true }).click();
  95  |     await expect(page.locator('.project-states')).toContainText('Project access: editable');
  96  |     await page.getByRole('button', { name: 'Open export copy', exact: true }).click();
  97  |     await expect(page.locator('.project-states')).toContainText('Preview');
  98  |     await expect(page.locator('.project-states')).toContainText('Recovery available');
  99  |     const beforeFiles = await readProjectExports(page, rootName);
  100 | 
  101 |     await page.getByRole('button', { name: 'Export autosave copy', exact: true }).click();
  102 |     await expect(page.locator('.project-message')).toContainText('using project-export');
  103 |     const afterFiles = await readProjectExports(page, rootName);
  104 |     const newNames = Object.keys(afterFiles).filter((name) => !(name in beforeFiles));
  105 |     expect(newNames).toHaveLength(1);
  106 |     const written = afterFiles[newNames[0] ?? ''] ?? {};
  107 |     const underlying = await readUnderlyingCurrent(page, rootName);
  108 |     const evidence = {
  109 |       beforeExports: Object.keys(beforeFiles),
  110 |       afterExports: Object.keys(afterFiles),
  111 |       writtenMarker: written['resilienceUnderlyingMarker'] ?? null,
  112 |       underlyingMarker: underlying['resilienceUnderlyingMarker'] ?? null,
  113 |       savePickerCalls: await harnessValue<number>(page, 'saveCalls'),
  114 |       permissionActivations: await harnessValue<boolean[]>(page, 'permissionActivations'),
  115 |       pageErrors,
  116 |     };
  117 |     console.log('EDITABLE_PREVIEW_RECOVERY_EVIDENCE=' + JSON.stringify(evidence));
  118 |     expect(evidence.savePickerCalls).toBe(0);
  119 |     expect(evidence.permissionActivations).toEqual([true]);
  120 |     expect(pageErrors).toEqual([]);
> 121 |     expect(written['resilienceUnderlyingMarker']).toBe('UNDERLYING-CURRENT-B');
      |                                                   ^ Error: expect(received).toBe(expected) // Object.is equality
  122 |   } finally {
  123 |     await cleanup(page, rootName);
  124 |   }
  125 | });
  126 | 
  127 | test('boundary and toggle bursts preserve one overlay, focus, preferences, and DPR backing', async ({ browser }) => {
  128 |   const observations: Array<Record<string, unknown>> = [];
  129 |   for (const dpr of [1, 2]) {
  130 |     const context = await browser.newContext({
  131 |       baseURL: 'http://localhost:5175',
  132 |       viewport: { width: 1680, height: 1000 },
  133 |       deviceScaleFactor: dpr,
  134 |     });
  135 |     const page = await context.newPage();
  136 |     const rootName = await installHarness(page);
  137 |     const pageErrors: string[] = [];
  138 |     page.on('pageerror', (error) => pageErrors.push(error.message));
  139 |     try {
  140 |       await boot(page);
  141 |       await page.getByLabel('Project name').fill('Boundary stress');
  142 |       await page.getByRole('button', { name: 'Create Project', exact: true }).click();
  143 |       await expect(page.locator('.project-message')).toContainText('Created project.');
  144 | 
  145 |       // Establish non-default independent preferences, then cross every boundary
  146 |       // repeatedly without waiting for the application's rAF work between crossings.
  147 |       await page.locator('#toggle-sidebar').click();
  148 |       await page.locator('#toggle-detail').click();
  149 |       await page.locator('#collapse-project-rail').click();
  150 |       const widths = [1663, 1664, 1200, 1199, 800, 1200, 1680, 1663];
  151 |       for (let round = 0; round < 10; round += 1) {
  152 |         for (const width of widths) await page.setViewportSize({ width, height: 800 });
  153 |       }
  154 |       await waitForFrames(page);
  155 |       let layout = await readLayout(page);
  156 |       expect(layout).toMatchObject({
  157 |         band: 'hybrid',
  158 |         projectPreference: 'collapsed',
  159 |         sidebarPreference: 'closed',
  160 |         detailPreference: 'closed',
  161 |         activeOverlay: null,
  162 |         projectOpen: false,
  163 |         sidebarOpen: false,
  164 |         detailOpen: false,
  165 |       });
  166 | 
  167 |       await page.locator('#show-project-rail').click();
  168 |       await expect(page.locator('#collapse-project-rail')).toBeFocused();
  169 |       await page.locator('#toggle-detail').click();
  170 |       await page.getByLabel('Project name').focus();
  171 |       await page.keyboard.press('Escape');
  172 |       await expect(page.locator('#show-project-rail')).toBeFocused();
  173 |       layout = await readLayout(page);
  174 |       expect(layout).toMatchObject({
  175 |         band: 'hybrid',
  176 |         activeOverlay: null,
  177 |         projectOpen: false,
  178 |         sidebarOpen: false,
  179 |         detailPreference: 'open',
  180 |         detailOpen: true,
  181 |       });
  182 | 
  183 |       // Stress coalescing separately from boundary changes.
  184 |       await page.setViewportSize({ width: 1680, height: 1000 });
  185 |       await page.locator('#show-project-rail').click();
  186 |       await page.evaluate(() => {
  187 |         const collapse = document.querySelector<HTMLButtonElement>('#collapse-project-rail');
  188 |         const show = document.querySelector<HTMLButtonElement>('#show-project-rail');
  189 |         if (collapse === null || show === null) throw new Error('missing rail toggles');
  190 |         for (let index = 0; index < 100; index += 1) {
  191 |           (index % 2 === 0 ? collapse : show).click();
  192 |         }
  193 |       });
  194 |       await waitForFrames(page);
  195 |       const metrics = await page.locator('.canvas-host canvas').evaluate((node) => {
  196 |         const canvas = node as HTMLCanvasElement;
  197 |         const rect = canvas.getBoundingClientRect();
  198 |         return {
  199 |           cssWidth: rect.width,
  200 |           clientWidth: canvas.clientWidth,
  201 |           clientHeight: canvas.clientHeight,
  202 |           backingWidth: canvas.width,
  203 |           backingHeight: canvas.height,
  204 |         };
  205 |       });
  206 |       layout = await readLayout(page);
  207 |       expect(layout.pendingFrames).toEqual({ resize: false, paint: false, focus: false });
  208 |       expect(metrics.backingWidth).toBe(Math.round(metrics.clientWidth * dpr));
  209 |       expect(metrics.backingHeight).toBe(Math.round(metrics.clientHeight * dpr));
  210 |       expect(pageErrors).toEqual([]);
  211 |       expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  212 |       observations.push({ dpr, layout, metrics, pageErrors });
  213 |     } finally {
  214 |       await cleanup(page, rootName);
  215 |       await context.close();
  216 |     }
  217 |   }
  218 |   console.log('BOUNDARY_STRESS_EVIDENCE=' + JSON.stringify(observations));
  219 | });
  220 | 
  221 | test('collapsed compact Enable editing retains trusted permission activation', async ({ page }) => {
```
# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: regate.spec.ts >> readonly Preview guard survives stale DOM invocation and returns recovery to owner B
- Location: regate.spec.ts:22:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "collapse-project-rail"
Received: ""
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
        - generic [ref=e12]: Independent readonly owner
      - generic [ref=e13]:
        - generic [ref=e14]: Project name
        - textbox "Project name" [ref=e15]:
          - /placeholder: Visual Specs
          - text: Independent readonly owner
      - button "Open Project" [ref=e16] [cursor=pointer]
    - generic [ref=e17]:
      - group "Project Independent readonly owner. Project ID 9473af63-6249-4b2d-83de-401e9c2640bc." [ref=e18]:
        - generic [ref=e19]: Project Independent readonly owner. Project ID 9473af63-6249-4b2d-83de-401e9c2640bc.
        - generic [ref=e20]: Project preview
        - generic [ref=e21]: Independent readonly owner
        - generic [ref=e22]: Project ID
        - generic [ref=e23]: 9473af63-6249-4b2d-83de- 401e9c2640bc
      - generic "Project state" [ref=e24]: "Project access: read-only · Preview · Recovery available"
      - button "Return to project" [ref=e26] [cursor=pointer]
    - region "Document" [ref=e27]:
      - heading "Document" [level=3] [ref=e28]
      - generic [ref=e29]:
        - button "Open JSON temporarily" [ref=e30] [cursor=pointer]
        - button "Export JSON" [ref=e31] [cursor=pointer]
    - generic [ref=e32]: "Project access: read-only. Preview only; the project remains open and export uses save picker. Previewing export copy 20260714-071402_Independent-readonly-owner.json. Use Return to project when done."
  - generic [ref=e33]:
    - toolbar "Map controls" [ref=e34]:
      - generic [ref=e35]:
        - generic [ref=e36]: ◈
        - generic [ref=e37]: Visual Specs
      - button "Explorer" [expanded] [ref=e38] [cursor=pointer]
      - button "Details" [expanded] [ref=e39] [cursor=pointer]
      - button "Fit" [ref=e41] [cursor=pointer]
      - button "Zoom out" [ref=e42] [cursor=pointer]: −
      - button "Zoom in" [ref=e43] [cursor=pointer]: +
      - button "Expand all" [ref=e45] [cursor=pointer]
      - button "Collapse all" [ref=e46] [cursor=pointer]
      - button "Reset layout" [ref=e47] [cursor=pointer]
    - generic [ref=e48]:
      - generic [ref=e49]:
        - strong [ref=e50]: "Coverage:"
        - generic [ref=e51]:
          - code [ref=e52]: rust-imports
          - generic [ref=e53]: degraded
          - generic [ref=e54]: "no macro expansion, no #[path], no cfg evaluation; glob imports are unresolved and item-level symbols are not resolved"
      - generic [ref=e55]:
        - strong [ref=e56]: 118 unresolved
        - generic [ref=e57]: relation(s) were seen but not guessed at. They are listed in the document, with evidence.
    - generic [ref=e58]:
      - complementary "Explorer" [ref=e59]:
        - searchbox "Search nodes by name or path" [ref=e61]
        - generic [ref=e63]:
          - term [ref=e64]: Nodes
          - definition [ref=e65]: "744"
          - term [ref=e66]: Relations
          - definition [ref=e67]: "1609"
          - term [ref=e68]: Drawn
          - definition [ref=e69]: "14"
          - term [ref=e70]: Folded away
          - definition [ref=e71]: "1419"
        - listbox "All nodes" [ref=e72]:
          - option "AgentsCommander repository" [ref=e73] [cursor=pointer]:
            - generic [ref=e75]: AgentsCommander
            - generic [ref=e76]: repository
          - option "@mblua/agentscommander (cli) application" [ref=e77] [cursor=pointer]:
            - generic [ref=e79]: "@mblua/agentscommander (cli)"
            - generic [ref=e80]: application
          - option "Agents Commander (desktop) application" [ref=e81] [cursor=pointer]:
            - generic [ref=e83]: Agents Commander (desktop)
            - generic [ref=e84]: application
          - option "agentscommander (web) application" [ref=e85] [cursor=pointer]:
            - generic [ref=e87]: agentscommander (web)
            - generic [ref=e88]: application
          - option "agentscommander-api-helper application" [ref=e89] [cursor=pointer]:
            - generic [ref=e91]: agentscommander-api-helper
            - generic [ref=e92]: application
          - option "session-bridge application" [ref=e93] [cursor=pointer]:
            - generic [ref=e95]: session-bridge
            - generic [ref=e96]: application
          - option "@mblua/agentscommander package" [ref=e97] [cursor=pointer]:
            - generic [ref=e99]: "@mblua/agentscommander"
            - generic [ref=e100]: package
          - option "agentscommander package" [ref=e101] [cursor=pointer]:
            - generic [ref=e103]: agentscommander
            - generic [ref=e104]: package
          - option "agentscommander-new crate" [ref=e105] [cursor=pointer]:
            - generic [ref=e107]: agentscommander-new
            - generic [ref=e108]: crate
          - option "session-bridge crate" [ref=e109] [cursor=pointer]:
            - generic [ref=e111]: session-bridge
            - generic [ref=e112]: crate
        - heading "Legend" [level=3] [ref=e113]
        - generic [ref=e114]:
          - button "application" [pressed] [ref=e115] [cursor=pointer]:
            - generic [ref=e117]: application
          - button "crate" [pressed] [ref=e118] [cursor=pointer]:
            - generic [ref=e120]: crate
          - button "directory" [pressed] [ref=e121] [cursor=pointer]:
            - generic [ref=e123]: directory
          - button "file" [pressed] [ref=e124] [cursor=pointer]:
            - generic [ref=e126]: file
          - button "package" [pressed] [ref=e127] [cursor=pointer]:
            - generic [ref=e129]: package
          - button "repository" [pressed] [ref=e130] [cursor=pointer]:
            - generic [ref=e132]: repository
          - button "bundles" [pressed] [ref=e133] [cursor=pointer]:
            - generic [ref=e135]: bundles
          - button "entrypoint" [pressed] [ref=e136] [cursor=pointer]:
            - generic [ref=e138]: entrypoint
          - button "imports" [pressed] [ref=e139] [cursor=pointer]:
            - generic [ref=e141]: imports
          - button "rust-imports" [pressed] [ref=e142] [cursor=pointer]:
            - generic [ref=e144]: rust-imports
          - button "tauri-command" [pressed] [ref=e145] [cursor=pointer]:
            - generic [ref=e147]: tauri-command
          - button "web-command" [pressed] [ref=e148] [cursor=pointer]:
            - generic [ref=e150]: web-command
          - button "hide tests" [ref=e151] [cursor=pointer]:
            - generic [ref=e153]: hide tests
      - img "Repository map. Use the node list panel for a keyboard-navigable view." [ref=e155]
      - complementary "Details" [ref=e156]:
        - generic [ref=e158]:
          - paragraph [ref=e159]: Nothing selected.
          - paragraph [ref=e160]: Click a box to see what it is and what is hidden inside it. Click a line to see every relation behind it, with its evidence. Double-click to expand or collapse.
    - status [ref=e161]
```

# Test source

```ts
  1   | import {
  2   |   expect,
  3   |   test,
  4   |   type Page,
  5   | } from '../repo-CodebaseConstellation/VisualSpecs/node_modules/@playwright/test/index.mjs';
  6   | 
  7   | interface ReGateHarness {
  8   |   rootName: string;
  9   |   directoryCalls: number;
  10  |   directoryActivations: boolean[];
  11  |   saveCalls: number;
  12  |   saveActivations: boolean[];
  13  |   savedNames: string[];
  14  |   permissionCalls: number;
  15  |   permissionActivations: boolean[];
  16  |   writableOpens: string[];
  17  | }
  18  | 
  19  | type JsonObject = Record<string, unknown>;
  20  | 
  21  | for (const access of ['editable', 'readonly'] as const) {
  22  |   test(`${access} Preview guard survives stale DOM invocation and returns recovery to owner B`, async ({ page }) => {
  23  |     const rootName = await installHarness(page);
  24  |     const pageErrors: string[] = [];
  25  |     page.on('pageerror', (error) => pageErrors.push(error.message));
  26  |     try {
  27  |       await createPreviewOwnerA(page, `Independent ${access} owner`);
  28  |       await rewriteUnderlyingOwnerB(page, rootName);
  29  |       await page.reload();
  30  |       await waitForBoot(page);
  31  |       await page.getByRole('button', { name: 'Open Project', exact: true }).click();
  32  |       if (access === 'editable') {
  33  |         await page.getByRole('button', { name: 'Enable editing', exact: true }).click();
  34  |         await expect(page.locator('.project-states')).toContainText('Project access: editable');
  35  |       }
  36  | 
  37  |       // Put focus inside the soon-to-be-hidden recovery subtree, then invoke the
  38  |       // Preview transition without moving focus through a physical click.
  39  |       const restore = page.getByRole('button', { name: 'Restore view', exact: true });
  40  |       await expect(restore).toBeVisible();
  41  |       await restore.focus();
  42  |       await expect(restore).toBeFocused();
  43  |       await page.getByRole('button', { name: 'Open export copy', exact: true }).evaluate((button) => {
  44  |         (button as HTMLButtonElement).click();
  45  |       });
  46  |       await expect(page.locator('.project-states')).toContainText('Preview');
  47  |       await expect(page.locator('.project-states')).toContainText('Recovery available');
  48  |       await expect.poll(() => rawDocument(page)).toMatchObject({
  49  |         resiliencePreviewMarker: 'PREVIEW-A',
  50  |       });
  51  |       expect(await readUnderlyingCurrent(page, rootName)).toMatchObject({
  52  |         resilienceUnderlyingMarker: 'UNDERLYING-B',
  53  |       });
> 54  |       expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.id)).toBe(
      |                                                                                             ^ Error: expect(received).toBe(expected) // Object.is equality
  55  |         'collapse-project-rail',
  56  |       );
  57  | 
  58  |       const recoveryButtons = page.locator('.autosave-actions button');
  59  |       await expect(recoveryButtons).toHaveCount(3);
  60  |       for (const name of ['Restore view', 'Keep current', 'Export autosave copy']) {
  61  |         await expect(page.getByRole('button', { name, exact: true })).toBeHidden();
  62  |       }
  63  |       expect(
  64  |         await recoveryButtons.evaluateAll((buttons) =>
  65  |           buttons.map((button) => {
  66  |             (button as HTMLButtonElement).focus();
  67  |             return document.activeElement === button;
  68  |           }),
  69  |         ),
  70  |       ).toEqual([false, false, false]);
  71  | 
  72  |       // Cross every layout boundary while the subtree is hidden. Facts and focus
  73  |       // must remain reachable and no stale frame may expose the commands.
  74  |       for (const width of [1199, 1200, 1663, 1664, 800, 1680, 1199, 1663, 1680]) {
  75  |         await page.setViewportSize({ width, height: 800 });
  76  |       }
  77  |       await waitForFrames(page);
  78  |       await expect(page.locator('.project-states')).toContainText('Preview');
  79  |       await expect(page.locator('.project-states')).toContainText('Recovery available');
  80  |       expect(await recoveryButtons.evaluateAll((buttons) => buttons.every((button) => !button.checkVisibility()))).toBe(true);
  81  | 
  82  |       await page.getByRole('button', { name: 'Collapse project rail', exact: true }).click();
  83  |       const compactRecovery = page.getByRole('button', { name: 'Recovery available', exact: true });
  84  |       await expect(compactRecovery).toBeVisible();
  85  |       await expect(page.locator('.project-compact-states')).toContainText('Preview');
  86  |       await compactRecovery.click();
  87  |       await expect(page.locator('#project-rail')).toBeVisible();
  88  | 
  89  |       const guarded = {
  90  |         project: await readProjectState(page),
  91  |         raw: await rawDocument(page),
  92  |         viewport: await viewport(page),
  93  |         disk: await readDisk(page, rootName),
  94  |         saveCalls: await harnessValue<number>(page, 'saveCalls'),
  95  |         writableOpens: await harnessValue<string[]>(page, 'writableOpens'),
  96  |       };
  97  | 
  98  |       // Invoke captured hidden controls repeatedly. This bypasses presentation but
  99  |       // not the controller boundary and also exercises runProjectAction epoch races.
  100 |       await recoveryButtons.evaluateAll((buttons) => {
  101 |         for (let round = 0; round < 4; round += 1) {
  102 |           for (const button of buttons) (button as HTMLButtonElement).click();
  103 |         }
  104 |       });
  105 |       await expect(page.locator('.action-error')).toContainText('Return to the project');
  106 |       await expect(page.locator('.project-states')).toContainText('Preview');
  107 |       await expect(page.locator('.project-states')).toContainText('Recovery available');
  108 |       expect(await readProjectState(page)).toEqual(guarded.project);
  109 |       expect(await rawDocument(page)).toEqual(guarded.raw);
  110 |       expect(await viewport(page)).toEqual(guarded.viewport);
  111 |       expect(await readDisk(page, rootName)).toEqual(guarded.disk);
  112 |       expect(await harnessValue<number>(page, 'saveCalls')).toBe(guarded.saveCalls);
  113 |       expect(await harnessValue<string[]>(page, 'writableOpens')).toEqual(guarded.writableOpens);
  114 | 
  115 |       // A rejected stale export immediately followed by Return must not surface its
  116 |       // late error or execute after the owner transition.
  117 |       await page.evaluate(() => {
  118 |         const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')];
  119 |         const recovery = buttons.find((button) => button.textContent?.trim() === 'Export autosave copy');
  120 |         const returnButton = buttons.find((button) => button.textContent?.trim() === 'Return to project');
  121 |         if (recovery === undefined || returnButton === undefined) throw new Error('missing stale-action controls');
  122 |         recovery.click();
  123 |         returnButton.click();
  124 |       });
  125 |       await expect.poll(async () => (await readProjectState(page)).sessionKind).toBe('project');
  126 |       await expect(page.locator('.action-error')).toBeHidden();
  127 |       const returned = await readProjectState(page);
  128 |       expect(returned).toMatchObject({ previewing: false, pendingAutosave: true });
  129 |       expect(await rawDocument(page)).toMatchObject({
  130 |         resilienceUnderlyingMarker: 'UNDERLYING-B',
  131 |       });
  132 | 
  133 |       const returnViewport = await viewport(page);
  134 |       const diskBeforeExport = await readDisk(page, rootName);
  135 |       const savesBefore = await harnessValue<number>(page, 'saveCalls');
  136 |       const writableBeforeResolution = await harnessValue<string[]>(page, 'writableOpens');
  137 |       const exportRecovery = page.getByRole('button', { name: 'Export autosave copy', exact: true });
  138 |       await exportRecovery.evaluate((button) => {
  139 |         button.addEventListener('click', (event) => {
  140 |           (globalThis as unknown as JsonObject)['__independentRecoveryTrusted'] = event.isTrusted;
  141 |         }, { once: true });
  142 |       });
  143 |       await exportRecovery.click();
  144 |       await expect(page.locator('.project-message')).toContainText('Exported autosave copy');
  145 |       expect(await page.evaluate(() => (globalThis as unknown as JsonObject)['__independentRecoveryTrusted'])).toBe(true);
  146 | 
  147 |       const diskAfterExport = await readDisk(page, rootName);
  148 |       let recovery: JsonObject;
  149 |       if (access === 'editable') {
  150 |         const added = Object.keys(diskAfterExport.exports).filter((name) => !(name in diskBeforeExport.exports));
  151 |         expect(added).toHaveLength(1);
  152 |         expect(await harnessValue<number>(page, 'saveCalls')).toBe(savesBefore);
  153 |         recovery = JSON.parse(diskAfterExport.exports[added[0] ?? ''] ?? '{}') as JsonObject;
  154 |       } else {
```
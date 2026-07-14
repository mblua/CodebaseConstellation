import { fileURLToPath } from 'node:url';

import { defineConfig } from '../../../../../node_modules/@playwright/test/index.mjs';

const visualSpecsRoot = fileURLToPath(new URL('../../../../../', import.meta.url));

export default defineConfig({
  testDir: '.',
  testMatch: /physical-focus\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'results/physical-focus',
  timeout: 75_000,
  use: {
    baseURL: 'http://localhost:5177',
    viewport: { width: 1680, height: 1000 },
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5177 --strictPort',
    cwd: visualSpecsRoot,
    url: 'http://localhost:5177',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});

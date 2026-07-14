import { defineConfig } from '../../../../../node_modules/@playwright/test/index.mjs';
import { fileURLToPath } from 'node:url';

const visualSpecsRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const evidenceOutput = fileURLToPath(new URL('./test-results/', import.meta.url));

export default defineConfig({
  testDir: '.',
  testMatch: /current-head-closure\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: process.env['SEMANTIC_GATE_OUTPUT'] ?? evidenceOutput,
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5178',
    viewport: { width: 1663, height: 900 },
    deviceScaleFactor: 1,
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5178 --strictPort',
    cwd: visualSpecsRoot,
    url: 'http://localhost:5178',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});

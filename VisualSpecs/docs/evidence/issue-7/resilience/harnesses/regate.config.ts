import { defineConfig } from '../repo-CodebaseConstellation/VisualSpecs/node_modules/@playwright/test/index.mjs';

const visualSpecsRoot =
  'C:/Users/maria/0_repos/CodebaseConstellation_iac/.ac/wg-4-vs-dev-team/__agent_vs-resilience-red-team/evidence-95c53fc/VisualSpecs';

export default defineConfig({
  testDir: '.',
  testMatch: /regate\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'regate-results',
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

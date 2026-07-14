export default {
  testDir: '.',
  testMatch: /preview-recovery-breakpoint-round3\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5175',
    viewport: { width: 1663, height: 900 },
    deviceScaleFactor: 1,
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5175 --strictPort',
    cwd: 'C:/Users/maria/0_repos/CodebaseConstellation_iac/.ac/wg-4-vs-dev-team/repo-CodebaseConstellation/VisualSpecs',
    url: 'http://localhost:5175',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
};

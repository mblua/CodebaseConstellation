import { createRequire } from 'node:module';

const requireFromVisualSpecs = createRequire(
  'C:/Users/maria/0_repos/CodebaseConstellation_iac/.ac/wg-4-vs-dev-team/repo-CodebaseConstellation/VisualSpecs/package.json',
);
const { chromium } = requireFromVisualSpecs('@playwright/test');

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5175/', { waitUntil: 'networkidle' });
  const before = {
    coverage: await page.locator('.banner.coverage').count(),
    unresolved: await page.locator('.banners').getByText(/unresolved/i).count(),
  };
  await page.locator('#import-input').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{not valid json'),
  });
  await page.locator('.banner.error').waitFor();
  const after = {
    coverage: await page.locator('.banner.coverage').count(),
    unresolved: await page.locator('.banners').getByText(/unresolved/i).count(),
    error: await page.locator('.banner.error').innerText(),
  };
  console.log('GLOBAL_BANNERS_AFTER_FAILURE', JSON.stringify({ before, after }));
} finally {
  await browser.close();
}

import { createRequire } from 'node:module';
import {
  makeProjectManifest,
  parseProjectManifest,
  projectManifestText,
} from '../repo-CodebaseConstellation/VisualSpecs/src/contract/projectManifest.ts';

const requireFromVisualSpecs = createRequire(
  'C:/Users/maria/0_repos/CodebaseConstellation_iac/.ac/wg-4-vs-dev-team/repo-CodebaseConstellation/VisualSpecs/package.json',
);
const { chromium } = requireFromVisualSpecs('@playwright/test');

const idA = 'same\u200Bid'; // ZERO WIDTH SPACE
const idB = 'same\u2060id'; // WORD JOINER

function roundTripId(id) {
  const manifest = makeProjectManifest({
    id,
    name: 'Acme',
    docId: 'doc',
    revision: `sha256:${'0'.repeat(64)}`,
    nowUtc: '2026-07-14T00:00:00.000Z',
  });
  return parseProjectManifest(projectManifestText(manifest)).manifest.project.id;
}

const parsedA = roundTripId(idA);
const parsedB = roundTripId(idB);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const rendered = await page.evaluate(([a, b]) => {
    const raster = (value) => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx === null) throw new Error('2D context unavailable');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000';
      ctx.font = '32px Arial';
      ctx.textBaseline = 'top';
      ctx.fillText(value, 0, 0);
      return {
        width: ctx.measureText(value).width,
        pixels: Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data),
      };
    };
    const ra = raster(a);
    const rb = raster(b);
    return {
      widthA: ra.width,
      widthB: rb.width,
      identicalPixels:
        ra.pixels.length === rb.pixels.length && ra.pixels.every((value, i) => value === rb.pixels[i]),
    };
  }, [parsedA, parsedB]);

  const hex = (value) => Array.from(value, (c) => `U+${c.codePointAt(0).toString(16).toUpperCase()}`);
  console.log('VALID_DISTINCT_IDS', JSON.stringify({
    parsedDistinct: parsedA !== parsedB,
    sameCodePointLength: Array.from(parsedA).length === Array.from(parsedB).length,
    idA: hex(parsedA),
    idB: hex(parsedB),
  }));
  console.log('RAW_TEXT_RENDER', JSON.stringify(rendered));
} finally {
  await browser.close();
}

import { defineConfig } from 'vite';

// Visual Specs builds in isolation: its own root, its own dist, no shared
// config with `web/`. Nothing here reads or writes outside VisualSpecs/.
export default defineConfig({
  root: '.',
  // The dataset is imported with `?raw` and parsed through the same validator an
  // imported document goes through, so there is no public dir and no fetch at
  // runtime (see docs/ARCHITECTURE.md §11).
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      // ONLY the app. `conformance.html` — the page that runs the shared adapter
      // suite against the real renderer — is a TEST fixture, and the dev server
      // serves it happily without it being shipped. A production bundle that carries
      // its own test harness is a production bundle nobody has read.
      input: { main: 'index.html' },
      output: {
        // Stable names keep the Playwright smoke and the CSP simple.
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: {
    port: 5175,
    strictPort: true,
  },
});

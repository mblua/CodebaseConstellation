import { defineConfig } from "vitest/config";

export default defineConfig({
  assetsInclude: ["**/*.sqlite", "**/*.wasm", "**/*.woff2"],
  server: {
    fs: {
      allow: [".."],
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});

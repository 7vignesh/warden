import { defineConfig } from "vitest/config";

// Slow tests that spawn processes or a browser: the MCP server over stdio and the hook scripts.
// Run with `npm run test:tools`. They are excluded from test:fast, which runs on every save.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/tools/**/*.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});

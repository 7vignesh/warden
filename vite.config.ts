import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

// GitHub Pages serves the site under /<repo-name>/. Override with BASE_PATH if the repo is renamed.
const base = process.env.BASE_PATH ?? "/warden/";

// Build and preview must agree on the base, or preview serves index.html for every asset request.
export default defineConfig(({ command, isPreview }) => ({
  base: command === "build" || isPreview === true ? base : "/",
  plugins: [react()],
  worker: { format: "es" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Process- and browser-spawning tests run separately: npm run test:tools.
    exclude: [...configDefaults.exclude, "tests/tools/**"],
  },
}));

import { defineConfig } from "vitest/config";

/**
 * Vitest config for pure-Node logic tests (ExecutionEngine etc.)
 * These do NOT depend on vscode or a browser DOM.
 * Run via: pnpm test:engine
 */
export default defineConfig({
  test: {
    name: "engine",
    environment: "node",
    include: ["src/tests/unit/**/*.test.ts", "src/tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
  },
});

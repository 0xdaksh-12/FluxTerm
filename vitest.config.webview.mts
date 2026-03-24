import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Vitest config for React / DOM webview tests.
 * Uses jsdom to simulate a browser environment.
 * Run via: pnpm test:web
 */
export default defineConfig({
  test: {
    name: "webview",
    environment: "jsdom",
    include: ["src/webview/tests/**/*.test.{ts,tsx}"],
    setupFiles: ["src/webview/tests/setup.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@vscode/codicons": path.resolve(__dirname, "src/webview/tests/mocks/codicons.ts"),
    },
  },
});

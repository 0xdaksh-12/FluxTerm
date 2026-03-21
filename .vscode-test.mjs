import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "dist/tests/extension/**/*.test.js",
  mocha: {
    ui: "tdd",
    timeout: 20000,
  },
});

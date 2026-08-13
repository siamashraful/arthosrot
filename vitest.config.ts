import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/integration/**/*.test.ts", "tests/contract/**/*.test.ts"],
    // tests/external is deliberately excluded: it talks to the real Alpaca
    // sandbox and must never run in CI (see docs/architecture/EXECUTION.md).
    exclude: ["tests/external/**", "tests/e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["src/core/**"],
      reporter: ["text", "lcov"],
    },
  },
});

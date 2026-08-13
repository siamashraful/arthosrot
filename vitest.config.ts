import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    // Unit + contract tests always run; DB-backed integration tests only when
    // TEST_DB is set (pnpm test:int — needs a local/CI Postgres).
    include: [
      "src/**/*.test.ts",
      "tests/contract/**/*.test.ts",
      ...(process.env.TEST_DB ? ["tests/integration/**/*.test.ts"] : []),
    ],
    // tests/external is deliberately excluded: it talks to the real Alpaca
    // sandbox and must never run in CI (see docs/architecture/EXECUTION.md).
    exclude: ["tests/external/**", "tests/e2e/**", "node_modules/**"],
    setupFiles: ["tests/integration/setup.ts"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/core/**"],
      reporter: ["text", "lcov"],
    },
  },
});

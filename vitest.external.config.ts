import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * EXTERNAL suite config (tests/external) — talks to the REAL Alpaca sandbox.
 *
 * Deliberately a SEPARATE config: the default vitest.config.ts excludes
 * tests/external so no merge gate can ever depend on live Alpaca
 * (EXECUTION.md testing contract, CLAUDE.md process rules). Running the
 * external suite therefore has to be an explicit, opt-in act —
 * `pnpm test:external` — and never a flag on the normal test command.
 *
 * The suite self-skips when ALPACA_BROKER_KEY/SECRET are absent.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/external/**/*.test.ts"],
    exclude: ["node_modules/**"],
    fileParallelism: false,
    testTimeout: 60_000,
  },
});

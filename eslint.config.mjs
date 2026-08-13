// @ts-check
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";

/**
 * Lint policy (see docs/architecture/MODULE_BOUNDARIES.md):
 *  - dependency direction: app -> server -> core <- infra; worker -> core, infra
 *  - `src/core` imports nothing external (no next/react/drizzle/vendor SDKs)
 *  - vendor types never leave infra adapters
 *  - `process.env` only in src/env.ts
 */
export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "dist/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { boundaries },
    settings: {
      "import/resolver": {
        typescript: { alwaysTryTypes: true },
      },
      "boundaries/elements": [
        { type: "core", pattern: "src/core/**" },
        { type: "infra", pattern: "src/infra/**" },
        { type: "server", pattern: "src/server/**" },
        { type: "worker", pattern: "src/worker/**" },
        { type: "app", pattern: "src/app/**" },
        { type: "components", pattern: "src/components/**" },
        { type: "lib", pattern: "src/lib/**" },
        { type: "env", pattern: "src/env.ts", partialMatch: false },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            ["core", ["core"]],
            ["infra", ["infra", "core", "env"]],
            ["server", ["server", "core", "infra", "env"]],
            ["worker", ["worker", "core", "infra", "env"]],
            ["app", ["app", "components", "lib", "server"]],
            ["components", ["components", "lib"]],
            ["lib", ["lib"]],
          ].map(([from, allow]) => ({
            from: { element: { type: from } },
            allow: allow.map((t) => ({ to: { element: { type: t } } })),
          })),
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/core/*/*", "!@/core/brokers/deterministic"],
              message:
                "Deep imports into core modules are forbidden — use the module's public index.ts export.",
            },
          ],
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Read environment only via src/env.ts (env()).",
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // The one sanctioned home for process.env, plus config files, scripts, and
    // test harnesses that run outside the app (tests configure the environment).
    files: [
      "src/env.ts",
      "*.config.ts",
      "*.config.mjs",
      "playwright.config.ts",
      "scripts/**",
      "tests/**",
    ],
    rules: {
      "no-restricted-properties": "off",
    },
  },
);

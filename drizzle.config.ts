import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/infra/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://ledgerline:ledgerline@localhost:5432/ledgerline",
  },
  strict: true,
  verbose: true,
});

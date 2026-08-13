import { z } from "zod";

/**
 * The single place `process.env` may be read (enforced by lint).
 * Parsed lazily so that unit tests and the Next.js build don't require a full
 * environment; call sites that need a variable get a typed, validated value.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().url().optional(),

  BETTER_AUTH_SECRET: z.string().min(16).optional(),

  BROKER_PROVIDER: z.enum(["deterministic", "alpaca-paper"]).default("deterministic"),
  MARKET_DATA_PROVIDER: z.enum(["fixture", "alpaca"]).default("fixture"),

  ALPACA_BROKER_KEY: z.string().optional(),
  ALPACA_BROKER_SECRET: z.string().optional(),
  ALPACA_DATA_KEY: z.string().optional(),
  ALPACA_DATA_SECRET: z.string().optional(),

  STARTING_CASH: z.coerce.number().int().positive().default(100_000),
  MARKET_BUY_BUFFER: z.coerce.number().min(0).max(0.5).default(0.025),

  CRON_SECRET: z.string().min(16).optional(),
  PORT: z.coerce.number().int().positive().default(8090),

  /**
   * Dev/test only: pin the fixture market OPEN so the deterministic venue
   * fills outside real market hours. Ignored unless both providers are
   * deterministic/fixture; never set in a deployed environment.
   */
  FORCE_MARKET_OPEN: z
    .enum(["0", "1"])
    .default("0")
    .transform((v) => v === "1"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
    }
    cached = parsed.data;
  }
  return cached;
}

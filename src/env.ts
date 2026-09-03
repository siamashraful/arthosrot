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
  /**
   * Canonical public origin (e.g. https://arthosrot.vercel.app). When set,
   * auth pins its baseURL/trusted origin to it instead of trusting the
   * request's own Host header — set it in every deployed environment.
   */
  BETTER_AUTH_URL: z.string().url().optional(),

  BROKER_PROVIDER: z.enum(["deterministic", "alpaca-paper"]).default("deterministic"),
  MARKET_DATA_PROVIDER: z.enum(["fixture", "alpaca"]).default("fixture"),

  ALPACA_BROKER_KEY: z.string().optional(),
  ALPACA_BROKER_SECRET: z.string().optional(),
  ALPACA_DATA_KEY: z.string().optional(),
  ALPACA_DATA_SECRET: z.string().optional(),

  /**
   * Stock-logo upstream: a URL template containing {SYMBOL}. Keyless public
   * CDN (Alpaca's logo API is subscription-gated — INTEGRATIONS.md). Unset
   * (dev/CI) the logos route 404s and the UI shows monogram tiles; no test
   * ever touches an external host.
   */
  LOGO_UPSTREAM: z
    .string()
    .url()
    .refine((u) => u.includes("{SYMBOL}"), {
      message: "LOGO_UPSTREAM must contain {SYMBOL}",
    })
    .optional(),

  // Onboarding starting-cash bounds (whole dollars). The user picks within
  // [MIN, MAX] at account creation; DEFAULT seeds the slider. MAX must stay
  // <= 50_000: the Alpaca sandbox caps transfers at $50k/account/day
  // (INTEGRATIONS.md, verified against the live sandbox).
  STARTING_CASH_MIN: z.coerce.number().int().positive().default(1_000),
  STARTING_CASH_MAX: z.coerce.number().int().positive().max(50_000).default(25_000),
  STARTING_CASH_DEFAULT: z.coerce.number().int().positive().default(10_000),
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

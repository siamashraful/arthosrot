import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import { adjacencyGraphs, dictionary } from "@zxcvbn-ts/language-common";

const passwordStrength = new ZxcvbnFactory({ dictionary, graphs: adjacencyGraphs });
import { env } from "@/env";
import { getDb, schema } from "@/infra/db";

/**
 * Authentication (docs/architecture/adr/ADR-009-auth.md).
 * Email/password with database sessions in our Postgres. The rest of the app
 * touches auth only via getSession() in src/server/session.ts.
 */

/** Server-side strength gate: zxcvbn score >= 3 plus a length floor (FR-1). */
export function passwordIsAcceptable(password: string): boolean {
  if (password.length < 10) return false;
  return passwordStrength.check(password).score >= 3;
}

function buildAuth() {
  {
    const { BETTER_AUTH_SECRET, BETTER_AUTH_URL, NODE_ENV } = env();
    if (!BETTER_AUTH_SECRET) {
      throw new Error("BETTER_AUTH_SECRET is not configured (see .env.example)");
    }
    const instance = betterAuth({
      secret: BETTER_AUTH_SECRET,
      // Pin the origin when configured — origin checks must not trust the
      // request's own Host header in a deployed environment (SECURITY.md).
      ...(BETTER_AUTH_URL ? { baseURL: BETTER_AUTH_URL, trustedOrigins: [BETTER_AUTH_URL] } : {}),
      database: drizzleAdapter(getDb(), {
        provider: "pg",
        schema: {
          user: schema.users,
          session: schema.sessions,
          account: schema.authAccounts,
          verification: schema.verifications,
        },
      }),
      emailAndPassword: {
        enabled: true,
        minPasswordLength: 10,
        requireEmailVerification: false, // email delivery deferred (MVP.md open decision #2)
      },
      session: {
        expiresIn: 60 * 60 * 24 * 30, // 30 days, rolling
        updateAge: 60 * 60 * 24,
      },
      rateLimit: {
        // Auth abuse control in production (SECURITY.md). Disabled in dev/test
        // so E2E suites (several signups per run) aren't throttled.
        enabled: NODE_ENV === "production",
        window: 60,
        max: 10,
      },
      hooks: {
        before: createAuthMiddleware(async (ctx) => {
          if (ctx.path === "/sign-up/email") {
            const password = (ctx.body as { password?: string } | undefined)?.password;
            if (typeof password === "string" && !passwordIsAcceptable(password)) {
              throw new APIError("BAD_REQUEST", {
                message:
                  "Password too weak: use at least 10 characters mixing letters with numbers or symbols.",
              });
            }
          }
        }),
      },
      // NOTE: signup deliberately does NOT provision an account. The user
      // picks their starting cash on the onboarding panel, which calls
      // POST /api/v1/account/provision (FR-2).
      advanced: {
        useSecureCookies: NODE_ENV === "production",
      },
    });
    return instance;
  }
}

let built: ReturnType<typeof buildAuth> | undefined;

export function getAuth() {
  return (built ??= buildAuth());
}

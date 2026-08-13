import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { env } from "@/env";
import { getDb, schema } from "@/infra/db";

/**
 * Authentication (docs/architecture/adr/ADR-009-auth.md).
 * Email/password with database sessions in our Postgres. The rest of the app
 * touches auth only via getSession() in src/server/session.ts.
 */

/** Very small strength gate (no heavy zxcvbn dependency): length + variety + not-common. */
export function passwordIsAcceptable(password: string): boolean {
  if (password.length < 10) return false;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) =>
    r.test(password),
  ).length;
  const common = /^(password|qwerty|letmein|welcome|abc123|iloveyou)/i.test(password);
  return classes >= 2 && !common;
}

function buildAuth() {
  {
    const { BETTER_AUTH_SECRET, NODE_ENV } = env();
    if (!BETTER_AUTH_SECRET) {
      throw new Error("BETTER_AUTH_SECRET is not configured (see .env.example)");
    }
    const instance = betterAuth({
      secret: BETTER_AUTH_SECRET,
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
        enabled: true,
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
      databaseHooks: {
        user: {
          create: {
            after: async (user) => {
              // Signup provisions the paper account (FR-2). Import lazily to
              // avoid a module cycle (container -> ... -> auth).
              const { getContainer } = await import("./container");
              const { Money } = await import("@/core/money");
              const { STARTING_CASH } = env();
              await getContainer().accountService.openPaperAccount(
                user.id,
                Money.fromString(`${STARTING_CASH}.00`),
              );
            },
          },
        },
      },
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

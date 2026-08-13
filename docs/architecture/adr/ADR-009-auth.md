# ADR-009 — Authentication: Better Auth (self-hosted, email/password, DB sessions)

**Status:** accepted (2026-08)

**Context:** Free auth with first-class email/password, sessions we own, and no vendor ceiling.

**Options:** (a) Auth.js/NextAuth — credentials flow is second-class, email/password awkward; (b) Clerk/Auth0 — excellent DX but paid ceilings and user-store lock-in; (c) Better Auth — OSS, TypeScript-first, email/password + sessions in our Postgres, CSRF + rate limiting built in; (d) hand-rolled — rejected (no custom crypto).

**Decision:** (c) Better Auth. Scrypt hashing, HttpOnly/Secure/SameSite=Lax cookies, 30-day rolling revocable sessions, zxcvbn ≥ 3 on signup, built-in auth rate limits. The rest of the app touches auth only through `getSession()`.

**Rationale:** We own the user table and sessions (portable by construction); zero cost at any scale; the single-seam design makes a future swap (SSO, managed auth) a bounded change.

**Consequences:** password reset requires an email provider — deferred pending MVP.md open decision #2 (`EmailProvider` port with noop impl); account-provisioning hook attaches to signup.

**Revisit when:** SSO/compliance requirements appear, or Better Auth's maintenance trajectory changes.

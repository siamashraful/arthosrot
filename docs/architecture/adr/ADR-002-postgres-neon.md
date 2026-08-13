# ADR-002 — PostgreSQL on Neon free tier

**Status:** accepted (2026-08)

**Context:** Need a system of record with NUMERIC types, CHECK constraints, row locks, and transactional guarantees — free at MVP, portable later.

**Options:** (a) SQLite (Turso/libsql); (b) Supabase Postgres; (c) Neon Postgres; (d) MySQL/PlanetScale.

**Decision:** (c) Neon free tier, via standard Postgres features only.

**Rationale:** Financial integrity leans on Postgres strengths: NUMERIC precision, `SELECT … FOR UPDATE`, partial unique indexes, grant-based append-only tables. Neon's free tier (0.5GB, scale-to-zero, branch-per-preview GitHub integration) fits the MVP; Supabase would tempt coupling to its auth/realtime stack, which we deliberately keep independent. No Neon-specific SQL is allowed, so exit = `pg_dump` + repoint `DATABASE_URL`.

**Consequences:** cold starts (~500ms) accepted and absorbed by loading states — **no keep-alive pings**; 0.5GB cap monitored; Neon is allowed to sleep.

**Revisit when:** storage exceeds ~0.4GB or an always-on requirement appears (Neon Launch $19 or any Postgres host).

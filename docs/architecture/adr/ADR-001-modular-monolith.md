# ADR-001 — Modular monolith with framework-free core, two entrypoints, one codebase

**Status:** accepted (2026-08)

**Context:** A paper-trading platform needs clean domain boundaries, financial correctness, and future extraction options (dedicated backend, native apps) — at prototype scale, on free infrastructure, buildable largely by AI agents.

**Options:** (a) microservices; (b) plain monolith with logic in Next.js routes; (c) modular monolith: framework-free `src/core` domain, `infra` adapters, thin `server`/`app` delivery, plus a second tiny entrypoint (`src/worker`) from the same codebase.

**Decision:** (c).

**Rationale:** Microservices buy nothing at this scale and multiply free-tier hosting problems. Logic-in-routes couples the domain to Next.js and makes invariants untestable in isolation. The modular monolith keeps one dependency graph and one deploy pipeline while lint-enforced boundaries (MODULE_BOUNDARIES.md) preserve extractability: re-hosting `server` + `core` + `infra` behind Fastify/Hono needs no domain changes. The worker exists only because an outbound SSE subscription needs a long-lived process (ADR-010) — it is an entrypoint, not a service.

**Consequences:** boundary lint config must stay healthy (probe-tested); no workspace tooling until a real second package exists; `core` cannot use framework conveniences (deliberate).

**Revisit when:** a genuine second product surface (native app backend) or team scaling makes package extraction worthwhile.

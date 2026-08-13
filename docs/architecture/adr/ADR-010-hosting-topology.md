# ADR-010 — Hosting topology: Vercel web + Render Free worker + scheduled reconciliation; adaptive polling to the browser

**Status:** accepted (2026-08)

**Context:** Broker events arrive over a long-lived outbound SSE connection that serverless platforms cannot hold. Users must see order updates without refreshing. Budget: $0/month. Research (2026-08): Fly.io free tier discontinued; Render Free = 750 h/mo but sleeps after 15 min without inbound traffic (~30–60s wake); Koyeb Free similar (1h idle); Oracle Always Free VM is truly always-on but operationally heavier (card at signup, self-managed VM).

**Decision:**

1. **Web on Vercel Hobby** (standard Next.js; no Vercel APIs in core).
2. **Worker on Render Free** — same codebase, `src/worker` entrypoint; holds the SSE subscription, applies canonical events, runs reconciliation; HTTP surface `/healthz` + `/reconcile`.
3. **GitHub Actions schedule** (market hours, ~10 min) POSTs `/reconcile` — genuine reconciliation that also wakes a slept worker before the open. **No artificial anti-sleep traffic anywhere** (Neon and Render are allowed to sleep; the schedule exists for its reconciliation function).
4. **Sleep-gap safety is protocol-level:** the SSE stream is replayable via stored ULID cursors, so any gap is recovered exactly-once; worst-case event latency is bounded by the reconciliation cadence and disclosed in the UI.
5. **Browser updates via adaptive polling** (TanStack Query: open orders at 2s while any order is non-terminal, else paused; quotes 10–15s in-hours) — the simplest free-tier mechanism satisfying "no manual refresh" on serverless. SSE push from the worker is the documented upgrade path.

**Rationale:** This is the minimum topology satisfying broker-pushed events + near-real-time UX + $0. A single deployable was preferred but no serverless platform can hold the outbound stream; a 5-minute scheduler as the _primary_ delivery path was explicitly rejected.

**Consequences:** `render.yaml` in-repo; Render's non-persistent disk is irrelevant (all state in Postgres); Vercel Hobby's non-commercial terms tracked in MVP.md open decisions.

**Revisit when:** the project outgrows $0 (Render starter ~$7 or a $5 VPS removes sleep entirely), needs sub-second delivery around the clock, or Cloudflare-class platforms gain viable long-lived outbound connections on free tiers.

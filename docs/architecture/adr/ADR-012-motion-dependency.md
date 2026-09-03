# ADR-012 — Motion library: `motion` in the client/UI layer

**Status:** accepted (2026-09)

**Context:** The bright-ledger visual pivot (BRAND.md §3, §8) calls for springs on sheets, tap feedback on pills and primary buttons, and mount-only staggered entrances on stat tiles and list rows. The previous system was CSS-keyframe only, which cannot produce interruptible springs — a sheet dismissed mid-open snaps or replays rather than reversing. CLAUDE.md requires an ADR note for any new dependency, and the brand carries a standing law that motion must never comment on financial outcomes.

**Decision:**

1. **Add `motion@13.2.0`** (framer-motion's successor) as a runtime dependency, imported **only from client/UI code** (`src/components`, `src/app` client components). It never appears in `src/core`, `src/server`, `src/infra`, or `src/worker` — the module-boundary lint rules are the enforcement.
2. **A global `<MotionConfig reducedMotion="user">` is mandatory** at the app root. Every `motion` animation therefore honours `prefers-reduced-motion` without per-component opt-in; the CSS keyframes in `globals.css` are gated by the same media query.
3. **Motion never encodes financial meaning.** Springs and staggers apply to chrome, overlays, and structural entrance only. Entrances are mount-only and never re-triggered by data; a refreshed value does not move.
4. **No celebratory motion on outcomes** — no confetti, streaks, count-ups, glows, or success flourishes on fills, gains, losses, or the paper→live graduation. **This is review-blocking**, the same standing as the colour laws.

**Rationale:** Interruptible, velocity-preserving springs are the one thing the pivot needs that CSS cannot supply, and `motion`'s hybrid engine delegates to native WAAPI where it can, keeping the main-thread cost small. A single library with a single global config makes the reduced-motion guarantee structural rather than a per-component discipline.

**Alternatives:**

- **CSS-only** (keyframes + `transition`) — rejected: no interruptible springs, no gesture-driven `whileTap` with spring return, and layout-dependent sheet motion becomes fragile.
- **react-spring** — rejected: larger footprint for the same effect set, no built-in reduced-motion config, and no WAAPI delegation.
- **Radix/Headless UI transitions** — rejected: the app deliberately uses native `<dialog>` and no Radix (ADR-011 surfaces, DESIGN.md).

**Consequences:** ~5 kB gzipped added to the client bundle for the used subset (`motion/react`: `motion.*`, `MotionConfig`, `AnimatePresence`). Native `<dialog>` is kept — the spring runs on an inner wrapper, so focus trapping, Esc, and `::backdrop` stay native. Reviewers gain one more check per UI PR: is any new animation attached to a financial value or outcome? If yes, it is rejected.

**Revisit when:** `motion` changes its reduced-motion contract or its bundle materially grows; the View Transitions API can express interruptible sheet springs natively; or a Read-register surface (lessons) needs scroll-driven motion, which this ADR does not cover.

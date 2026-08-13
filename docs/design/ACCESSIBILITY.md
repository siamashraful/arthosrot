# Accessibility

> **Purpose:** the WCAG 2.2 AA strategy, built into the component system rather than bolted on.
> **Audience:** UI implementers/reviewers. **Belongs here:** the a11y contract. **Lives elsewhere:** tokens (DESIGN_SYSTEM.md), per-screen behavior (UX_PATTERNS.md).

Target: WCAG 2.2 AA. Enforced in the component layer + CI (axe-core scans on core pages fail the build on serious/critical).

- **Contrast:** token pairs verified ≥ 4.5:1 body / ≥ 3:1 large text in both themes by a CI script over the token file — not by eyeballing.
- **Keyboard:** full paths for search → instrument → ticket → confirm, and order cancel flows; visible focus ring (2px accent, offset); no keyboard traps; Radix primitives provide dialog/menu/tab semantics.
- **Color independence:** gains/losses always carry sign and (in tables) ▲/▼ with `sr-only` "up"/"down" text; order states are labeled badges, never color-only dots.
- **Live regions:** order-status changes and toasts announce via `aria-live="polite"` — genuinely exercised by the async execution lifecycle.
- **Forms:** real `<label>`s; errors linked via `aria-describedby`; zod messages surfaced as text, not color alone.
- **Tables:** `<th scope>`, captions; the < md list-item variant uses proper list semantics.
- **Charts:** canvas charts are decoration-plus — a "View data" `<details>` table fallback carries the same information.
- **Motion:** every animation has a `prefers-reduced-motion` alternative (crossfade/instant).
- **Touch:** targets ≥ 44px; bottom-sheet drag affordances are optional, buttons always present.
- **Numbers:** tabular numerals and consistent decimal places make figures scannable for low-vision users.

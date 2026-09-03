# Accessibility

> **Purpose:** the WCAG 2.2 AA strategy, built into the component system rather than bolted on.
> **Audience:** UI implementers/reviewers. **Belongs here:** the a11y contract. **Lives elsewhere:** tokens (DESIGN_SYSTEM.md), per-screen behavior (UX_PATTERNS.md).

Target: WCAG 2.2 AA. Enforced in the component layer + CI (axe-core scans on core pages inside `pnpm test:e2e` fail the build on serious/critical).

- **Contrast:** `pnpm check:contrast` verifies **50 token pairs** over `src/styles/tokens.css` — not by eyeballing. Per theme (light + dark): ink/bg 7 · ink/surface 7 · ink-muted/bg 4.5 · ink-muted/surface 4.5 · accent/bg 4.5 · on-accent/accent 4.5 · gain/bg 3 · loss/bg 4.5 · warning/bg 3 · on-hero/hero 7 · hero-muted/hero 4.5 · gain-on-hero/hero 3 · loss-on-hero/hero 4.5 · chart-line-on-hero/hero 3 · on-pop-{coral,teal,amber,blue}/pop-\* 4.5 · ink/glass-bg-solid 4.5 · ink-muted/glass-bg-solid 4.5; plus the five on-hero pairs re-run on both live-mode composites. **Never weaken pairs — extend them.** Text on glass is verified against the solid fallback, which is the worst case any translucent chrome can land on.
- **Mode independence:** paper/live is signalled three ways (texture grain, hero depth+chroma, the `role="note"` text ribbon) — never colour alone. Removing any one is review-blocking (BRAND.md §5).
- **Keyboard:** full paths for search → instrument → ticket → confirm, and order cancel flows; visible focus ring (2px `--focus-ring`, offset) on every control including glass chrome; no keyboard traps; native `<dialog>` provides focus trapping and Esc; `.segmented` groups use `aria-pressed`.
- **Color independence:** gains/losses always carry sign and (in tables) ▲/▼ with `sr-only` "up"/"down" text; order states are labeled badges, never color-only dots; pop-coloured tile chips are decorative — the label text carries the category.
- **Live regions:** order-status changes and toasts announce via `aria-live="polite"` — genuinely exercised by the async execution lifecycle. The status banner is `role="status"`.
- **Forms:** real `<label>`s; errors linked via `aria-describedby`; zod messages surfaced as text, not color alone.
- **Tables:** `<th scope>`, captions; the ≤767px `.list-row` collapse keeps proper list semantics.
- **Charts:** canvas charts are decoration-plus — a "View data" `<details>` table fallback carries the same information; the hero curve's hover readout is mirrored in that table.
- **Motion:** `<MotionConfig reducedMotion="user">` plus the `prefers-reduced-motion` media query make every spring, stagger, and keyframe instant. Entrances are mount-only and never data-triggered, so a value never moves while being read.
- **Transparency:** `prefers-reduced-transparency: reduce` and `@supports not (backdrop-filter)` swap `.glass` to `--glass-bg-solid` with no filter.
- **Touch:** targets ≥ 44px (`.btn`, `.input`, `.nav-link` min-height; `pointer: coarse` bumps row hit areas); bottom-sheet drag affordances are optional, buttons always present.
- **Numbers:** tabular numerals and consistent decimal places make figures scannable for low-vision users; the hero figure is 40px/700 so the headline number is legible at arm's length.

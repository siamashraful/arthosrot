# ADR-013 — Adopt the Arthosrot Design System as the source of truth for the UI

**Status:** accepted (2026-09). Supersedes ADR-012.

**Context:** A canonical design system for Arthosrot now exists as a Claude Design artifact — <https://claude.ai/artifact/H15gE6qMYiLEQqbMFdiuXh> ("Arthosrot Updated Design System"): a brand book (`README.md`), a full token set with usage notes and measured contrast ratios (`tokens.json`), a component stylesheet (`components/bundle.css`, prefix `ar-`) and per-component guidelines. Until now the app's visual language lived only in this repo (the "bright ledger": OKLCH tokens, glass chrome, Anek, spring motion via `motion`), so design and code could drift and every design session re-derived the rules. The system's direction contract (colour-block clarity; one hero card; bloom = category; lime = selection; green/red = P&L only; no gradients, glass or card shadows; no page-load choreography) is also a closer fit to the product's register — calm, credible, honest — than the energetic pivot it replaces. CLAUDE.md requires an ADR note for dependency changes and forbids design-token bypasses.

**Decision:**

1. **The design system is the source of truth.** `src/styles/tokens.css` is the artifact's `tokens.json` copied verbatim (every colour as bare hex, the type scale, spacing, radius, shadow, size, duration, easing); the bottom section of `src/styles/globals.css` is `components/bundle.css` copied verbatim and is the class contract every component renders. **A visual change is made in the artifact first, then re-copied** — never the other way round.
2. **App-shell extensions** are the only CSS the app authors, in the top section of `globals.css`, built from the system's tokens and idioms: the desktop sidebar (`.shell-nav`/`.nav-link`), the phone `.bottom-nav` and `.mobile-top-bar` (the system's TabBar/AppBar), `.data-table` for wide screens, native `dialog.sheet` styled as BottomSheet/Dialog, the `.mode-ribbon`, the `.status-banner`, `.explainer`, auth and onboarding pieces, and the `[data-mode="live"]` token overlays (the paper/live system of BRAND.md §5 and ADR-011, which the design system does not define).
3. **Figtree replaces Anek** for UI text (400/600/700, self-hosted in `public/fonts/`). The bilingual lockup remains outlined SVG and is unaffected.
4. **The `motion` dependency is removed** (ADR-012 superseded). The system forbids page-load choreography; CSS transitions at 150–250ms `ease-out-expo` from an already visible state cover every remaining interaction (press, selection, sheet open, fill bar). No entrance animation on data. The rule that motion never encodes financial meaning stands.
5. **The contrast gate reads the system's hex.** `scripts/check-contrast.ts` parses bare hex (and still oklch, for safety), and its 78 pairs are the system's own usage notes verified by computation, plus the hero pairs under both live-mode composites.
6. **Legacy class names** (`.card`, `.btn*`, `.input`, `.badge*`, `.segmented`, `.hero-card`, `.empty-state`, `.list-row`, `.skeleton`) are aliased onto the system's rules **only so that existing test selectors keep working**. New markup uses the `ar-` names.
7. **One documented system exception is not taken:** white text on the mustard tile (1.55:1). The app renders Cash on the paper-and-tint tile (`.ar-ptile` + butter icon chip) because the axe scan in e2e would fail, and the gate checks `on-bloom` only on cobalt and violet.

**Rationale:** One canonical artifact, consumed verbatim, removes the drift between what was designed and what shipped, makes the app's stylesheet reviewable against a named source, and lets design work happen in the tool built for it. Copying rather than importing keeps the build free of a network dependency and keeps `check-contrast` a pure text gate. Dropping `motion` removes ~5 kB and a whole class of review questions ("is this animation attached to a value?") because the system no longer allows the animations that raised them.

**Alternatives:**

- **Keep the bright ledger and reconcile by hand** — rejected: two sources of truth, and the glass/spring language contradicts the system's Refuse list.
- **Load the artifact's `bundle.js` components at runtime** — rejected: the app's components are React with financial invariants and accessibility semantics the bundle's DOM-mounting API does not carry; the stylesheet is the contract, not the JS.
- **Keep `motion` for sheets only** — rejected: native `<dialog>` with a 250ms CSS `sheet-up` meets the system's spec; a dependency for one transition is not justified.

**Consequences:**

- **Re-sync procedure** when the artifact changes: read the artifact (Artifact tool `read`, `project/tokens.json` and `project/components/bundle.css`); re-copy tokens into the light `:root`, the `[data-theme="dark"]` block and its `prefers-color-scheme` duplicate, keeping the block order the contrast script slices on; replace the "verbatim" section of `globals.css`; run `pnpm check:contrast`, `pnpm test:e2e` (axe), and the visual check in both themes at 390px and 1360px; update DESIGN_SYSTEM.md's tables. Do not edit inside the verbatim section — put app-specific rules in the app-shell section.
- The `[data-mode="live"]` overlays and the `--mode-texture-opacity` / `--ribbon-h` tokens are app additions and must be preserved through every re-sync; removing a mode signal is review-blocking.
- Legacy aliases will be deleted once tests select on `ar-` names; nothing new may depend on them.
- Reviewers gain a simpler check per UI PR: is every value a token from the artifact, and is every class either in the verbatim section or in the app-shell section?

**Revisit when:** the artifact grows a first-party export the app can consume directly (a versioned package or a build step) — then copying gives way to importing; the design system adds components that replace app-shell extensions (a desktop shell, a table); or a Read-register surface (lessons) needs typography or motion the system does not define.

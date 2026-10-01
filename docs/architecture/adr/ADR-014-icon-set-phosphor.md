# ADR-014: Phosphor Duotone as the app's icon set

- **Status:** accepted (2026-10-01)
- **Deciders:** product owner (explicit request), engineering
- **Supersedes:** the icon clause of ADR-013 (design-system adoption) — the rest of ADR-013 stands

## Context

ADR-013 adopted the Arthosrot Claude Design system, including its own Lucide-style icon set (`Arthosrot.icon`, 24px, 1.75px stroke). In use, the owner judged those glyphs — and the app-drawn extensions for sectors and money concepts — generic, and asked for a professionally designed, consistent set "with character" that fits a modern fintech app. Three candidates were compared side by side on the app's own chips (light and dark): Phosphor Duotone, Phosphor Bold, Solar Bold Duotone.

## Decision

Use **Phosphor** (`@phosphor-icons/react`, MIT, ~9k glyphs, all weights) in the **duotone** weight for pictorial glyphs, behind the existing semantic wrapper `src/components/icons/Icon.tsx`:

- Call sites keep semantic names (`<Icon name="cash" />`); the wrapper maps names to Phosphor glyphs — changing the set again is one file.
- Weights: **duotone** for pictorial glyphs (places, money, asset classes, sectors); **regular** for controls (chevrons, arrows, ×, check, plus/minus) — a duotone fill makes a caret read as "play"; **bold** for small typographic glyphs ≤ 16px (delta arrows, status tags); **fill** for an "on" state (watchlist star).
- Imported from `@phosphor-icons/react/dist/ssr` (works in server and client components; named imports tree-shake to the ~60 glyphs used).
- Everything else in the design system still applies unchanged: sizes (24 default, 22 in 40px chips, 18/14 in `--sm`/`--xs` chips), chip semantics (category vs semantic), colour rules, `aria-hidden` decorative icons.

## Alternatives

- **Keep the system set + app extensions** — rejected by the owner (generic).
- **Phosphor Bold** — strong but closer to the generic stroke look; less character.
- **Solar Bold Duotone** — popular fintech look, but CC BY 4.0 (needs on-screen attribution) and patchier coverage of the concepts we need.

## Consequences

- A new runtime dependency (`@phosphor-icons/react`); `lucide-react` stays removed. One icon library remains the rule — no mixing.
- Documented as a deliberate deviation from the Claude Design system in docs/design/DESIGN.md and DESIGN_SYSTEM.md (Iconography).

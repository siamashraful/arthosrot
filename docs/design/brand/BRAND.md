# Arthosrot — brand identity

> **Purpose:** the durable identity decisions for Arthosrot: name, mark, the design system that IS the visual brand, and how the brand signals the difference between practice and real money.
> **Audience:** anyone building or reviewing a surface. **Status:** ADOPTED — `src/styles/tokens.css` and `src/styles/globals.css` are the design system made executable (ADR-013); the as-built record is [../DESIGN.md](../DESIGN.md).
> **Belongs here:** identity decisions and their reasons. **Lives elsewhere:** the token tables and class contract (design/DESIGN_SYSTEM.md), product truth (PRODUCT.md), realism limits (LIMITATIONS.md), a11y method (design/ACCESSIBILITY.md), the adoption decision (architecture/adr/ADR-013-design-system-adoption.md).

---

## 1. The name

**Arthosrot** · **অর্থস্রোত** · /ˈɔr.t̪ʰo.srot̪/ — _OR-tho-srot_

From অর্থ (_ortho_) + স্রোত (_srot_). The compound reads **"the current of wealth"** — money as something that moves and can be watched moving, not a balance that sits.

The second reading is the one the product is actually built on: অর্থ also means **meaning**. অর্থস্রোত reads equally as **a current of meaning** — and making the market _mean something_ to someone who has never traded is the platform's first job, not a side effect.

**Locked decisions**

|               |                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------- |
| Romanisation  | `Arthosrot` — one spelling, everywhere. Not _Arthasrot_, _Orthosrot_, _ArthoSrot_, or _Artho Srot_. |
| Bengali       | `অর্থস্রোত` — one orthographic word, no space, conjuncts র্থ and স্রো intact.                       |
| Casing        | Sentence case in prose. Never all-caps in body copy; the wordmark carries its own case.             |
| Legal/product | Replaces "Ledgerline" everywhere, including package name, DB comments, and docs.                    |

---

## 2. What the brand has to do

Arthosrot is an **on-ramp into equity trading**: it teaches the mechanics, lets people practise them against a real venue with no risk, and is built to carry them into real-money trading when they're ready. Three jobs, one continuous arc — **learn → practise → trade** — and the identity has to hold all three without changing character between them.

Underneath, the product principle is unchanged and non-negotiable: **financial correctness above everything, and honesty over illusion.** Simulated money is labelled persistently, freshness is always visible, execution price is shown separately from quoted price, and the product never pretends a balance mutation is a trade.

The brand is judged on two questions:

1. **Does this look like a place that would refuse to fake a fill?**
2. **Would a beginner leave here understanding more, and believing less?**

The second question rules out an entire commercial playbook: streaks, confetti, leaderboards, "you beat the market" badges, push notifications about hot stocks. Those are the standard tools for activating new traders and they are precisely what turns a learner into a gambler. **Arthosrot does not use them.** That is a brand commitment, not a preference.

---

## 3. The design system IS the brand

The visual identity is the **Arthosrot Design System**, a Claude Design artifact: <https://claude.ai/artifact/H15gE6qMYiLEQqbMFdiuXh> ("Arthosrot Updated Design System"). It is the **source of truth** — its `README.md` is the brand book, its `tokens.json` the palette and scale, its `components/bundle.css` the component contract. Change it there first; the app copies from it (ADR-013). What follows is a summary so a reviewer can work without opening the artifact; where the two differ, the artifact wins.

### Direction contract

- **Thesis: colour-block clarity.** Money lives on a calm neutral ground so that the few saturated colours mean something. The category default this refuses is the dark-first neon trading terminal.
- **Own world:** a light, slightly cool off-white canvas carrying white cards and **one near-black hero card per screen**; saturated flat colour blocks as category containers and icon chips; a lime accent reserved for selection and brand moments; green and red reserved exclusively for gain and loss. Pill buttons, 20px card radius, hairline separation instead of borders, no gradients, no glass.
- **Story:** the user reads total wealth and today's change in one glance, sees each account as a tile with its own performance, and reaches a trade in two taps. They leave feeling informed, not activated.
- **Register:** Operate — people complete tasks with real money, so scanability, consistency and native expectations outrank expression. The brand lives in precise details, not decoration.

### Colour

Every surface and text uses a **role token** that switches with the theme: `bg`, `surface`, `raised`, `text`, `text-secondary`, `text-tertiary`, `divider`, `hero`, `on-hero`, `on-hero-secondary`, `primary`, `on-primary`, `scrim`, `pressed`. The literal neutrals (`ink`, `graphite`, `slate`, `hairline`, `canvas`, `paper`; `canvas-dark`, `surface-dark`, `surface-raised`, `text-on-dark`, `text-secondary-dark`, `slate-dark`, `hairline-dark`) are what those roles resolve to.

- **Neutral ground.** Cards are `surface` on `bg` with no border and no shadow. Rows separate with a 1px `divider`; inputs get a 1px `divider` border. In dark, elevation is a surface step (`bg` → `surface` → `raised`), never a shadow.
- **The hero card.** One per screen: `hero` fill with `on-hero` text (ink with paper text in light). In dark it sits on `surface-dark`, the same ground as every other card; its weight comes from the display numeral and the quick-action pills. Its delta uses `hero-gain` / `hero-loss`.
- **Primary inverts.** `primary` is ink in light and paper in dark; `on-primary` the reverse. Primary buttons and the centre Trade disc are the only things that use it.
- **Semantic is reserved.** `gain` and `loss` appear only in values, deltas, arrows, status tags, chart area fills and the final buy or sell confirmation — never as decoration, tile fills or illustration. Every delta carries sign, arrow and colour at once. The full hues clear only 3:1 on paper, so **text under 24px is set in `gain-text` / `loss-text`**; tint chips pair `-text` on `-tint`. `warning` (with `warning-tint`, `warning-text`) marks pending states and caution; `info` (`info-tint`, `info-text`) marks notices.
- **Lime is selection and focus.** `lime` marks the selected tab indicator, the focus ring (2px, 2px offset, every interactive component), the active toggle, the chart scrubber handle and brand marks on ink. Never P&L, never beside a gain value, never text on light (`lime-deep`; `lime-text` picks the right one per theme).
- **Bloom is category.** `cobalt` Stocks · `violet` ETFs and managed portfolios · `tangerine` Options · `blush` Crypto · `mustard` Cash. Each has a tint (`sky`, `lavender`, `peach`, `rose`, `butter`) for 40px icon chips, tags and row avatars, with the icon in the hue (`tangerine-deep`, `blush-deep`, `mustard-deep` on light tints) and text in `on-tint`. A saturated bloom may own a whole tile with `on-bloom` (white) text; the system documents mustard (1.55:1) as a stated exception — **the app does not take it** (DESIGN.md). Bloom never encodes direction, status or urgency.
- **Dosage per screen:** at most one hero card and two saturated bloom blocks in view (a third tile peeking as scroll affordance does not count); tints are unlimited. The screen never tints by portfolio direction.
- **Charts:** line in `chart-line`; area fill `gain-tint` / `loss-tint` by period direction; scrubber handle `lime`; gridlines `divider`; comparison series `cobalt` and `violet`.

### Type

One family, **Figtree**, in 400, 600 and 700 only. No second family, no serif, no monospace. Money and data use `tabular-nums`. The bilingual lockup is outlined SVG and needs no font.

The 8-style scale: `display` 40/44/700/−0.02em (hero balance, ticket amount) · `title` 28/34/700/−0.015em (screen titles, stock price) · `heading` 20/26/600/−0.01em (section headings, tile balances) · `body` 16/24/400 · `body-strong` 16/24/600 (row titles, button labels) · `label` 14/20/600 (tabs, form labels, chips) · `caption` 13/18/400 (timestamps, helper text) · `micro` 12/16/600/0.02em (tags, tickers; tracking never wider than 0.04em). Money values wrap rather than truncate.

### Spacing, shape, elevation

- 4pt base; `space-4` … `space-48`; `gutter` 20; `card-padding` 20, `card-padding-compact` 16. More space above a heading (24) than below it (12).
- Radius: `radius-pill` 999 (buttons, chips, tags) · `radius-input` 12 · `radius-chip` 12 (40px icon chips) · `radius-card` 20 · `radius-hero` 24 · `radius-sheet` 28 (sheet top corners).
- **No shadows on cards.** `shadow-float` (0 8px 24px rgba(18,20,23,0.12)) only for floating elements — sheets, tab bar, toasts — and only in light; none in dark, where elevation is a surface step. Never a zero-offset halo, never a hard offset block.
- Borders: 1px `divider` only on inputs and between rows; never a coloured left or right stripe.

### Iconography

One library (Lucide-style), 24px, 1.75px stroke, rounded caps and joins. Category icons sit in 40px rounded-square chips (`IconChip`): tint fill, icon in the category hue. No emoji, no mixed icon styles. Illustration is flat geometric shapes in bloom colours, onboarding and empty states only.

### Motion

Transitions 150–250ms (`duration-fast`, `duration-base`) with `ease-out-expo`, always from an already visible state; **no page-load choreography**. Balance changes may roll digits over 300ms (`duration-roll`). Under reduced motion, rolls and slides become fades. Celebration is quiet: a success state is a `gain-tint` checkmark and the fill summary. No streaks, badges, confetti, countdowns or "nice trade" copy anywhere.

### Voice

Bengali in identity, English in the interface, one register throughout: **precise, plain, and never reassuring about outcomes.**

> **Encourage understanding. Never encourage outcomes.**

- Sentence case everywhere; no all-caps headings, no eyebrows or kicker labels, no section numbering in the UI.
- Verbs on buttons ("Deposit", "Review order"). One primary action per screen or sheet.
- Money as `$48,210.55`; deltas as `+$612.40 (1.29%)` with the sign always present, plus arrow, plus colour. Two-decimal percentages.
- Explain the mechanism, never predict the outcome. Teach in place. Define a term on first use, once. Never "simply" or "just".
- State the state: "Partially filled — 4 of 10" beats "Almost there!". Simulation is labelled every time, in plain words.
- When something is degraded, say what and since when. Never a spinner pretending to be live.

### Refuse

Gradients (including gradient text) · glass or blur as decoration · coloured left or right stripes on cards · nested cards · same-size icon-heading-text card grids as page structure · eyebrows or kicker labels · section numbering in the UI · emoji as icons · a second typeface · monospace for "technical" flavour · hard offset shadows · halo shadows · sparklines as decoration · full-screen colour tinting by portfolio direction · dark-first by default · streaks, badges, confetti, countdown pressure.

---

## 4. Logo system

### The mark — "the float"

A square of plain weave. Alternate picks pass **under** the warp (notched) and **over** it (unbroken) — real plain-weave alternation, not stripes. The last two picks stop short, so one corner is still open.

At a glance it's cloth. Read closely it's the order state machine — **filled, partially filled, resting** — in one figure. It is also, for a beginner, a picture of the thing they are: mid-progress, and that being normal. The mark predates the design system and survives it unchanged: it works as pure structure.

| Asset                                            | Use                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| [`mark.svg`](mark.svg)                           | Identity mark, 5 warps × 6 picks. **32px and up.**                             |
| [`mark-compact.svg`](mark-compact.svg)           | Same weave, 3 warps × 4 picks. **24px and below** — favicon, avatar, app icon. |
| [`wordmark-latin.svg`](wordmark-latin.svg)       | Latin wordmark alone                                                           |
| [`wordmark-bn.svg`](wordmark-bn.svg)             | Bengali wordmark alone                                                         |
| [`lockup-horizontal.svg`](lockup-horizontal.svg) | **Primary lockup.** Mark + bilingual wordmark. Default everywhere.             |
| [`lockup-stacked.svg`](lockup-stacked.svg)       | Centred contexts: splash, auth pages, share cards                              |

All assets are **outlined vector** — no font needed at render time — and use `currentColor`, so one `color` drives them and both themes work with no variants. The Bengali line contains two conjuncts and a reordered vowel sign; it was shaped with HarfBuzz and outlined. **Never re-set the wordmark as live `<text>`.**

### Rules

- **Clear space:** one warp pitch (⅛ of the mark's width) on every side.
- **Minimum sizes:** identity mark 32px; compact mark 16px; horizontal lockup 40px tall. Below 16px use a solid ink tile.
- **Colour:** `--text` on the canvas and surfaces, `--on-hero` on the hero card, `--lime` only as a brand mark on ink. One colour only.
- **The logo never changes between account modes.** Mode is signalled by the surface, never by swapping the mark — a logo that changes meaning is a logo nobody can rely on.
- **Never:** recolour to gain/loss/warning or to any bloom colour · rotate or shear · add gradient, glow, or shadow · outline it · re-space the bilingual lockup · re-set the wordmark in any typeface · **fill the open corner.**

The open corner is the idea. Completing it turns the mark into a plain grid and throws away the only thing it says.

---

## 5. Practice and real money — the mode system

**This is the highest-severity design problem in the product.** Once real trading exists, a user who believes they are in practice while placing a real order — or the reverse — has been failed in a way no amount of polish compensates for.

> **Implementation status: presentation implemented (ADR-011).** `data-mode="live"` is set client-side by the Settings trading-mode switch and drives all three signals; live surfaces render only their own empty states. No live-trading BACKEND exists, and none may be added without a human-approved ADR (CLAUDE.md safety rules; `accounts.mode` is PAPER-only at the DB level). **One deliberate deviation while live is a preview:** the persistent label reads "Live preview — real trading isn't available yet" instead of the final "Live — real money" — the label must never claim real money before real money exists.

The identity carries it in the card: **practice is a card with a grain you can feel; real money is a smooth, deeper one.**

|                  | Practice (PAPER)                                         | Real money (LIVE)                                            |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| Texture grain    | **Visible** — `--mode-texture-opacity: 1`                | **Absent** — `--mode-texture-opacity: 0`                     |
| The hero card    | The system's `hero`: ink (light) / `surface-dark` (dark) | **Pure black `#000000` in both themes** — a step below       |
| Persistent label | "Practice — simulated money" (info-tint Banner strip)    | "Live preview — real trading isn't available yet" (on black) |

Three redundant signals, and **the mode is never carried by colour alone**:

1. **Texture** — a fine grain drawn on practice surfaces (the hero card, the mode ribbon) via `--mode-texture-opacity`; `[data-mode="live"]` zeroes that one variable and the grain disappears everywhere it is drawn. Survives greyscale and colour-blindness.
2. **Depth** — the live hero is pure black in both themes, one step below the practice hero (ink in light, `surface-dark` in dark). A card that is merely a little darker is not a safety signal; black is unambiguous against both.
3. **A persistent text ribbon** (`role="note"`) — the only signal that survives a screenshot, a screen reader, and a colour-blind user simultaneously. In practice it is the system's **Banner in the info tint**; in live it takes the live hero's black with `on-hero` text.

**Removing any one of the three is a review-blocking change.** Confirmation copy for a real order must name the mode in words ("This places a real order with real money"), never rely on the surface.

### The graduation must not flatter

The most dangerous moment in this product is the one it is designed to produce: a user moving from practice to real money. Paper performance does not predict live performance — it lacks slippage at scale, emotional pressure, and the discipline cost of real loss, all documented in LIMITATIONS.md.

**Brand rule: never imply that practice results forecast real results.** No "you're ready" badges, no simulated-return leaderboards, no upgrade prompt triggered by a winning streak, no motion on the switch itself. The graduation offer is neutral, always available, and never celebratory.

---

## 6. Honest risks

- **Mode confusion is the severe one.** Everything else on this list is a quality problem; this one loses someone's money. The three-signal system is the mitigation, and it needs an automated test, not a guideline.
- **Overconfidence transfer.** Making practice feel real is the core function and the main hazard. §5 constrains the graduation; the honest mitigation is editorial — LIMITATIONS.md has to be _read_.
- **Bloom reading as a rainbow grid.** Five category colours next to each other are a sticker sheet unless each colour _means_ a category. The dosage rule (one hero, two saturated blocks) and fixed category roles are the mitigation; never colour tiles by position.
- **Refusing the activation playbook has a cost.** No streaks, no confetti, no push alerts means measurably worse retention than competitors who use them. That trade is deliberate; it must not be quietly reversed by a growth experiment.
- **The weave can read as a barcode** at small sizes and low contrast. The compact mark is the mitigation; below 16px use a solid ink tile.
- **Untested with Bengali readers.** The romanisation and the wordmark's letterfit are judgement. Worth one native reader.
- **Real trading is a regulatory question this document cannot answer.** Licensing, suitability, disclosures, and the rules on presenting anything that resembles advice will constrain the voice and the surfaces far more than taste will.

---

## 7. Provenance

- The mark and name were selected under the original loom direction (2026-09); the bright-ledger pivot replaced its costume; the **Arthosrot Design System** (Claude Design, 2026-09) then replaced the bright ledger wholesale — Figtree for Anek, hex role tokens for OKLCH, flat surfaces for glass, CSS transitions for spring motion — keeping the mark, the mode system and every safety law intact (ADR-013).
- Typeface: **Figtree** (Erik Kennedy), SIL Open Font License 1.1, self-hosted in `public/fonts/`.
- The old Claude Design brief for the loom direction was deleted with this adoption; the artifact itself is the brief now.

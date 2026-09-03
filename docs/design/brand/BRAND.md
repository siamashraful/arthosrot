# Arthosrot — brand identity

> **Purpose:** the durable identity decisions for Arthosrot: name, mark, colour, type, motion, voice, and how the brand signals the difference between practice and real money.
> **Audience:** anyone building or reviewing a surface. **Status:** ADOPTED — the tokens in `src/styles/tokens.css` are this document made executable; the as-built system is recorded in [../DESIGN.md](../DESIGN.md).
> **Belongs here:** identity decisions and their reasons. **Lives elsewhere:** component rules (design/DESIGN_SYSTEM.md), product truth (PRODUCT.md), realism limits (LIMITATIONS.md), a11y method (design/ACCESSIBILITY.md), the motion dependency (architecture/adr/ADR-012-motion-dependency.md).

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

The visual pivot recorded here changes the _costume_ — from a dark dyed field to a bright, energetic wallet — and none of the commitments. Energy is allowed in **structure and motion**. It is never allowed in **verdicts on the user's money**.

---

## 3. The world: the bright ledger

The identity is built from **the modern wallet**: a light, cool-neutral canvas; white cards with soft, generous corners; one near-black card that holds the headline number the way a physical card holds a balance; colour used in confident blocks to name _categories_, never to grade outcomes; and chrome made of glass so the content is always visible through it.

It was chosen because it matches what the product is for. A beginner's first job is to _find the number and trust it_. A bright canvas with one dark card makes the hierarchy impossible to miss: the card is the account; everything else is context around it. The rest of the world is familiar from the wallets and banking apps people already use — the point is that a first-time trader should feel they have opened a known kind of thing, not a terminal.

| The wallet                              | Product                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------- |
| The dark card in the light wallet       | The **hero card** — portfolio value and the net-worth curve                |
| Colour-block tiles around the card      | Stat tiles — cash, buying power, day change, open orders — named by role   |
| Glass chrome                            | Sidebar, bars, ribbon, sheets — always secondary to what is behind them    |
| A card that feels different in the hand | **Practice vs. real money** (§5): grain vs. smooth, tinted vs. chroma-zero |
| Numbers printed in ink, never in colour | Colour law 1 (§6): pop and accent never on a number                        |

Reference studied: _Financy — Fintech App_ (Nickelfox Design, Figma Community, CC BY 4.0) — light canvas, colour-block tiles, dark balance card. Its structure is borrowed deliberately. Its gamification is not: casino-style mechanics (streaks, confetti, celebratory balances) stay banned regardless of how the surface looks.

Anti-references still in force: the navy-and-neon trading terminal (serious by costume, intimidating to the beginner we serve) and heritage pastiche (no paisley, no decorative borders).

---

## 4. Logo system

### The mark — "the float"

A square of plain weave. Alternate picks pass **under** the warp (notched) and **over** it (unbroken) — real plain-weave alternation, not stripes. The last two picks stop short, so one corner is still open.

At a glance it's cloth. Read closely it's the order state machine — **filled, partially filled, resting** — in one figure. It is also, for a beginner, a picture of the thing they are: mid-progress, and that being normal. The mark predates the bright-ledger pivot and survives it unchanged: it works as pure structure, and it is the one place the loom story still lives.

| Asset                                            | Use                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| [`mark.svg`](mark.svg)                           | Identity mark, 5 warps × 6 picks. **32px and up.**                             |
| [`mark-compact.svg`](mark-compact.svg)           | Same weave, 3 warps × 4 picks. **24px and below** — favicon, avatar, app icon. |
| [`wordmark-latin.svg`](wordmark-latin.svg)       | Latin wordmark alone                                                           |
| [`wordmark-bn.svg`](wordmark-bn.svg)             | Bengali wordmark alone                                                         |
| [`lockup-horizontal.svg`](lockup-horizontal.svg) | **Primary lockup.** Mark + bilingual wordmark. Default everywhere.             |
| [`lockup-stacked.svg`](lockup-stacked.svg)       | Centred contexts: splash, auth pages, share cards                              |

All assets are **outlined vector** — no font needed at render time — and use `currentColor`, so one `color` drives them and both themes work with no variants.

### Rules

- **Clear space:** one warp pitch (⅛ of the mark's width) on every side.
- **Minimum sizes:** identity mark 32px; compact mark 16px; horizontal lockup 40px tall.
- **Colour:** `--ink` on the canvas and on glass, `--on-hero` on the hero card. One colour only.
- **The logo never changes between account modes.** Mode is signalled by the surface, never by swapping the mark — a logo that changes meaning is a logo nobody can rely on.
- **Never:** recolour to gain/loss/warning or to any pop colour · rotate or shear · add gradient, glow, or shadow · outline it · re-space the bilingual lockup · set the wordmark in any face but Anek · **fill the open corner.**

The open corner is the idea. Completing it turns the mark into a plain grid and throws away the only thing it says.

---

## 5. Practice and real money — the mode system

**This is the highest-severity design problem in the product.** Once real trading exists, a user who believes they are in practice while placing a real order — or the reverse — has been failed in a way no amount of polish compensates for.

> **Implementation status: presentation implemented (ADR-011).** `data-mode="live"` is set client-side by the Settings trading-mode switch and drives all three signals; live surfaces render only their own empty states. No live-trading BACKEND exists, and none may be added without a human-approved ADR (CLAUDE.md safety rules; `accounts.mode` is PAPER-only at the DB level). **One deliberate deviation while live is a preview:** the persistent label reads "Live preview — real trading isn't available yet" instead of the final "Live — real money" — the label must never claim real money before real money exists. It flips to the spec'd wording the day trading is real.

The identity carries it in the card: **practice is a card with a grain you can feel; real money is a smooth, deeper, colourless one.**

|                  | Practice (PAPER)                                 | Real money (LIVE)                                |
| ---------------- | ------------------------------------------------ | ------------------------------------------------ |
| Texture grain    | **Visible** — `--mode-texture-opacity: 1`        | **Absent** — `--mode-texture-opacity: 0`         |
| The hero card    | Ink-tinted `oklch(0.21 0.018 265)` (light theme) | Deeper and chroma-zero `oklch(0.13 0 0)`         |
| Persistent label | "Practice — simulated money"                     | "Live — real money" (preview wording until then) |

Three redundant signals, and **the mode is never carried by colour alone**:

1. **Texture** — a fine grain drawn on practice surfaces (the hero card, the mode ribbon) via `--mode-texture-opacity`; `[data-mode="live"]` zeroes that one variable and the grain disappears everywhere it is drawn. Survives greyscale and colour-blindness.
2. **Depth and chroma** — the live hero is deeper AND chroma-zero against the practice hero, ΔEok ≥ 0.06 in both themes. Pure luminance steps were rejected: a card that is merely a little darker is not a safety signal.
3. **A persistent text ribbon** (`role="note"`) — the only signal that survives a screenshot, a screen reader, and a colour-blind user simultaneously.

**Removing any one of the three is a review-blocking change.** Confirmation copy for a real order must name the mode in words ("This places a real order with real money"), never rely on the surface.

### The graduation must not flatter

The most dangerous moment in this product is the one it is designed to produce: a user moving from practice to real money. Paper performance does not predict live performance — it lacks slippage at scale, emotional pressure, and the discipline cost of real loss, all documented in LIMITATIONS.md.

**Brand rule: never imply that practice results forecast real results.** No "you're ready" badges, no simulated-return leaderboards, no upgrade prompt triggered by a winning streak, no motion on the switch itself. The graduation offer is neutral, always available, and never celebratory.

---

## 6. Colour

**Strategy: Committed.** Colour owns a region or a role — never sprinkled as accents over neutral. The hero owns the account's primary region; each pop colour owns a category; the canvas stays near-white so the numbers stay ink.

### Roles

| Token                                                   | Role                                                                                                                                                                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--bg` / `--surface` / `--surface-2`                    | The canvas: cool-neutral off-white ground, white cards. Deep charcoal in the dark theme. Tinted toward the brand hue, never toward warmth.                                                                             |
| `--ink` / `--ink-muted`                                 | All text and all numbers.                                                                                                                                                                                              |
| `--accent` / `--on-accent` / `--accent-soft`            | Interactive blue: links, selection, focus ring, the active nav pill. **Not** the primary button — primary buttons are black pills (`--ink` on `--bg`).                                                                 |
| `--pop-coral` `--pop-teal` `--pop-amber` `--pop-blue`   | **The colour-block quartet.** Categorical and structural energy: stat-tile icon chips (on the `-soft` tint) and labels, logo/category chips. Each has an `--on-pop-*` pair.                                            |
| `--hero` / `--on-hero` / `--hero-muted` / `--hero-line` | **The wallet card.** Dark in both themes. Owns the account's primary region and is the account-mode carrier (§5). Financial colour on it uses `--gain-on-hero` / `--loss-on-hero`; the curve uses `--chart-*-on-hero`. |
| `--gain` / `--loss`                                     | Financial fact. Nothing else, ever.                                                                                                                                                                                    |
| `--warning`                                             | Degraded pipeline, stale data, simulation notices.                                                                                                                                                                     |
| `--glass-*`                                             | The chrome: sidebar, bars, ribbon, sheets, banners, chart readouts. Never a data surface.                                                                                                                              |

### The colour laws

Each is mechanically checkable, and each exists to protect a beginner from reading emotion into a number:

1. **`--accent` and the `--pop-*` quartet never appear on a number.** Numbers are ink; gain and loss carry their own meaning. Pop marks structure and category only — a tile's label may be coral, its number is ink.
2. **`--gain` / `--loss` never appear on a control.** They are facts, not affordances. **BUY is not green. SELL is not red.** A beginner who learns "green button = good action" has learned something false and expensive.
3. **`--hero` is a surface, not an accent.** It owns the account's primary region or it's absent. No hero-coloured chips, badges, or icon tiles.
4. **Glass is chrome, not a data surface.** No glass on cards, tables, forms, or the hero. Readability of money outranks effect.

Meaning is never carried by colour alone — always a sign, arrow, or label too (sr-only sign text on every gain/loss value).

### Verification

Every load-bearing pair is computed, not eyeballed — **50 pairs** across both themes via this repo's [`scripts/check-contrast.ts`](../../../scripts/check-contrast.ts) against [`src/styles/tokens.css`](../../../src/styles/tokens.css): the ink/bg/surface/accent set, gain/loss/warning on the canvas, the five on-hero pairs (repeated on both live-mode composites), the four `on-pop-*/pop-*` pairs, and text on `--glass-bg-solid` — the no-filter fallback, which is the worst case any text on glass can land on. **Never weaken pairs — extend them.**

The one recurring defect class from the previous system carries forward as a rule: **the hero is a dark surface inside a light page**, so canvas-tuned gain/loss fail on it. Any component putting financial colour on the hero must use `--gain-on-hero` / `--loss-on-hero`.

---

## 7. Typography

**One superfamily across both scripts: Anek** (Ek Type — an Indian foundry), Open Font License.

Anek Latin and Anek Bangla are **one design drawn across scripts**, so the bilingual wordmark is genuinely a single typeface rather than two forced to cohabit. It's also a variable UI family (width and weight axes, 100–800 self-hosted), so it's a workhorse, not just a display choice.

### Two registers

| Register    | Where                                      | Setting                                                              |
| ----------- | ------------------------------------------ | -------------------------------------------------------------------- |
| **Operate** | Tables, tickets, order state, portfolio    | 13–16px scale, leading 1.5; the hero figure at `--text-hero` 2.5rem  |
| **Read**    | Lessons, explainers, glossary, limitations | `--text-read` 17px, `--leading-read` 1.65, `--measure` 68ch hard cap |

| Use                       | Face                                                     | Setting                                                                    |
| ------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| Wordmark                  | Anek Latin / Anek Bangla                                 | `wght 600`, `wdth 87.5`                                                    |
| **Hero numeral**          | Anek Latin, tabular                                      | `--text-hero` 2.5rem, `--text-hero-wght` 700 — the boldest thing on screen |
| UI, all text              | Anek Latin, falling back to Anek Bangla for Bengali runs | 400 / 500 / 600                                                            |
| Bengali long-form         | Anek Bangla                                              | `--leading-read-bn` 1.8 — Bengali needs more air than Latin at a size      |
| Numerals                  | Anek, `font-variant-numeric: tabular-nums`               | **Verified:** both Anek Latin and Anek Bangla ship a `tnum` feature        |
| IDs, hashes, raw payloads | `--font-mono`                                            | unchanged                                                                  |

**Bengali typesetting.** অর্থস্রোত contains two conjuncts (র্থ, স্রো) and a reordered vowel sign (ো). Any wordmark rendered without a real shaping engine will be wrong. The delivered SVGs were shaped with HarfBuzz and outlined, so they're correct and immune to font-loading failure; **never re-set the wordmark as live `<text>`.**

> **Open decision — teaching language.** The interface is Latin-first English; the _lessons_ are where a Bengali reader's comprehension is most at stake. Recommendation: Bengali-first educational content with English terms alongside. A product decision with real cost — flagged, not decided.

---

## 8. Motion — energetic, never celebratory

The bright ledger moves the way a good wallet app moves: sheets spring up, tiles settle in on arrival, a pressed pill gives slightly under the finger. Motion is allowed to make the _structure_ feel alive. It is never allowed to comment on the _money_.

- **Springs on chrome and overlays** — sheets (native `<dialog>`, inner wrapper springs), tap feedback (`whileTap` scale 0.97) on nav pills and primary buttons. Provided by the `motion` package under a global `<MotionConfig reducedMotion="user">` (ADR-012).
- **Mount-only entrances** — stat tiles and list rows stagger in once when a page mounts. **Never re-triggered by data**: a refreshed value must not move.
- **State changes snap and settle** — `--dur-fast` 120ms, `--ease-out`. No fades between order states; a state either is or is not.
- **No celebratory motion, ever.** No confetti, no streaks, no count-ups, no pulse on a gain, no success flourish on a fill, and nothing on the paper→live graduation. A number that performs is a number that is selling you something.
- The only continuous motion is the price line.
- `prefers-reduced-motion: reduce` → instant, no exceptions.

---

## 9. Voice

Bengali in identity, English in the interface, and one register throughout: **precise, plain, and never reassuring about outcomes.**

> **Encourage understanding. Never encourage outcomes.**

It is right to tell someone they've understood what a limit order does. It is never right to congratulate them on a gain or console them on a loss. The product has no opinion on the trade.

- **Explain the mechanism, never predict the outcome.** No signals, no picks, no "trending stocks," no implied advice.
- **Teach in place, not in a separate school.** An explainer belongs next to the live thing it explains. A walled-off academy is where education goes to be ignored.
- **Assume no knowledge; imply no stupidity.** Define the term on first use, once, in a sentence. Never "simply" or "just."
- **State the state.** "Partially filled — 4 of 10" beats "Almost there!"
- Simulation is labelled every time, in plain words — never softened to "demo" when real money is a click away.
- When something is degraded, say what and since when. Never a spinner pretending to be live.
- Bengali appears in the wordmark and may appear as a section mark. It is not sprinkled as decoration.

---

## 10. Adoption — status

The bright-ledger tokens ARE `src/styles/tokens.css`; the class contract is `src/styles/globals.css`; the as-built record is [../DESIGN.md](../DESIGN.md). Anek Latin self-hosted; brand SVGs in `public/brand/`; the three-signal mode system live behind ADR-011; `motion` adopted under ADR-012.

Still open: the full Read register (lessons) — explainers exist, long-form does not.

---

## 11. Honest risks

- **Mode confusion is the severe one.** Everything else on this list is a quality problem; this one loses someone's money. The three-signal system is the mitigation, and it needs an automated test, not a guideline.
- **Overconfidence transfer.** Making practice feel real is the core function and the main hazard. §5 constrains the graduation; the honest mitigation is editorial — LIMITATIONS.md has to be _read_.
- **Glass legibility.** Translucent chrome over a busy page can drop text below AA in ways a static check can't see. Mitigations: text on glass is gated against `--glass-bg-solid` (the worst case), glass never carries a number, and the reduced-transparency/no-filter fallbacks are solid.
- **`backdrop-filter` performance.** Blur over a scrolling canvas costs paint on low-end phones. Glass is confined to a handful of fixed chrome surfaces; if a surface scrolls, it is not glass.
- **Tile colour reading as a rainbow grid.** Four pop colours next to each other is a sticker sheet unless each colour _means_ a category. Assign roles deliberately (one colour per category, reused consistently across screens); never colour tiles by position.
- **Refusing the activation playbook has a cost.** No streaks, no confetti, no push alerts means measurably worse retention than competitors who use them. That trade is deliberate; it must not be quietly reversed by a growth experiment — and a brighter, friendlier surface makes that temptation stronger, not weaker.
- **The weave can read as a barcode** at small sizes and low contrast. The compact mark is the mitigation; below 16px use a solid ink tile.
- **Untested with Bengali readers.** The romanisation and the wordmark's letterfit are judgement. Worth one native reader.
- **Real trading is a regulatory question this document cannot answer.** Licensing, suitability, disclosures, and the rules on presenting anything that resembles advice will constrain the voice and the surfaces far more than taste will.

---

## 12. Provenance

- The mark, name, and type were selected under the original loom direction (seed key `4e05a29d`); the bright-ledger pivot (2026-09) replaced the dyed field, warp texture, and reed-beat motion with the wallet card, texture grain, colour-block quartet, glass chrome, and spring motion, keeping the mark and every safety law intact.
- Typeface: **Anek** by Ek Type, SIL Open Font License 1.1.
- Reference studied: _Financy — Fintech App_ by Nickelfox Design (Figma Community, CC BY 4.0). Structure and costume borrowed: dominant dark value card, colour-block tiles, light canvas. Gamification not borrowed.

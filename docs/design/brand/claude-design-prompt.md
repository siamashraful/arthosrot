# Claude Design brief — Arthosrot identity refinement

> Paste the block below into Claude Design. Attach `brand-light.png` and `brand-dark.png`
> (the current identity sheet) and the six SVGs in this folder as reference.
> Edit the **"What I want you to push on"** section to steer each round.

---

I have a brand identity direction I like and want to refine. Please work _within_ this direction rather than proposing a new one — I've already run the divergent phase and committed.

## The product

**Arthosrot** is an **on-ramp into equity trading**. It teaches beginners the mechanics of the stock market, lets them practise against a real paper-trading venue with no risk, and is built to carry them into real-money trading when they're ready. Three jobs, one continuous arc — **learn → practise → trade**.

Today it is a paper-trading platform: users get a simulated $100,000 account and place real market and limit orders that execute at an external paper venue, with genuine asynchronous lifecycles (acknowledged, resting, partially filled, expired) backed by an immutable append-only ledger. Real trading is the stated destination, not a maybe.

Its governing principle is **financial correctness above everything, and honesty over illusion**: simulated money is labelled persistently, freshness is always visible, execution price is shown separately from quoted price, and it never pretends a balance mutation is a trade.

**Audience:** beginners and new traders — primarily a Bengali audience — plus finance-literate users (analysts, quants) who notice sloppy numbers instantly. The design must not condescend to the first group or lose the trust of the second.

Mostly an **Operate** surface — design serves the task: dense tables, live order state, numbers as the interface. But it now also needs a genuine **Read** register for lessons and explainers. Closer to a professional brokerage than a consumer money app.

## The name

**Arthosrot** · **অর্থস্রোত** · _OR-tho-srot_

From অর্থ (_ortho_, wealth) + স্রোত (_srot_, current/stream) = "the current of wealth." The second reading is the one the product is built on: অর্থ also means **meaning**, so it reads equally as _a current of meaning_ — and making the market mean something to someone who has never traded is the platform's first job.

Bilingual identity, Latin-first interface.

## The world: the jamdani loom

Built from **Dhakai jamdani** — the Bengali handloom tradition where a fixed warp is held under tension and the pattern is laid in by hand, pick by pick, so the cloth is visibly _in progress_ on the loom. The finest muslins from that tradition were named _ab-e-rawan_, "running water."

It encodes the product's mechanism literally — and it earns its place twice, because a loom is also **where a craft is learned**, and its virtue is that the mechanism stays visible while it works. An apprentice learns by watching the real thing.

| Loom                                   | Product                                       |
| -------------------------------------- | --------------------------------------------- |
| Warp held under tension                | Capital reserved against an open order        |
| A pick laid part-way across            | A **partially filled** order                  |
| A row completed                        | A fill                                        |
| A row not begun                        | A resting order                               |
| Can't unweave without cutting          | The append-only ledger                        |
| The mechanism is visible while it runs | Teaching in place, by watching the real thing |
| **Cloth on the loom vs. cloth off it** | **Practice vs. real money**                   |

## Hard anti-references — do not drift toward these

1. **The navy-and-neon trading terminal.** Signals "serious" by costume; also intimidates the beginner we're trying to serve.
2. **The gamified consumer broker.** Streaks, confetti, leaderboards, celebratory balance cards, "you beat the market" badges, hot-stock alerts. These are the standard tools for activating new traders and they are exactly what turns a learner into a gambler. **Arthosrot refuses them as a brand commitment.** Do not propose them, even softened.
3. **Heritage pastiche.** No paisley, no decorative borders, no sari photography. The loom is a _structural_ idea, not a texture to apply.
4. **Cream/parchment grounds with a serif display face.**

## Locked — please don't change these

- The name, both scripts, and the romanisation `Arthosrot` / `অর্থস্রোত`.
- The loom as the governing world.
- **Typeface: Anek** (Ek Type, OFL) — Anek Latin + Anek Bangla, one design drawn across both scripts, which is why the bilingual wordmark is a single typeface rather than two forced to cohabit. Wordmark: `wght 600`, `wdth 87.5`.
- **Committed colour strategy**: one dyed field carries whole regions at page scale. Colour owns a region or is absent.
- Light and dark themes both ship. Neither is an afterthought.
- **The logo never changes between account modes.**

## The three colour laws — non-negotiable

1. **The accent never appears on a number.** Numbers are ink; gain and loss carry their own meaning.
2. **Gain/loss colours never appear on a control.** They are facts, not affordances. **BUY is not green. SELL is not red.** A beginner who learns "green button = good action" has learned something false and expensive.
3. **The field is a field, not an accent.** It owns a whole region or it's absent — no field-coloured chips or badges.

Meaning is never carried by colour alone — always a sign, arrow, or label too.

## The mode system — the highest-severity problem here

Once real trading exists, a user who thinks they're in practice while placing a real order has been failed in a way no polish compensates for. The identity carries the distinction **in the material: practice is cloth still on the loom; real money is finished cloth.**

|                  | Practice (PAPER)             | Real money (LIVE)           |
| ---------------- | ---------------------------- | --------------------------- |
| Warp texture     | **Visible**                  | **Absent**                  |
| The field        | Dyed teal-navy `#002332`     | Undyed near-black `#080d10` |
| Persistent label | "Practice — simulated money" | "Live — real money"         |

Three redundant signals, never colour alone: **texture** (survives greyscale and colour-blindness), **depth/chroma** (ΔEok 0.095 apart — note their _luminance_ contrast is only 1.20:1, which is why depth alone was rejected), and **a persistent text label** (the only signal that survives a screenshot and a screen reader).

Also: **never imply practice results forecast real results.** No "you're ready" badges, no simulated-return leaderboards, no upgrade prompt triggered by a winning streak. The graduation offer is neutral, always available, never celebratory.

## Current palette

Verified against WCAG 2.2 AA by computation (body ≥4.5:1, large ≥3:1).

**Light** — muslin ground

| Role                            | Hex                                                                    |
| ------------------------------- | ---------------------------------------------------------------------- |
| bg / surface / surface-2        | `#f7fafb` `#eff3f5` `#e5ebed`                                          |
| border / border-strong          | `#d4dbdd` `#afb7bb` (the warp — a hairline on a real pitch)            |
| ink / ink-muted                 | `#0c191e` `#4c585d`                                                    |
| accent                          | `#005c7d`                                                              |
| **field (practice) / on-field** | `#002332` `#eef5f7`                                                    |
| **field (live)**                | `#080d10`                                                              |
| gain / loss / warning           | `#007843` `#bf181d` `#a87600`                                          |
| gain-on-field / loss-on-field   | `#4ed295` `#fe685e` (required — the field is dark inside a light page) |

**Dark** — the dyed field at night

| Role                                 | Hex                               |
| ------------------------------------ | --------------------------------- |
| bg / surface / surface-2             | `#021118` `#051a23` `#0d242e`     |
| border / border-strong               | `#21353e` `#40555e`               |
| ink / ink-muted                      | `#ebf1f4` `#a0abb0`               |
| accent                               | `#67cfe3`                         |
| field (practice) / (live) / on-field | `#002a3a` · `#070b0d` · `#eef5f7` |
| gain / loss / warning                | `#4ed295` `#fe685e` `#efb949`     |

## The mark

A square of **real plain weave**: alternate picks pass _under_ the warp (notched) and _over_ it (unbroken) — genuine over/under alternation, not stripes. The last two picks stop short, so **one corner is still open on the loom**.

At a glance it's cloth. Read closely it's the order state machine — filled, partially filled, resting. For a beginner it's also a picture of what they are: mid-progress, and that being normal. The open corner is the entire idea; filling it turns the mark into a plain grid.

Two optical sizes: identity mark (5 warps × 6 picks, 32px+) and compact mark (3 warps × 4 picks, 16–24px).

## What I want you to push on

_(edit this each round — one or two at a time gets better work than all of them at once)_

1. **The learn→practise→trade arc as one visual system.** Three moments that must feel like one product: a lesson, a practice order ticket, a real order confirmation. Show them side by side. The character must not change between them, but the seriousness must escalate.
2. **The mode system, adversarially.** Try to make a user misread practice as live and vice versa — squint test, greyscale, 4in phone, screenshot with no chrome, colour-blind simulation. Then strengthen whatever broke. This is the one I most want you to attack rather than decorate.
3. **In-place teaching.** An explainer attached to a live "Partially filled" order state — how it appears, how it dismisses, how it avoids becoming clutter for a user on their 400th order. Explicitly _not_ a separate academy section.
4. **The Read register.** Lessons and glossary in Anek at 17px/1.65 with a 68ch measure, sitting inside a product whose other register is a dense 13px table. Make them feel like one system.
5. **The mark's craft.** Thread weights, warp/pick pitch ratio, how far the open corner steps back, and whether the two bare warp stubs at bottom-right read as intentional or as a defect. Show at 96 / 48 / 32 / 16px.
6. **The bilingual lockup.** Optical balance between `Arthosrot` and `অর্থস্রোত` — the Bengali matra line and the Latin cap line don't naturally align, and the Bengali currently sits at 60% of the Latin size. Test Bengali above Latin, and a single-line side-by-side variant.

## What to give me back

- Options as real comparable variants, not one polished answer — I'll pick.
- Every colour value in hex, and flag any pair that would fail 4.5:1 for body text.
- For anything touching the mode system, tell me how it fails in greyscale before you tell me how it looks.
- Say plainly when something in my direction isn't working. I'd rather hear it than get a compliant version of a bad idea.

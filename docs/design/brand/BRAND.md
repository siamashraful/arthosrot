# Arthosrot — brand identity

> **Purpose:** the durable identity decisions for Arthosrot: name, mark, colour, type, motion, voice, and how the brand signals the difference between practice and real money.
> **Audience:** anyone building or reviewing a surface. **Status:** PROPOSAL — nothing here is wired into the app yet.
> **Belongs here:** identity decisions and their reasons. **Lives elsewhere:** component rules (design/DESIGN_SYSTEM.md), product truth (PRODUCT.md), realism limits (LIMITATIONS.md), a11y method (design/ACCESSIBILITY.md).

---

## 1. The name

**Arthosrot** · **অর্থস্রোত** · /ˈɔr.t̪ʰo.srot̪/ — _OR-tho-srot_

From অর্থ (_ortho_) + স্রোত (_srot_). The compound reads **"the current of wealth"** — money as something that moves and can be watched moving, not a balance that sits.

The second reading is the one the product is actually built on: অর্থ also means **meaning**. অর্থস্রোত reads equally as **a current of meaning** — and making the market _mean something_ to someone who has never traded is now the platform's first job, not a side effect.

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

The enablement mission raises the stakes on that principle rather than softening it. A beginner cannot audit what you tell them; they can only trust it. So the brand is judged on two questions now:

1. **Does this look like a place that would refuse to fake a fill?**
2. **Would a beginner leave here understanding more, and believing less?**

The second question is the harder one, and it rules out an entire commercial playbook: streaks, confetti, leaderboards, "you beat the market" badges, push notifications about hot stocks. Those are the standard tools for activating new traders and they are precisely what turns a learner into a gambler. **Arthosrot does not use them.** That is a brand commitment, not a preference.

### Hard anti-references

- **The navy-and-neon trading terminal.** Signals "serious" by costume; its glow and density are decoration on a product whose claim is restraint. It also intimidates exactly the beginner we're trying to serve.
- **The gamified consumer broker.** The rounded card app with green confetti, category chips, and a balance that celebrates itself — including the Financy reference that seeded this work. Its structural confidence is worth borrowing; its costume actively contradicts everything above.
- **Heritage pastiche.** No paisley, no decorative borders, no sari photography. The loom is a _structural_ idea, not a texture to apply.
- **Cream/parchment grounds with a serif display face.** The default costume for "traditional," and wrong here.

---

## 3. The world: the jamdani loom

The identity is built from **Dhakai jamdani** — the Bengali handloom tradition where a fixed warp is held under tension and the pattern is laid in by hand, pick by pick, so the cloth is visibly _in progress_ on the loom. The finest muslins from that tradition were named for moving water: **আব-এ-রওয়াঁ** (_ab-e-rawan_), "running water." The name and the material meet on their own.

It was chosen because it encodes the product's mechanism literally — and it earns its place twice over now, because a loom is also **where a craft is learned**, and its whole virtue is that the mechanism stays visible while it works. An apprentice can watch the cloth being made. That is the enablement thesis exactly.

| Loom                                   | Product                                                       |
| -------------------------------------- | ------------------------------------------------------------- |
| Warp held under tension                | Capital reserved against an open order                        |
| A pick laid part-way across            | A **partially filled** order                                  |
| A row completed                        | A fill                                                        |
| A row not begun                        | A resting order                                               |
| Can't unweave without cutting          | The append-only ledger                                        |
| The mechanism is visible while it runs | Teaching in place — you learn by watching the real thing work |
| Cloth on the loom vs. cloth off it     | **Practice vs. real money** (§5)                              |

The partial state is the hardest idea in the product, and the loom is the only candidate that encodes it. Considered and rejected: the river the name literally suggests (the first thing anyone would draw), the ledger book (হিসাবের খাতা), the almanac (পঞ্জিকা), the jute auction floor, and the brass bazaar scale (দাঁড়িপাল্লা).

---

## 4. Logo system

### The mark — "the float"

A square of plain weave. Alternate picks pass **under** the warp (notched) and **over** it (unbroken) — real plain-weave alternation, not stripes. The last two picks stop short, so one corner is still open on the loom.

At a glance it's cloth. Read closely it's the order state machine — **filled, partially filled, resting** — in one figure. It is also, for a beginner, a picture of the thing they are: mid-progress, and that being normal.

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
- **Colour:** `--ink` on page, `--on-field` on the dyed field. One colour only.
- **The logo never changes between account modes.** Mode is signalled by the surface, never by swapping the mark — a logo that changes meaning is a logo nobody can rely on.
- **Never:** recolour to gain/loss/warning · rotate or shear · add gradient, glow, or shadow · outline it · re-space the bilingual lockup · set the wordmark in any face but Anek · **fill the open corner.**

The open corner is the idea. Completing it turns the mark into a plain grid and throws away the only thing it says.

---

## 5. Practice and real money — the mode system

**This is the highest-severity design problem in the product.** Once real trading exists, a user who believes they are in practice while placing a real order — or the reverse — has been failed in a way no amount of polish compensates for.

> **Implementation status: specification only.** No live-trading code exists, and none may be added without a human-approved ADR (CLAUDE.md safety rules; `accounts.mode` is PAPER-only at the DB level). This section exists so the distinction is _designed before it is needed_ rather than bolted on under deadline.

The identity carries it in the material: **practice is cloth still on the loom; real money is finished cloth.**

|                  | Practice (PAPER)                  | Real money (LIVE)                |
| ---------------- | --------------------------------- | -------------------------------- |
| Warp texture     | **Visible** — `--warp-opacity: 1` | **Absent** — `--warp-opacity: 0` |
| The field        | Dyed teal-navy `#002332`          | Undyed, near-black `#080d10`     |
| Persistent label | "Practice — simulated money"      | "Live — real money"              |

Three redundant signals, and **the mode is never carried by colour alone**:

1. **Texture** — survives greyscale and colour-blindness.
2. **Depth and chroma** — measured ΔEok 0.095 (light) / 0.129 (dark) against the practice field, roughly 5× the just-noticeable difference. Note the _luminance_ contrast between the two fields is only 1.20:1, which is why depth alone was rejected as the signal.
3. **A persistent text label** — the only signal that survives a screenshot, a screen reader, and a colour-blind user simultaneously.

**Removing any one of the three is a review-blocking change.** Confirmation copy for a real order must name the mode in words ("This places a real order with real money"), never rely on the surface.

### The graduation must not flatter

The most dangerous moment in this product is the one it is designed to produce: a user moving from practice to real money. Paper performance does not predict live performance — it lacks slippage at scale, emotional pressure, and the discipline cost of real loss, all documented in LIMITATIONS.md.

**Brand rule: never imply that practice results forecast real results.** No "you're ready" badges, no simulated-return leaderboards, no upgrade prompt triggered by a winning streak. The graduation offer is neutral, always available, and never celebratory.

---

## 6. Colour

**Strategy: Committed.** One dyed field carries whole regions at page scale. Colour owns a region or is absent — never sprinkled as accents over neutral.

### Roles

| Token                            | Role                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `--field` / `--on-field`         | **The dyed cloth.** Owns whole panels — portfolio value, the primary summary, auth. Also the account-mode carrier (§5). |
| `--bg` `--surface` `--surface-2` | Muslin: the working ground. Tinted toward the brand hue, never toward warmth.                                           |
| `--border`                       | **The warp.** A hairline on a real pitch (`--warp-pitch`), not an incidental divider.                                   |
| `--accent`                       | The thread: links, focus, selection, primary action.                                                                    |
| `--gain` `--loss`                | Financial fact. Nothing else, ever.                                                                                     |
| `--warning`                      | Degraded pipeline, stale data, simulation notices.                                                                      |

### The three colour laws

Each is mechanically checkable, and each exists to protect a beginner from reading emotion into a number:

1. **`--accent` never appears on a number.** Numbers are ink; gain and loss carry their own meaning. The thread marks structure and attention only.
2. **`--gain` / `--loss` never appear on a control.** They are facts, not affordances. **BUY is not green. SELL is not red.** A beginner who learns "green button = good action" has learned something false and expensive.
3. **`--field` is a field, not an accent.** It owns a whole region or it's absent. No field-coloured chips, badges, or icon tiles.

Meaning is never carried by colour alone — always a sign, arrow, or label too.

### Verification

Every load-bearing pair was computed, not eyeballed — 32 pairs across both themes via this repo's [`scripts/check-contrast.ts`](../../../scripts/check-contrast.ts) against [`src/styles/tokens.css`](../../../src/styles/tokens.css), plus 16 mode pairs and 2 perceptual-separation checks.

Two real defects were caught by those gates and fixed:

- **The light theme's dyed field is a dark surface inside a light page**, so light-tuned gain/loss failed on it (2.90 and 2.60). Hence `--gain-on-field` / `--loss-on-field`, now 8.47 and 5.71. Any component putting financial colour on the field must use those.
- **The first live-mode field differed from practice by luminance alone at 1.21:1** — imperceptible, and unacceptable for a safety signal. Dropping its chroma as well took it to ΔEok 0.095.

> **On indigo.** The dyed field sits in the নীল family. Indigo is beloved in Bengali textile and is genuinely jamdani's ground, but forced indigo cultivation and the Indigo Revolt of 1859 are part of that history too. The tone here is a deep teal-navy rather than a vat-indigo, and the brand never names a plantation. Flagged so the association is a decision, not an accident.

---

## 7. Typography

**One superfamily across both scripts: Anek** (Ek Type — an Indian foundry), Open Font License.

Anek Latin and Anek Bangla are **one design drawn across scripts**, so the bilingual wordmark is genuinely a single typeface rather than two forced to cohabit — what almost every bilingual South Asian identity settles for. It's also a variable UI family (width and weight axes), so it's a workhorse, not just a display choice.

### Two registers

The enablement mission adds a register the original system didn't have. A dense Operate scale cannot carry a lesson.

| Register    | Where                                      | Setting                                                              |
| ----------- | ------------------------------------------ | -------------------------------------------------------------------- |
| **Operate** | Tables, tickets, order state, portfolio    | Existing scale, 13–16px, leading 1.5                                 |
| **Read**    | Lessons, explainers, glossary, limitations | `--text-read` 17px, `--leading-read` 1.65, `--measure` 68ch hard cap |

| Use                       | Face                                                     | Setting                                                               |
| ------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| Wordmark                  | Anek Latin / Anek Bangla                                 | `wght 600`, `wdth 87.5`                                               |
| UI, all text              | Anek Latin, falling back to Anek Bangla for Bengali runs | 400 / 500 / 600                                                       |
| Bengali long-form         | Anek Bangla                                              | `--leading-read-bn` 1.8 — Bengali needs more air than Latin at a size |
| Numerals                  | Anek, `font-variant-numeric: tabular-nums`               | **Verified:** both Anek Latin and Anek Bangla ship a `tnum` feature   |
| IDs, hashes, raw payloads | `--font-mono`                                            | unchanged                                                             |

**Bengali typesetting.** অর্থস্রোত contains two conjuncts (র্থ, স্রো) and a reordered vowel sign (ো). Any wordmark rendered without a real shaping engine will be wrong. The delivered SVGs were shaped with HarfBuzz and outlined, so they're correct and immune to font-loading failure; **never re-set the wordmark as live `<text>`.**

> **Open decision — teaching language.** The interface is Latin-first English by your choice, but the _lessons_ are where a Bengali reader's comprehension is most at stake, and where English is most likely to be the actual barrier to entry. My recommendation is Bengali-first educational content with English terms kept alongside (a beginner needs to recognise "limit order" when they meet it elsewhere). This is a product decision with real cost — flagging, not deciding.

---

## 8. Motion — the reed's beat

The loom's real motion is a beat: the reed drives the pick into place and stops. Nothing glides.

- State changes **snap and settle** — `--dur-fast: 120ms`, `--ease-out: cubic-bezier(0.2, 0.9, 0.25, 1)`. No fades between order states; a state either is or is not.
- The only continuous motion is the price line. Everything else is discrete.
- **No celebratory motion, ever.** No confetti, no pulse on a gain, no animated counting-up of a balance. A number that performs is a number that is selling you something.
- No entrance animations on data. A number that animates in is a number you can't trust at a glance.
- `prefers-reduced-motion: reduce` → instant, no exceptions.

---

## 9. Voice

Bengali in identity, English in the interface, and one register throughout: **precise, plain, and never reassuring about outcomes.**

The teaching mission does not soften this — it sharpens it into a single rule:

> **Encourage understanding. Never encourage outcomes.**

It is right to tell someone they've understood what a limit order does. It is never right to congratulate them on a gain or console them on a loss. The product has no opinion on the trade.

- **Explain the mechanism, never predict the outcome.** No signals, no picks, no "trending stocks," no implied advice. This is both the honest position and the one that keeps the product out of territory it isn't licensed for.
- **Teach in place, not in a separate school.** An explainer belongs next to the live thing it explains — "Partially filled" carries its own explanation of why an order fills in pieces. A walled-off academy section is where education goes to be ignored.
- **Assume no knowledge; imply no stupidity.** Define the term on first use, once, in a sentence. Never "simply" or "just."
- State the state. "Partially filled — 4 of 10" beats "Almost there!"
- Simulation is labelled every time, in plain words — never softened to "demo" or "practice mode" when real money is a click away.
- When something is degraded, say what and since when. Never a spinner pretending to be live.
- Bengali appears in the wordmark and may appear as a section mark. It is not sprinkled as decoration; a Bengali word earns its place only when it is the truer term.

---

## 10. Adoption — status

Steps 1–6 are DONE and live (the built system is recorded in
[../DESIGN.md](../DESIGN.md), which is now the ground truth for styling work):
Anek Latin self-hosted (`public/fonts/`); the brand tokens ARE
`src/styles/tokens.css` (the proposal copy was deleted once adopted — no
drift); dyed-field panels + warp on dashboard/portfolio/onboarding; brand
SVGs in `public/brand/` with the mask-rendered lockup and the
`prefers-color-scheme` favicon; the Ledgerline → Arthosrot rename shipped;
first in-place explainers and the loom motion grammar shipped.

Still open:

1. **Only behind an approved ADR:** implement `[data-mode]`, its three
   redundant signals, and a mode-confusion test in the E2E suite (§5).
2. The full Read register (lessons); explainers exist, long-form does not.

---

## 11. Honest risks

- **Mode confusion is the severe one.** Everything else on this list is a quality problem; this one loses someone's money. The three-signal system is the mitigation, and it needs an automated test, not a guideline.
- **Overconfidence transfer.** The product's core function — making practice feel real — is also its main hazard, because paper success does not transfer. §5 constrains the graduation, but the honest mitigation is editorial: LIMITATIONS.md has to be _read_, not merely linked.
- **Refusing the activation playbook has a cost.** No streaks, no confetti, no push alerts means measurably worse retention than competitors who use them. That is the trade being made deliberately; it should not be quietly reversed later by a growth experiment.
- **The metaphor is invisible to most users.** Someone who's never seen a jamdani loom sees an abstract woven square. Acceptable — the mark works as pure structure first — but the story lives in this document and in onboarding, not in the logo.
- **The weave can read as a barcode** at small sizes and low contrast. The compact mark is the mitigation; below 16px use a solid field tile.
- **Anek is not a famous UI face.** Well-made and maintained, but less battle-tested in dense financial tables than Inter. Tabular figures are verified; the rest wants a look at the real orders table.
- **Untested with Bengali readers.** The romanisation, the compound's naturalness, and the wordmark's letterfit are my judgement. Worth one native reader before the rename is announced — more so now that teaching content is in scope.
- **Real trading is a regulatory question this document cannot answer.** Licensing, suitability, disclosures, and the rules on presenting anything that resembles advice will constrain the voice and the surfaces far more than taste will. Get that answer before designing the live experience, not after.

---

## 12. Provenance

- Direction selected under the impeccable new-work flow, seed key `4e05a29d` (scope `direction`, mode `operate`); the loom was candidate 7 of 7 grounded directions. Alternates rejected: a ruled reference-edition setting (strong on clarity, wrong cultural home), a CRT oscilloscope bench (its phosphor green would have broken colour law 2), and a depot destination blind (its bottle-green collided with gain).
- Typeface: **Anek** by Ek Type, SIL Open Font License 1.1.
- Reference studied: _Financy — Fintech App_ by Nickelfox Design (Figma Community, CC BY 4.0). Structure borrowed: dominant value surface, strong numeric hierarchy, identity/value row split. Costume deliberately not borrowed.

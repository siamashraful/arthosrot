# Realism & data limitations

> **Purpose:** honest, user-facing documentation of how paper trading here differs from real trading. The in-app "About this data" disclosure links to this document.
> **Audience:** users and developers. **Belongs here:** limitations and their consequences. **Lives elsewhere:** provider details (architecture/INTEGRATIONS.md).

Paper trading is not real trading, even with a realistic execution venue. Arthosrot aims to be realistic without making false claims:

- **No real market impact.** Your orders never move the market; a size that would sweep the book in reality fills quietly here.
- **No true exchange queue position.** Resting-order priority is simulated by the venue, not earned in a real queue.
- **Simulated liquidity.** Fills — including whether partial fills occur — are modeled by the paper venue, not matched against a real order book.
- **Slippage is simulated or absent.** Real execution costs (spread crossing, adverse selection, latency) are only approximated.
- **Displayed quotes are IEX-only** (~2–3% of US equity volume) and may differ from both the consolidated tape and the venue's execution reference. Execution price is therefore shown separately from the displayed quote; small discrepancies are **expected, not bugs**, and the UI never fabricates an explanation for them.
- **Day change is measured against the prior IEX session close**, which can differ from the official consolidated close other apps quote — so a "+1.2% today" here can read slightly differently elsewhere.
- **Key stats are derived, not quoted.** Market cap = shares outstanding from the latest SEC filing (up to a quarter old) × the live IEX price; P/E = that price ÷ trailing-12-month diluted EPS from filings (a fiscal-year figure, labelled "(FY)", when the filings don't allow a trailing one; "n/m" when earnings are negative); the 52-week range uses IEX daily bars. They can differ slightly from figures elsewhere.
- **The Top 100 is ranked once a day, not live.** Market value = shares outstanding (from SEC filings, up to a quarter old) × the latest IEX price; the list always shows when it was ranked. Foreign companies trading as depositary receipts (ADRs) are not included.
- **Market hours are approximated.** The open/closed status shown in the app is computed as weekdays 09:30–16:00 ET; exchange holidays and early closes are not modeled, so on a holiday the app can show the market as open while the venue rejects or queues orders (the venue's answer is what counts).
- **Price alerts are checked, not streamed.** An alert is evaluated on the app's own (IEX, cached) quote during the regular session only, on a quote no older than 15 minutes, every few minutes at best, and right away whenever you open the app. A brief move through your price between checks can be missed, and the recorded trigger price is the price observed at the check, which can be beyond your level after a gap. Alerts are in-app only for now (no email or push).
- **No settlement risk, borrow costs, or regulatory fees** unless explicitly simulated (MVP simulates none; fees default to $0).
- **No order-information leakage.** Nobody trades against your paper flow.
- **Sandbox infrastructure** may behave differently from production brokerage systems (latency, occasional resets); sandbox state is treated as disposable — Arthosrot's own ledger and canonical event history are the durable record.
- **Delayed status worst case.** While the free-tier worker sleeps, order-status updates can be delayed up to the reconciliation cadence; the UI shows pipeline staleness honestly instead of pretending state is live.

- **Simulated deposits and withdrawals take time on the sandbox venue.** Practice-cash transfers settle instantly in local/offline mode, but on the deployed sandbox they ride simulated ACH (10–30 minutes): a deposit adds cash only once it settles, and a withdrawal holds its amount (lowering buying power) until it settles or fails. Deposits are capped at $50,000 per account per 24 hours, including the opening deposit. Outgoing (withdrawal) ACH in the sandbox is not yet verified end to end — a withdrawal the venue refuses ends as Failed and nothing leaves the account.

- **"Live" mode is a preview.** The Settings switch to live trading re-skins the app and shows the live experience's empty states and funding flows — but no real trading, deposits, or withdrawals exist. No money can move. Your practice account is untouched by switching.

**Product rule:** the persistent mode ribbon ("Practice: simulated money" / the live-preview notice) and the data disclosure are non-removable parts of the interface.

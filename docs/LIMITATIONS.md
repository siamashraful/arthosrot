# Realism & data limitations

> **Purpose:** honest, user-facing documentation of how paper trading here differs from real trading. The in-app "About this data" disclosure links to this document.
> **Audience:** users and developers. **Belongs here:** limitations and their consequences. **Lives elsewhere:** provider details (architecture/INTEGRATIONS.md).

Paper trading is not real trading, even with a realistic execution venue. Arthosrot aims to be realistic without making false claims:

- **No real market impact.** Your orders never move the market; a size that would sweep the book in reality fills quietly here.
- **No true exchange queue position.** Resting-order priority is simulated by the venue, not earned in a real queue.
- **Simulated liquidity.** Fills — including whether partial fills occur — are modeled by the paper venue, not matched against a real order book.
- **Slippage is simulated or absent.** Real execution costs (spread crossing, adverse selection, latency) are only approximated.
- **Displayed quotes are IEX-only** (~2–3% of US equity volume) and may differ from both the consolidated tape and the venue's execution reference. Execution price is therefore shown separately from the displayed quote; small discrepancies are **expected, not bugs**, and the UI never fabricates an explanation for them.
- **No settlement risk, borrow costs, or regulatory fees** unless explicitly simulated (MVP simulates none; fees default to $0).
- **No order-information leakage.** Nobody trades against your paper flow.
- **Sandbox infrastructure** may behave differently from production brokerage systems (latency, occasional resets); sandbox state is treated as disposable — Arthosrot's own ledger and canonical event history are the durable record.
- **Delayed status worst case.** While the free-tier worker sleeps, order-status updates can be delayed up to the reconciliation cadence; the UI shows pipeline staleness honestly instead of pretending state is live.

**Product rule:** the persistent "Paper trading — simulated money" badge and the data disclosure are non-removable parts of the interface.

# Product

> **Purpose:** what Ledgerline is, why it exists, who it serves. Read this first.
> **Audience:** anyone entering the repo. **Belongs here:** vision, users, product principles. **Lives elsewhere:** scope (MVP.md), requirements (REQUIREMENTS.md), architecture (architecture/).

## Vision

A paper-trading platform that behaves and feels like a credible modern brokerage — real asynchronous order lifecycles, accurate numbers, honest data freshness, restrained professional design — rather than a demo that mutates balances. It exists to (a) let users practice equity trading with realistic order mechanics at zero risk, and (b) serve as a correct-by-construction foundation that can graduate to real-money trading by adding broker adapters, not by rewriting.

## Target users

- **Primary:** individuals learning to trade or testing strategies who want realistic order mechanics without risk — including finance-literate users (analysts, quants) who will notice sloppy numbers or fake fills instantly.
- **Secondary:** the developer/owner, using the project as a portfolio-grade engineering artifact.
- **Tertiary (future):** users who would convert to real-money trading once live broker integration exists.

## Product principles

1. **Financial correctness outranks everything** — data integrity, then security, then architecture, testability, maintainability, usability, accessibility, performance, extensibility, visual polish, in that order.
2. **Honesty over illusion.** Simulated money is labeled persistently; data freshness is always visible; execution price is shown separately from displayed quotes; limitations are documented (LIMITATIONS.md), never papered over.
3. **Realism through a real venue.** Orders execute at an external paper venue with genuine asynchronous lifecycles (acks, resting limit orders, partial fills, expiration) — Ledgerline does not pretend a balance mutation is a trade.
4. **Credible, restrained design.** Closer to a professional brokerage/institutional analytics product than a gamified app; green/red carry financial meaning only; numbers are the interface.
5. **$0/month MVP** on reputable free tiers, without sacrificing correctness — every provider is abstracted and replaceable.

## Register (for design work)

Product UI — design serves the task (impeccable "product" register). The bar is earned familiarity: a user fluent in Linear/Stripe-class tools should trust every component. See design/DESIGN_SYSTEM.md.

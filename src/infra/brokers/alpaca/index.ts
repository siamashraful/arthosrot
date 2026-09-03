/**
 * infra/brokers/alpaca — the sandbox venue adapter (ADR-006).
 * Vendor types never leave this directory (MODULE_BOUNDARIES.md rule 4).
 */
export { AlpacaPaperBroker, SANDBOX_BASE, type FetchFn } from "./broker";
export { translateTradeEvent, eventsFromSnapshot } from "./translate";

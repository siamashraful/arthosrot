"use client";

import { useSyncExternalStore } from "react";

/**
 * Client-side trading-mode preference (BRAND.md §5 mode system). PRESENTATION
 * ONLY: the backend is paper-only (accounts.mode DB CHECK, ADR-011) — "live"
 * here re-skins the app into the live-preview surfaces and must never cause a
 * paper fact to render as if it were real money.
 *
 * Storage mirrors the theme preference: localStorage + an attribute on
 * <html>, applied pre-hydration by the root layout script so first paint
 * carries the right mode tokens. The attribute is the single source of truth;
 * React reads it via useSyncExternalStore (server snapshot is "paper", so
 * hydration never mismatches — live-mode gating corrects immediately after).
 */

export type TradingMode = "paper" | "live";

const STORAGE_KEY = "trading-mode";

function readMode(): TradingMode {
  return document.documentElement.getAttribute("data-mode") === "live" ? "live" : "paper";
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-mode"],
  });
  return () => observer.disconnect();
}

export function setTradingMode(mode: TradingMode): void {
  if (mode === "live") {
    document.documentElement.setAttribute("data-mode", "live");
    window.localStorage.setItem(STORAGE_KEY, "live");
  } else {
    document.documentElement.removeAttribute("data-mode");
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function useTradingMode(): TradingMode {
  return useSyncExternalStore(subscribe, readMode, () => "paper");
}

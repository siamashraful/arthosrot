import { describe, expect, it } from "vitest";
import { formatDate, formatMarketStatus, formatSignedPercent } from "./format";

describe("formatSignedPercent", () => {
  it("shows the server's exact decimal string as sent, with a real minus", () => {
    expect(formatSignedPercent("1.28")).toBe("+1.28%");
    expect(formatSignedPercent("-1.68")).toBe("−1.68%");
    expect(formatSignedPercent("0.10")).toBe("+0.10%");
  });
  it("still formats numbers to 2dp", () => {
    expect(formatSignedPercent(-0.5)).toBe("−0.50%");
    expect(formatSignedPercent(2)).toBe("+2.00%");
  });
});

describe("formatDate", () => {
  it("reads a date-only string as that calendar day", () => {
    expect(formatDate("2026-09-30")).toBe("Sep 30, 2026");
  });
  it("formats a timestamp in market time (ET)", () => {
    // 02:00 UTC on Oct 1 is still Sep 30 in New York
    expect(formatDate("2026-10-01T02:00:00Z")).toBe("Sep 30, 2026");
  });
});

describe("formatMarketStatus", () => {
  it("names each session in words", () => {
    expect(formatMarketStatus("OPEN")).toBe("Market open");
    expect(formatMarketStatus("CLOSED")).toBe("Market closed");
    expect(formatMarketStatus("PRE")).toBe("Pre-market");
    expect(formatMarketStatus("POST")).toBe("After hours");
  });
});

import { describe, expect, it } from "vitest";
import { formatDayLabel, formatWholeDollars, marketDay } from "./format";

describe("marketDay", () => {
  it("is the New York calendar day, not the UTC one", () => {
    // 02:30 UTC on Oct 1 is still the evening of Sep 30 in New York.
    expect(marketDay("2026-10-01T02:30:00Z")).toBe("2026-09-30");
    expect(marketDay("2026-10-01T15:00:00Z")).toBe("2026-10-01");
  });
});

describe("formatDayLabel", () => {
  const now = Date.parse("2026-10-01T16:00:00Z"); // noon ET, Oct 1

  it("names today and yesterday in market time", () => {
    expect(formatDayLabel("2026-10-01T13:00:00Z", now)).toBe("Today");
    expect(formatDayLabel("2026-10-01T02:30:00Z", now)).toBe("Yesterday");
  });

  it("dates anything older", () => {
    expect(formatDayLabel("2026-09-28T15:00:00Z", now)).toBe("Sep 28, 2026");
  });
});

describe("formatWholeDollars", () => {
  it("groups whole dollars without cents", () => {
    expect(formatWholeDollars(10000)).toBe("$10,000");
    expect(formatWholeDollars(1000)).toBe("$1,000");
  });
});

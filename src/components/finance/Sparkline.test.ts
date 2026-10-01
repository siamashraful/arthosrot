import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Sparkline, sparklinePoints } from "./Sparkline";

const render = (values: string[] | null) =>
  renderToStaticMarkup(createElement(Sparkline, { values }));

describe("sparklinePoints", () => {
  it("spans the full width and keeps the stroke inside the box", () => {
    const pts = sparklinePoints(["10.0000", "12.0000", "11.0000"])!.split(" ");
    expect(pts).toEqual(["0.00,19.00", "28.00,1.00", "56.00,10.00"]);
  });

  it("draws a flat series at mid-height", () => {
    expect(sparklinePoints(["5.0000", "5.0000"])).toBe("0.00,10.00 56.00,10.00");
  });

  it("needs at least two usable points", () => {
    expect(sparklinePoints([])).toBeNull();
    expect(sparklinePoints(["1.0000"])).toBeNull();
    expect(sparklinePoints(["1.0000", "oops"])).toBeNull();
  });
});

describe("Sparkline", () => {
  it("renders a 56×20 aria-hidden line in --chart-line with no fill", () => {
    const html = render(["100.0000", "101.5000", "99.2500", "102.0000"]);
    expect(html).toContain('class="ar-spark"');
    expect(html).toContain('width="56"');
    expect(html).toContain('height="20"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('stroke="var(--chart-line)"');
    expect(html).toContain('fill="none"');
    // no direction colour: the delta carries gain/loss
    expect(html).not.toMatch(/gain|loss/);
  });

  it("renders nothing for fewer than two points or no series", () => {
    expect(render(["100.0000"])).toBe("");
    expect(render([])).toBe("");
    expect(render(null)).toBe("");
  });
});

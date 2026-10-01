import { describe, expect, it } from "vitest";
import { allowedLogoType, readCapped, upstreamSymbol } from "./logos";

describe("upstreamSymbol", () => {
  it("hyphenates class-share tickers for the logo CDN", () => {
    expect(upstreamSymbol("BRK.B")).toBe("BRK-B");
    expect(upstreamSymbol("BF.B")).toBe("BF-B");
  });

  it("leaves ordinary tickers untouched", () => {
    expect(upstreamSymbol("AAPL")).toBe("AAPL");
  });
});

describe("allowedLogoType", () => {
  it("passes raster types, bare and with parameters", () => {
    expect(allowedLogoType("image/png")).toBe("image/png");
    expect(allowedLogoType("IMAGE/JPEG; charset=binary")).toBe("image/jpeg");
    expect(allowedLogoType("image/webp")).toBe("image/webp");
  });

  it("refuses SVG, non-images and a missing header (same-origin script risk)", () => {
    expect(allowedLogoType("image/svg+xml")).toBeNull();
    expect(allowedLogoType("text/html")).toBeNull();
    expect(allowedLogoType("")).toBeNull();
    expect(allowedLogoType(null)).toBeNull();
  });
});

describe("readCapped", () => {
  it("returns the body when within the cap", async () => {
    const bytes = await readCapped(new Response(new Uint8Array([1, 2, 3])), 3);
    expect(bytes && [...bytes]).toEqual([1, 2, 3]);
  });

  it("refuses a body that streams past the cap", async () => {
    expect(await readCapped(new Response(new Uint8Array(10)), 9)).toBeNull();
  });

  it("refuses up front when content-length declares too much", async () => {
    const res = new Response(new Uint8Array(1), { headers: { "content-length": "999999" } });
    expect(await readCapped(res, 10)).toBeNull();
  });
});

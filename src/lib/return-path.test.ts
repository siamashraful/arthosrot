import { describe, expect, it } from "vitest";
import { safeReturnPath, signInHref } from "./return-path";

describe("safeReturnPath", () => {
  it("keeps in-app paths with their query", () => {
    expect(safeReturnPath("/portfolio")).toBe("/portfolio");
    expect(safeReturnPath("/i/AAPL?range=1M")).toBe("/i/AAPL?range=1M");
  });

  it("falls back to the dashboard when missing", () => {
    expect(safeReturnPath(null)).toBe("/");
    expect(safeReturnPath(undefined)).toBe("/");
    expect(safeReturnPath("")).toBe("/");
  });

  it("refuses anything that could leave the origin", () => {
    expect(safeReturnPath("https://evil.example")).toBe("/");
    expect(safeReturnPath("//evil.example")).toBe("/");
    expect(safeReturnPath("/\\evil.example")).toBe("/");
    expect(safeReturnPath("/\t/evil.example")).toBe("/");
    expect(safeReturnPath("javascript:alert(1)")).toBe("/");
  });

  it("never returns to an auth page", () => {
    expect(safeReturnPath("/signin")).toBe("/");
    expect(safeReturnPath("/signup?next=/orders")).toBe("/");
    expect(safeReturnPath("/signing-off")).toBe("/signing-off");
  });
});

describe("signInHref", () => {
  it("encodes the return path", () => {
    expect(signInHref("/i/AAPL?range=1M")).toBe("/signin?next=%2Fi%2FAAPL%3Frange%3D1M");
  });

  it("omits next for the dashboard or an unsafe path", () => {
    expect(signInHref("/")).toBe("/signin");
    expect(signInHref("//evil.example")).toBe("/signin");
  });
});

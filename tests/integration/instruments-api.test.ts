import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/infra/db";
import { getAuth } from "@/server/auth";
import { GET as searchGET } from "@/app/api/v1/instruments/route";
import { GET as detailGET } from "@/app/api/v1/instruments/[symbol]/route";
import { GET as quotesGET } from "@/app/api/v1/quotes/route";
import { truncateAll } from "./helpers";

/** API-level tests: auth guard, envelope shape, search/detail/quotes flows. */
describe("market API (/api/v1)", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  async function sessionCookie(): Promise<string> {
    await getAuth().api.signUpEmail({
      body: { name: "T", email: "mkt@example.com", password: "correct horse 9" },
    });
    const res = await getAuth().api.signInEmail({
      body: { email: "mkt@example.com", password: "correct horse 9" },
      returnHeaders: true,
    });
    const setCookie = res.headers.get("set-cookie") ?? "";
    return setCookie.split(";")[0] ?? "";
  }

  function get(handler: (r: Request) => Promise<Response>, url: string, cookie?: string) {
    return handler(new Request(url, { headers: cookie ? { cookie } : {} }));
  }

  it("rejects anonymous requests with the standard envelope", async () => {
    const res = await get(searchGET, "http://test.local/api/v1/instruments?query=aa");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("AUTH_REQUIRED");
    expect(typeof body.error.requestId).toBe("string");
  });

  it("registers and returns instrument detail with a timestamped quote", async () => {
    const cookie = await sessionCookie();
    const res = await get(detailGET, "http://test.local/api/v1/instruments/AAPL", cookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.instrument.symbol).toBe("AAPL");
    expect(body.quote.last).toMatch(/^\d+\.\d{4}$/);
    expect(body.quote.ts).toBeTruthy();
    expect(body.quote.source).toBe("fixture");
    expect(["live", "aging", "stale", "at-close"]).toContain(body.freshness);
    expect(["OPEN", "CLOSED", "PRE", "POST"]).toContain(body.market.status);
  });

  it("search finds registered instruments", async () => {
    const cookie = await sessionCookie();
    await get(detailGET, "http://test.local/api/v1/instruments/AAPL", cookie);
    const res = await get(searchGET, "http://test.local/api/v1/instruments?query=AAP", cookie);
    const body = await res.json();
    expect(body.instruments.some((i: { symbol: string }) => i.symbol === "AAPL")).toBe(true);
  });

  it("404s unknown symbols with subcode", async () => {
    const cookie = await sessionCookie();
    const res = await get(detailGET, "http://test.local/api/v1/instruments/ZZZZZZ", cookie);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.subcode).toBe("UNKNOWN_SYMBOL");
  });

  it("batch quotes returns strings-only money fields", async () => {
    const cookie = await sessionCookie();
    const res = await get(
      quotesGET,
      "http://test.local/api/v1/quotes?symbols=AAPL,MSFT,ZZZZZZ",
      cookie,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.quotes).sort()).toEqual(["AAPL", "MSFT"]);
    expect(body.quotes.AAPL.last).toMatch(/^\d+\.\d{4}$/);
    expect(typeof body.quotes.AAPL.bid).toBe("string");
  });

  it("validates the symbols parameter", async () => {
    const cookie = await sessionCookie();
    const res = await get(quotesGET, "http://test.local/api/v1/quotes?symbols=", cookie);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION");
  });
});

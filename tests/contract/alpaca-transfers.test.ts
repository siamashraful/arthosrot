import { describe, expect, it } from "vitest";
import { TransferRejectedError } from "@/core/cash-transfers";
import { Money } from "@/core/money";
import {
  AlpacaPaperBroker,
  pickAchRelationship,
  translateTransfer,
  translateTransferStatus,
  vendorAmountToMoney,
  type AlpacaTransfer,
} from "@/infra/brokers/alpaca";

/**
 * Alpaca Broker API transfer translation + adapter call shapes (ADR-015).
 * Payloads are recorded response SHAPES (field names/types per the Broker
 * API transfer entity; status values from its enum). No call ever reaches
 * the sandbox here — tests/external covers the real venue.
 */

const REF = { broker: "ALPACA_PAPER" as const, externalAccountId: "acct-1" };

const RECORDED_TRANSFER: AlpacaTransfer = {
  id: "be3c9a6e-6a1c-4b1e-9d5e-2f8a3c9d1e01",
  relationship_id: "rel-1",
  account_id: "acct-1",
  type: "ach",
  status: "QUEUED",
  reason: null,
  amount: "500",
  direction: "INCOMING",
  created_at: "2026-10-01T14:00:00.123456Z",
  updated_at: "2026-10-01T14:00:00.123456Z",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function recordingFetch(routes: (url: string, init?: RequestInit) => Response) {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  const fetchFn = async (url: string, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? "GET",
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return routes(url, init);
  };
  return { calls, fetchFn };
}

describe("Alpaca transfer status translation", () => {
  it.each([
    ["QUEUED", "PENDING"],
    ["APPROVAL_PENDING", "PENDING"],
    ["PENDING", "PENDING"],
    ["SENT_TO_CLEARING", "PENDING"],
    ["APPROVED", "PENDING"], // not yet "funds moved" — only COMPLETE posts money
    ["COMPLETE", "SETTLED"],
    ["REJECTED", "FAILED"],
    ["CANCELED", "FAILED"],
    ["RETURNED", "FAILED"],
    ["complete", "SETTLED"], // case-insensitive
    ["SOMETHING_NEW", "PENDING"], // unknown: never assume money moved
  ])("%s -> %s", (vendor, canonical) => {
    expect(translateTransferStatus(vendor)).toBe(canonical);
  });

  it("maps direction, amount and ids; failure reasons only on FAILED", () => {
    const t = translateTransfer(RECORDED_TRANSFER);
    expect(t.venueTransferId).toBe(RECORDED_TRANSFER.id);
    expect(t.direction).toBe("DEPOSIT");
    expect(t.amount.toString()).toBe("500.00");
    expect(t.state).toBe("PENDING");
    expect(t.failureReason).toBeNull();
    expect(t.createdAt.toISOString()).toBe("2026-10-01T14:00:00.123Z");

    const out = translateTransfer({ ...RECORDED_TRANSFER, direction: "OUTGOING" });
    expect(out.direction).toBe("WITHDRAWAL");

    const returned = translateTransfer({
      ...RECORDED_TRANSFER,
      status: "RETURNED",
      reason: "R01 insufficient funds",
    });
    expect(returned.state).toBe("FAILED");
    expect(returned.failureReason).toBe("R01 insufficient funds");

    const rejected = translateTransfer({ ...RECORDED_TRANSFER, status: "REJECTED", reason: "" });
    expect(rejected.failureReason).toBe("Transfer rejected by the venue");
  });

  it("parses vendor amounts as decimals, never floats", () => {
    expect(vendorAmountToMoney("500").toString()).toBe("500.00");
    expect(vendorAmountToMoney("500.5").toString()).toBe("500.50");
    expect(vendorAmountToMoney("1234.56").toString()).toBe("1234.56");
    expect(vendorAmountToMoney("1234.560000").toString()).toBe("1234.56");
    expect(() => vendorAmountToMoney("1234.567")).toThrow(/sub-cent/);
    expect(() => vendorAmountToMoney("-5")).toThrow();
    expect(() => vendorAmountToMoney("1e3")).toThrow();
  });

  it("rejects an unknown direction instead of guessing", () => {
    expect(() =>
      translateTransfer({ ...RECORDED_TRANSFER, direction: "SIDEWAYS" as "INCOMING" }),
    ).toThrow(/unknown direction/);
  });
});

describe("ACH relationship selection", () => {
  it("prefers APPROVED, falls back to other usable states, never CANCELED", () => {
    expect(
      pickAchRelationship([
        { id: "a", account_id: "x", status: "CANCELED" },
        { id: "b", account_id: "x", status: "QUEUED" },
        { id: "c", account_id: "x", status: "APPROVED" },
      ])?.id,
    ).toBe("c");
    expect(pickAchRelationship([{ id: "b", account_id: "x", status: "QUEUED" }])?.id).toBe("b");
    expect(
      pickAchRelationship([
        { id: "a", account_id: "x", status: "CANCELED" },
        { id: "d", account_id: "x", status: "CANCEL_REQUESTED" },
      ]),
    ).toBeNull();
  });
});

describe("AlpacaPaperBroker transfers (adapter call shapes)", () => {
  it("deposits reuse the existing ACH relationship and POST an INCOMING ach transfer", async () => {
    const { calls, fetchFn } = recordingFetch((url, init) => {
      if (url.endsWith("/ach_relationships") && (init?.method ?? "GET") === "GET") {
        return json([{ id: "rel-1", account_id: "acct-1", status: "APPROVED" }]);
      }
      if (url.endsWith("/transfers") && init?.method === "POST") return json(RECORDED_TRANSFER);
      return new Response("unexpected", { status: 500 });
    });
    const broker = new AlpacaPaperBroker("k", "s", fetchFn);
    const t = await broker.initiate(REF, {
      transferId: "local-1",
      direction: "DEPOSIT",
      amount: Money.fromString("500.00"),
    });
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      "GET /v1/accounts/acct-1/ach_relationships",
      "POST /v1/accounts/acct-1/transfers",
    ]);
    expect(calls[1]!.body).toEqual({
      transfer_type: "ach",
      relationship_id: "rel-1",
      amount: "500.00",
      direction: "INCOMING",
    });
    expect(new URL(calls[0]!.url).host).toBe("broker-api.sandbox.alpaca.markets");
    expect(t.state).toBe("PENDING");
    expect(t.venueTransferId).toBe(RECORDED_TRANSFER.id);
  });

  it("withdrawals POST an OUTGOING transfer; a missing relationship is created first", async () => {
    const { calls, fetchFn } = recordingFetch((url, init) => {
      const method = init?.method ?? "GET";
      if (url.endsWith("/ach_relationships") && method === "GET") {
        return json([{ id: "old", account_id: "acct-1", status: "CANCELED" }]);
      }
      if (url.endsWith("/ach_relationships") && method === "POST") {
        return json({ id: "rel-new", account_id: "acct-1", status: "QUEUED" });
      }
      if (url.endsWith("/transfers") && method === "POST") {
        return json({ ...RECORDED_TRANSFER, direction: "OUTGOING", relationship_id: "rel-new" });
      }
      return new Response("unexpected", { status: 500 });
    });
    const broker = new AlpacaPaperBroker("k", "s", fetchFn);
    const t = await broker.initiate(REF, {
      transferId: "local-2",
      direction: "WITHDRAWAL",
      amount: Money.fromString("500.00"),
    });
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST", "POST"]);
    expect(calls[2]!.body).toMatchObject({ relationship_id: "rel-new", direction: "OUTGOING" });
    expect(t.direction).toBe("WITHDRAWAL");
  });

  it("a 4xx (e.g. the $50k daily cap) is a definitive TransferRejectedError", async () => {
    const { fetchFn } = recordingFetch((url, init) =>
      url.endsWith("/ach_relationships")
        ? json([{ id: "rel-1", account_id: "acct-1", status: "APPROVED" }])
        : init?.method === "POST"
          ? json({ code: 40010001, message: "maximum total daily transfer allowed is $50000" }, 400)
          : new Response("unexpected", { status: 500 }),
    );
    const broker = new AlpacaPaperBroker("k", "s", fetchFn);
    const err = await broker
      .initiate(REF, { transferId: "x", direction: "DEPOSIT", amount: Money.fromString("1.00") })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransferRejectedError);
    expect((err as TransferRejectedError).reason).toMatch(/maximum total daily transfer/);
  });

  it("a 5xx is ambiguous: a plain error, NOT a rejection (the transfer may exist)", async () => {
    const { fetchFn } = recordingFetch((url) =>
      url.endsWith("/ach_relationships")
        ? json([{ id: "rel-1", account_id: "acct-1", status: "APPROVED" }])
        : json({ code: 50010000, message: "internal server error occurred" }, 500),
    );
    const broker = new AlpacaPaperBroker("k", "s", fetchFn);
    const err = await broker
      .initiate(REF, { transferId: "x", direction: "DEPOSIT", amount: Money.fromString("1.00") })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(TransferRejectedError);
  });

  it("getTransfer pages the list until it finds the id; null only after every page", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      ...RECORDED_TRANSFER,
      id: `t-${i}`,
    }));
    const target = { ...RECORDED_TRANSFER, id: "target", status: "COMPLETE" };
    const { calls, fetchFn } = recordingFetch((url) => {
      const offset = new URL(url).searchParams.get("offset");
      return json(offset === "0" ? page1 : [target]);
    });
    const broker = new AlpacaPaperBroker("k", "s", fetchFn);
    const found = await broker.getTransfer(REF, "target");
    expect(found?.state).toBe("SETTLED");
    expect(calls.map((c) => new URL(c.url).searchParams.get("offset"))).toEqual(["0", "100"]);
    expect(new URL(calls[0]!.url).pathname).toBe("/v1/accounts/acct-1/transfers");

    expect(await broker.getTransfer(REF, "nope")).toBeNull();
  });

  it("getTransfer propagates lookup errors (never reads an error as 'no record')", async () => {
    const { fetchFn } = recordingFetch(() => new Response("Not Found", { status: 404 }));
    const broker = new AlpacaPaperBroker("k", "s", fetchFn);
    await expect(broker.getTransfer(REF, "x")).rejects.toThrow(/HTTP 404/);
  });

  it("listTransfers filters by created_at and never lists the opening funding transfer", async () => {
    const { fetchFn } = recordingFetch(() =>
      json([
        // the account's oldest INCOMING transfer is its provisioning deposit
        { ...RECORDED_TRANSFER, id: "opening", created_at: "2026-10-01T09:00:00Z" },
        {
          ...RECORDED_TRANSFER,
          id: "old",
          created_at: "2026-09-30T23:00:00Z",
          direction: "OUTGOING",
        },
        { ...RECORDED_TRANSFER, id: "new", created_at: "2026-10-01T14:00:00Z" },
      ]),
    );
    const broker = new AlpacaPaperBroker("k", "s", fetchFn);
    // "old" is older than "opening" here but OUTGOING — so no funding row is
    // identified, and "opening" (inside the window) is a user deposit
    const list = await broker.listTransfers(REF, new Date("2026-10-01T00:00:00Z"));
    expect(list).toMatchObject({ complete: true });
    expect(list.transfers.map((t) => t.venueTransferId).sort()).toEqual(["new", "opening"]);

    const { fetchFn: fundedFetch } = recordingFetch(() =>
      json([
        { ...RECORDED_TRANSFER, id: "user", created_at: "2026-10-01T09:20:00Z" },
        { ...RECORDED_TRANSFER, id: "opening", created_at: "2026-10-01T09:00:00Z" },
      ]),
    );
    const funded = new AlpacaPaperBroker("k", "s", fundedFetch);
    const all = await funded.listTransfers(REF, new Date(0));
    expect(all.transfers.map((t) => t.venueTransferId)).toEqual(["user"]);
  });

  it("listTransfers skips unreadable rows one by one and reports the listing incomplete", async () => {
    const { fetchFn } = recordingFetch(() =>
      json([
        { ...RECORDED_TRANSFER, id: "opening", created_at: "2026-10-01T09:00:00Z" },
        { ...RECORDED_TRANSFER, id: "bad-date", created_at: "not-a-date" },
        { ...RECORDED_TRANSFER, id: "bad-amount", amount: "1.234" },
        { ...RECORDED_TRANSFER, id: "bad-direction", direction: "SIDEWAYS" },
        { ...RECORDED_TRANSFER, id: "good" },
      ]),
    );
    const broker = new AlpacaPaperBroker("k", "s", fetchFn);
    const list = await broker.listTransfers(REF, new Date(0));
    expect(list.complete).toBe(false);
    expect(list.transfers.map((t) => t.venueTransferId)).toEqual(["good"]);
  });

  it("translateTransfer refuses an invalid created_at instead of inventing a date", () => {
    expect(() => translateTransfer({ ...RECORDED_TRANSFER, created_at: "garbage" })).toThrow(
      /invalid created_at/,
    );
  });

  it("cancelTransfer DELETEs the transfer; a 4xx is a refusal (false)", async () => {
    const { calls, fetchFn } = recordingFetch((_url, init) =>
      init?.method === "DELETE" ? new Response(null, { status: 204 }) : json({}, 500),
    );
    const broker = new AlpacaPaperBroker("k", "s", fetchFn);
    expect(await broker.cancelTransfer(REF, "t-1")).toBe(true);
    expect(`${calls[0]!.method} ${new URL(calls[0]!.url).pathname}`).toBe(
      "DELETE /v1/accounts/acct-1/transfers/t-1",
    );
    const refused = new AlpacaPaperBroker(
      "k",
      "s",
      recordingFetch(() => json({ message: "transfer is not cancelable" }, 422)).fetchFn,
    );
    expect(await refused.cancelTransfer(REF, "t-1")).toBe(false);
  });
});

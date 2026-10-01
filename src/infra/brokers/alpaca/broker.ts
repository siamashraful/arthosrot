import type { BrokerAccountRef } from "@/core/accounts";
import type {
  Broker,
  BrokerAccountSnapshot,
  BrokerOrderRequest,
  BrokerOrderSnapshot,
  CancelResult,
  EventCursor,
  ProvisionRequest,
  Subscription,
  SubmitResult,
} from "@/core/execution";
import {
  TransferRejectedError,
  type CashTransferDirection,
  type CashTransferVenue,
  type VenueTransfer,
  type VenueTransferListing,
} from "@/core/cash-transfers";
import { Money, Qty } from "@/core/money";
import type { CanonicalBrokerEvent } from "@/core/orders";
import {
  eventsFromSnapshot,
  translateTradeEvent,
  type AlpacaFillActivity,
  type AlpacaOrder,
  type AlpacaTradeEvent,
} from "./translate";
import {
  directionToVendor,
  pickAchRelationship,
  translateTransfer,
  vendorTimestamp,
  type AlpacaAchRelationship,
  type AlpacaTransfer,
} from "./transfers";

/**
 * AlpacaPaperBroker — the deployed execution venue (ADR-006): one isolated
 * SANDBOX brokerage account per Arthosrot account. The sandbox base URL is a
 * constant: the production broker-api hostname appears nowhere at MVP
 * (SECURITY.md paper/live isolation). Synthetic KYC only — never real PII.
 *
 * Exercised against the real sandbox ONLY by tests/external (manual smoke);
 * CI covers translation with recorded payloads and lifecycle via the
 * DeterministicPaperBroker under the same contract.
 */

export const SANDBOX_BASE = "https://broker-api.sandbox.alpaca.markets";

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** Synthetic sandbox bank (never real data) for the simulated ACH relationship. */
const SIMULATED_BANK = {
  account_owner_name: "Paper Account",
  bank_account_type: "CHECKING",
  bank_account_number: "123456789",
  bank_routing_number: "121000358",
  nickname: "Simulated funding",
};

/**
 * 4xx responses to a transfer POST mean the venue did NOT create it
 * (e.g. 400 `40010001 maximum total daily transfer allowed is $50000`) —
 * a definitive rejection. 5xx/timeouts are ambiguous and throw plainly.
 */
const TRANSFER_REJECT_STATUSES = [400, 401, 403, 404, 409, 422, 429];
const TRANSFER_PAGE = 100;
const TRANSFER_MAX_PAGES = 50;

export class AlpacaPaperBroker implements Broker, CashTransferVenue {
  readonly kind = "ALPACA_PAPER" as const;
  private readonly authHeader: string;

  constructor(
    keyId: string,
    secret: string,
    private readonly fetchFn: FetchFn = (url, init) => fetch(url, init),
  ) {
    this.authHeader = `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    okStatuses: number[] = [],
  ): Promise<{ status: number; body: T }> {
    const res = await this.fetchFn(`${SANDBOX_BASE}${path}`, {
      method,
      headers: {
        authorization: this.authHeader,
        "content-type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok && !okStatuses.includes(res.status)) {
      const text = await res.text().catch(() => "");
      throw new Error(`alpaca ${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = res.status === 204 ? null : await res.json().catch(() => null);
    return { status: res.status, body: json as T };
  }

  /** Create + fund a sandbox brokerage account with SYNTHETIC KYC data. */
  async provisionAccount(req: ProvisionRequest): Promise<BrokerAccountRef> {
    const suffix = req.arthosrotAccountId.replace(/-/g, "").slice(0, 12);
    const { body: account } = await this.request<{ id: string }>("POST", "/v1/accounts", {
      contact: {
        email_address: `paper-${suffix}@example.com`,
        phone_number: "555-555-0100",
        street_address: ["100 Simulation Way"],
        city: "San Mateo",
        state: "CA",
        postal_code: "94401",
        country: "USA",
      },
      identity: {
        given_name: "Paper",
        family_name: `Account${suffix.slice(0, 6)}`,
        date_of_birth: "1990-01-01",
        tax_id: "444-55-4321", // sandbox-documented synthetic SSN
        tax_id_type: "USA_SSN",
        country_of_citizenship: "USA",
        country_of_tax_residence: "USA",
        funding_source: ["employment_income"],
      },
      disclosures: {
        is_control_person: false,
        is_affiliated_exchange_or_finra: false,
        is_politically_exposed: false,
        immediate_family_exposed: false,
      },
      agreements: [
        {
          agreement: "customer_agreement",
          signed_at: new Date().toISOString(),
          ip_address: "127.0.0.1",
        },
        {
          // Sandbox accounts are margin-type; WITHOUT this agreement the
          // orders endpoint returns an unhandled HTTP 500 on every submit
          // (verified live: with it, the venue responds properly). Arthosrot
          // still enforces cash-only semantics in its own pre-trade checks.
          agreement: "margin_agreement",
          signed_at: new Date().toISOString(),
          ip_address: "127.0.0.1",
        },
      ],
    });

    // Simulated ACH relationship + incoming transfer (settles in 10-30 min —
    // INTEGRATIONS.md; activation waits via AccountProvisioner.settledCash).
    const { body: rel } = await this.request<{ id: string }>(
      "POST",
      `/v1/accounts/${account.id}/ach_relationships`,
      SIMULATED_BANK,
    );
    await this.request("POST", `/v1/accounts/${account.id}/transfers`, {
      transfer_type: "ach",
      relationship_id: rel.id,
      amount: req.startingCash.toString(),
      direction: "INCOMING",
    });

    return { broker: this.kind, externalAccountId: account.id };
  }

  // -------------------------------------------------------------------------
  // CashTransferVenue (ADR-015): paper deposits = ACH INCOMING, withdrawals =
  // ACH OUTGOING, on the account's existing simulated ACH relationship.
  // Settlement is asynchronous (10–30 min, INTEGRATIONS.md) — callers poll.
  // -------------------------------------------------------------------------

  async initiate(
    ref: BrokerAccountRef,
    req: { transferId: string; direction: CashTransferDirection; amount: Money },
  ): Promise<VenueTransfer> {
    const accountId = ref.externalAccountId;
    const relationshipId = await this.ensureAchRelationship(accountId);
    const { status, body } = await this.request<AlpacaTransfer & { message?: string }>(
      "POST",
      `/v1/accounts/${accountId}/transfers`,
      {
        transfer_type: "ach",
        relationship_id: relationshipId,
        amount: req.amount.toString(),
        direction: directionToVendor(req.direction),
      },
      TRANSFER_REJECT_STATUSES,
    );
    if (status >= 400) {
      throw new TransferRejectedError(
        body?.message
          ? `${body.message} (HTTP ${status})`
          : `Venue refused the transfer (HTTP ${status})`,
      );
    }
    return translateTransfer(body);
  }

  /**
   * The Broker API documents list (not get-by-id) for transfers, so this
   * pages the account's transfers until it finds the id. null only when
   * every page was read — "the venue has no record" must be authoritative.
   */
  async getTransfer(ref: BrokerAccountRef, venueTransferId: string): Promise<VenueTransfer | null> {
    let found: AlpacaTransfer | null = null;
    await this.pageTransfers(ref.externalAccountId, (batch) => {
      found = batch.find((t) => t.id === venueTransferId) ?? null;
      return found !== null;
    });
    return found ? translateTransfer(found) : null;
  }

  /**
   * User transfers created at/after `since`. Every page is read: rows that
   * cannot be translated (bad date/amount/direction) are skipped and logged
   * one by one — never thrown, so one bad row cannot stall recovery — and
   * the listing reports itself incomplete. The account's OPENING funding
   * transfer (its oldest; provisionAccount posts it right after creating
   * the account, before any user transfer can exist) is never listed.
   */
  async listTransfers(ref: BrokerAccountRef, since: Date): Promise<VenueTransferListing> {
    const rows: AlpacaTransfer[] = [];
    await this.pageTransfers(ref.externalAccountId, (batch) => {
      rows.push(...batch);
      return false;
    });

    let skipped = 0;
    const skip = (row: unknown, err: unknown) => {
      skipped += 1;
      console.error(
        JSON.stringify({
          level: "error",
          msg: "alpaca transfer row unreadable; skipped (listing incomplete)",
          account: ref.externalAccountId,
          id: (row as { id?: unknown } | null)?.id ?? null,
          err: String(err),
        }),
      );
    };

    const dated: Array<{ row: AlpacaTransfer; at: number }> = [];
    for (const row of rows) {
      try {
        dated.push({ row, at: vendorTimestamp(row?.created_at).getTime() });
      } catch (err) {
        skip(row, err);
      }
    }
    const opening = dated.reduce<{ row: AlpacaTransfer; at: number } | null>(
      (oldest, d) => (oldest === null || d.at < oldest.at ? d : oldest),
      null,
    );

    const transfers: VenueTransfer[] = [];
    for (const d of dated) {
      if (d.at < since.getTime()) continue;
      if (d === opening && d.row.direction === "INCOMING") continue; // account funding
      try {
        transfers.push(translateTransfer(d.row));
      } catch (err) {
        skip(d.row, err);
      }
    }
    return { transfers, complete: skipped === 0 };
  }

  /** DELETE the transfer (Broker API "close a transfer"); a 4xx means the venue refused. */
  async cancelTransfer(ref: BrokerAccountRef, venueTransferId: string): Promise<boolean> {
    const { status } = await this.request(
      "DELETE",
      `/v1/accounts/${ref.externalAccountId}/transfers/${encodeURIComponent(venueTransferId)}`,
      undefined,
      TRANSFER_REJECT_STATUSES,
    );
    return status < 400;
  }

  /** Page /transfers (limit/offset) until `stop` returns true or pages run out. */
  private async pageTransfers(
    accountId: string,
    stop: (batch: AlpacaTransfer[]) => boolean,
  ): Promise<void> {
    for (let page = 0; page < TRANSFER_MAX_PAGES; page++) {
      const qs = new URLSearchParams({
        limit: String(TRANSFER_PAGE),
        offset: String(page * TRANSFER_PAGE),
      });
      const { body } = await this.request<AlpacaTransfer[]>(
        "GET",
        `/v1/accounts/${accountId}/transfers?${qs.toString()}`,
      );
      const batch = body ?? [];
      if (stop(batch) || batch.length < TRANSFER_PAGE) return;
    }
    throw new Error(`alpaca transfers for ${accountId} exceed ${TRANSFER_MAX_PAGES} pages`);
  }

  /** Reuse the account's ACH relationship (created at provisioning); create one only if none. */
  private async ensureAchRelationship(accountId: string): Promise<string> {
    const { body: rels } = await this.request<AlpacaAchRelationship[]>(
      "GET",
      `/v1/accounts/${accountId}/ach_relationships`,
    );
    const existing = pickAchRelationship(rels ?? []);
    if (existing) return existing.id;
    const { body: created } = await this.request<{ id: string }>(
      "POST",
      `/v1/accounts/${accountId}/ach_relationships`,
      SIMULATED_BANK,
    );
    return created.id;
  }

  async submit(req: BrokerOrderRequest): Promise<SubmitResult> {
    const { status, body } = await this.request<{ id: string }>(
      "POST",
      `/v1/trading/accounts/${req.brokerAccountId}/orders`,
      {
        symbol: req.symbol,
        qty: req.qty.toString(),
        side: req.side.toLowerCase(),
        type: req.type.toLowerCase(),
        time_in_force: "day",
        ...(req.limitPrice ? { limit_price: req.limitPrice.toString() } : {}),
        client_order_id: req.clientOrderId,
        extended_hours: req.extendedHours,
      },
      [422, 409], // duplicate client_order_id / rejected-shaped responses
    );
    if (status === 409 || status === 422) {
      // Duplicate client_order_id (venue-level idempotency, link 2): recover
      // the existing venue order instead of failing the submit.
      const existing = await this.getOrderByClientId(req.brokerAccountId, req.clientOrderId);
      if (existing) return { brokerOrderId: existing.brokerOrderId, duplicate: true };
      throw new Error(`alpaca submit rejected with HTTP ${status} and no existing order`);
    }
    return { brokerOrderId: body.id, duplicate: false };
  }

  async cancel(brokerAccountId: string, clientOrderId: string): Promise<CancelResult> {
    const snapshot = await this.getOrderByClientId(brokerAccountId, clientOrderId);
    if (!snapshot) return { accepted: false, reason: "unknown order" };
    const { status } = await this.request(
      "DELETE",
      `/v1/trading/accounts/${brokerAccountId}/orders/${snapshot.brokerOrderId}`,
      undefined,
      [404, 422],
    );
    return status === 204
      ? { accepted: true }
      : { accepted: false, reason: `venue refused (HTTP ${status})` };
  }

  async getOrderByClientId(
    brokerAccountId: string,
    clientOrderId: string,
  ): Promise<BrokerOrderSnapshot | null> {
    const { status, body } = await this.request<AlpacaOrder>(
      "GET",
      `/v1/trading/accounts/${brokerAccountId}/orders:by_client_order_id?client_order_id=${encodeURIComponent(clientOrderId)}`,
      undefined,
      [404],
    );
    if (status === 404 || !body) return null;
    // Only orders with executions need the activity lookup; scoping it to
    // the order's submit time keeps an old order's fills inside one page.
    const fills = Qty.of(body.filled_qty || "0").isPositive()
      ? await this.fillActivities(brokerAccountId, body.submitted_at)
      : [];
    return this.toSnapshot(brokerAccountId, body, fills);
  }

  async listOpenOrders(brokerAccountId: string): Promise<BrokerOrderSnapshot[]> {
    const { body } = await this.request<AlpacaOrder[]>(
      "GET",
      `/v1/trading/accounts/${brokerAccountId}/orders?status=open&limit=500`,
    );
    const fills = await this.fillActivities(brokerAccountId);
    return (body ?? []).map((o) => this.toSnapshot(brokerAccountId, o, fills));
  }

  async getAccountSnapshot(brokerAccountId: string): Promise<BrokerAccountSnapshot> {
    const [{ body: account }, { body: positions }] = await Promise.all([
      this.request<{ cash: string }>("GET", `/v1/trading/accounts/${brokerAccountId}/account`),
      this.request<Array<{ symbol: string; qty: string }>>(
        "GET",
        `/v1/trading/accounts/${brokerAccountId}/positions`,
      ),
    ]);
    return {
      externalAccountId: brokerAccountId,
      cash: Money.fromVendorDecimal(account.cash),
      positions: (positions ?? []).map((p) => ({ symbol: p.symbol, qty: Qty.of(p.qty) })),
    };
  }

  /**
   * Replayable SSE trade-event stream (/v2/events/trades, since_ulid cursor).
   * Reconnects with backoff; exactly-once is the CONSUMER's job (unique
   * external ids) — this stream may deliver duplicates by design.
   */
  subscribe(
    cursor: EventCursor | null,
    onEvent: (event: CanonicalBrokerEvent) => Promise<void>,
  ): Subscription {
    let closed = false;
    let lastUlid = cursor?.lastExternalEventId ?? null;

    const run = async (): Promise<void> => {
      let backoffMs = 1_000;
      while (!closed) {
        try {
          const qs = lastUlid ? `?since_ulid=${encodeURIComponent(lastUlid)}` : "";
          const res = await this.fetchFn(`${SANDBOX_BASE}/v2/events/trades${qs}`, {
            headers: { authorization: this.authHeader, accept: "text/event-stream" },
          });
          if (!res.ok || !res.body) throw new Error(`SSE HTTP ${res.status}`);
          backoffMs = 1_000;

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done || closed) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data:")) continue; // comments/heartbeats
              const payload = line.slice(5).trim();
              if (!payload || payload === "[]") continue;
              const raw = JSON.parse(payload) as AlpacaTradeEvent;
              const event = translateTradeEvent(raw);
              await onEvent(event);
              lastUlid = raw.event_id ?? lastUlid;
            }
          }
        } catch (err) {
          if (closed) return;
          console.error(
            JSON.stringify({
              level: "warn",
              msg: "alpaca stream error; reconnecting",
              err: String(err),
            }),
          );
          await new Promise((r) => setTimeout(r, backoffMs));
          backoffMs = Math.min(backoffMs * 2, 30_000);
        }
      }
    };
    void run();

    return {
      close: () => {
        closed = true;
      },
    };
  }

  /**
   * FILL activities for one account (Broker API: the account is a QUERY
   * parameter). Any non-2xx THROWS — the previous path 404'd, and treating
   * that as "no fills" made every filled order look open while reconciliation
   * reported healthy. Oldest-first from `after` (an order's submit time, less
   * a minute of clock slack), paged until the venue has nothing more.
   */
  private async fillActivities(
    brokerAccountId: string,
    after?: string,
  ): Promise<AlpacaFillActivity[]> {
    const all: AlpacaFillActivity[] = [];
    const since = after ? new Date(Date.parse(after) - 60_000).toISOString() : undefined;
    let pageToken: string | undefined;
    for (let page = 0; page < 20; page++) {
      const qs = new URLSearchParams({
        account_id: brokerAccountId,
        direction: "asc",
        page_size: "100",
        ...(since ? { after: since } : {}),
        ...(pageToken ? { page_token: pageToken } : {}),
      });
      const { body } = await this.request<AlpacaFillActivity[]>(
        "GET",
        `/v1/accounts/activities/FILL?${qs.toString()}`,
      );
      const batch = body ?? [];
      all.push(...batch);
      if (batch.length < 100) break;
      pageToken = batch.at(-1)!.id;
    }
    return all;
  }

  private toSnapshot(
    brokerAccountId: string,
    order: AlpacaOrder,
    fills: AlpacaFillActivity[],
  ): BrokerOrderSnapshot {
    return {
      clientOrderId: order.client_order_id,
      brokerOrderId: order.id,
      status: order.status,
      filledQty: Qty.of(order.filled_qty || "0"),
      events: eventsFromSnapshot(brokerAccountId, order, fills),
    };
  }
}

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
import { Money, Qty } from "@/core/money";
import type { CanonicalBrokerEvent } from "@/core/orders";
import {
  eventsFromSnapshot,
  translateTradeEvent,
  type AlpacaFillActivity,
  type AlpacaOrder,
  type AlpacaTradeEvent,
} from "./translate";

/**
 * AlpacaPaperBroker — the deployed execution venue (ADR-006): one isolated
 * SANDBOX brokerage account per Ledgerline account. The sandbox base URL is a
 * constant: the production broker-api hostname appears nowhere at MVP
 * (SECURITY.md paper/live isolation). Synthetic KYC only — never real PII.
 *
 * Exercised against the real sandbox ONLY by tests/external (manual smoke);
 * CI covers translation with recorded payloads and lifecycle via the
 * DeterministicPaperBroker under the same contract.
 */

const SANDBOX_BASE = "https://broker-api.sandbox.alpaca.markets";

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export class AlpacaPaperBroker implements Broker {
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
    const suffix = req.ledgerlineAccountId.replace(/-/g, "").slice(0, 12);
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
      ],
    });

    // Sandbox instant funding: simulated ACH relationship + incoming transfer.
    const { body: rel } = await this.request<{ id: string }>(
      "POST",
      `/v1/accounts/${account.id}/ach_relationships`,
      {
        account_owner_name: "Paper Account",
        bank_account_type: "CHECKING",
        bank_account_number: "123456789",
        bank_routing_number: "121000358",
        nickname: "Simulated funding",
      },
    );
    await this.request("POST", `/v1/accounts/${account.id}/transfers`, {
      transfer_type: "ach",
      relationship_id: rel.id,
      amount: req.startingCash.toString(),
      direction: "INCOMING",
    });

    return { broker: this.kind, externalAccountId: account.id };
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
    const fills = await this.fillActivities(brokerAccountId);
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
      cash: Money.fromString(Number(account.cash).toFixed(2)),
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

  private async fillActivities(brokerAccountId: string): Promise<AlpacaFillActivity[]> {
    const { body } = await this.request<AlpacaFillActivity[]>(
      "GET",
      `/v1/accounts/${brokerAccountId}/activities/FILL?page_size=100`,
      undefined,
      [404],
    );
    return body ?? [];
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

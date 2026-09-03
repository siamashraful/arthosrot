import { z } from "zod";
import { env } from "@/env";
import { SANDBOX_BASE } from "@/infra/brokers/alpaca";
import { getCachedLogo, putCachedLogo, type CachedLogo } from "@/infra/market-data/logo-cache";

/**
 * Stock-logo proxy. The Alpaca logos endpoint needs broker credentials,
 * which never reach the browser — so the server fetches once and caches the
 * bytes (7-day TTL, market_data_cache). Without a broker key
 * (deterministic/dev) this 404s immediately and the UI's monogram fallback
 * takes over; offline dev never breaks.
 */

const symbolSchema = z
  .string()
  .min(1)
  .max(10)
  .regex(/^[A-Za-z.\-]+$/);

export async function getLogo(symbolRaw: string): Promise<Response> {
  const parsed = symbolSchema.safeParse(symbolRaw);
  if (!parsed.success) return new Response(null, { status: 404 });
  const symbol = parsed.data.toUpperCase();

  const { ALPACA_BROKER_KEY, ALPACA_BROKER_SECRET } = env();
  if (!ALPACA_BROKER_KEY || !ALPACA_BROKER_SECRET) {
    return new Response(null, { status: 404 });
  }

  const cached = await getCachedLogo(symbol);
  if (cached) return logoResponse(cached);

  const upstream = await fetch(`${SANDBOX_BASE}/v1beta1/logos/${symbol}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${ALPACA_BROKER_KEY}:${ALPACA_BROKER_SECRET}`).toString("base64")}`,
    },
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);
  if (!upstream || !upstream.ok) return new Response(null, { status: 404 });

  const bytes = Buffer.from(await upstream.arrayBuffer());
  const logo: CachedLogo = {
    b64: bytes.toString("base64"),
    contentType: upstream.headers.get("content-type") ?? "image/png",
  };
  await putCachedLogo(symbol, logo);
  return logoResponse(logo);
}

function logoResponse(logo: CachedLogo): Response {
  return new Response(Buffer.from(logo.b64, "base64"), {
    status: 200,
    headers: {
      "content-type": logo.contentType,
      // browser-cached per user; the DB cache covers cold serverless starts
      "cache-control": "private, max-age=86400",
    },
  });
}

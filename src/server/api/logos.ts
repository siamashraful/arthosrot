import { env } from "@/env";
import { getCachedLogo, putCachedLogo, type CachedLogo } from "@/infra/market-data/logo-cache";
import { symbolSchema } from "./market";

/**
 * Stock-logo proxy over a keyless public CDN (LOGO_UPSTREAM template —
 * Alpaca's own logo API is subscription-gated, verified: "Subscription does
 * not permit querying logos"). The server fetches once and caches the bytes
 * (7-day TTL, market_data_cache); the browser never talks to the third
 * party. Unset upstream (dev/CI) or a miss -> 404 -> the UI's designed
 * monogram tile. The upstream is config, not code: swap the env var to swap
 * vendors (INTEGRATIONS.md).
 */

export async function getLogo(symbolRaw: string): Promise<Response> {
  const parsed = symbolSchema.safeParse(symbolRaw);
  if (!parsed.success) return new Response(null, { status: 404 });
  const symbol = parsed.data.toUpperCase();

  const { LOGO_UPSTREAM } = env();
  if (!LOGO_UPSTREAM) return new Response(null, { status: 404 });

  const cached = await getCachedLogo(symbol);
  if (cached) return logoResponse(cached);

  const upstream = await fetch(
    LOGO_UPSTREAM.replace("{SYMBOL}", encodeURIComponent(upstreamSymbol(symbol))),
    { signal: AbortSignal.timeout(5_000) },
  ).catch(() => null);
  if (!upstream || !upstream.ok || !upstream.headers.get("content-type")?.startsWith("image/")) {
    return new Response(null, { status: 404 });
  }

  const bytes = Buffer.from(await upstream.arrayBuffer());
  const logo: CachedLogo = {
    b64: bytes.toString("base64"),
    contentType: upstream.headers.get("content-type") ?? "image/png",
  };
  await putCachedLogo(symbol, logo);
  return logoResponse(logo);
}

/**
 * Class-share tickers are dotted at the venue (BRK.B) but hyphenated at the
 * logo CDN (BRK-B) — the common convention for share classes in symbol URLs.
 */
export function upstreamSymbol(symbol: string): string {
  return symbol.replace(/\./g, "-");
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

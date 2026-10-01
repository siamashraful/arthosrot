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
 *
 * Served same-origin, so only inert raster types pass (never SVG — it could
 * run script), bodies are capped, and responses carry nosniff.
 */

/** Raster types only — anything else (SVG, HTML, unknown) is a miss. */
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
/** Real logos are a few KB; anything this large is not one. */
export const MAX_LOGO_BYTES = 512 * 1024;

const miss = () => new Response(null, { status: 404 });

export async function getLogo(symbolRaw: string): Promise<Response> {
  const parsed = symbolSchema.safeParse(symbolRaw);
  if (!parsed.success) return miss();
  const symbol = parsed.data.toUpperCase();

  const { LOGO_UPSTREAM } = env();
  if (!LOGO_UPSTREAM) return miss();

  const cached = await getCachedLogo(symbol);
  // a row cached before the type allowlist existed is re-checked, not trusted
  if (cached && allowedLogoType(cached.contentType)) return logoResponse(cached);

  const upstream = await fetch(
    LOGO_UPSTREAM.replace("{SYMBOL}", encodeURIComponent(upstreamSymbol(symbol))),
    { signal: AbortSignal.timeout(5_000) },
  ).catch(() => null);
  const contentType = allowedLogoType(upstream?.headers.get("content-type") ?? null);
  if (!upstream || !upstream.ok || !contentType) return miss();

  const bytes = await readCapped(upstream, MAX_LOGO_BYTES).catch(() => null);
  if (!bytes || bytes.length === 0) return miss();
  const logo: CachedLogo = { b64: bytes.toString("base64"), contentType };
  await putCachedLogo(symbol, logo);
  return logoResponse(logo);
}

/** The bare media type when it is an allowed raster type, else null. */
export function allowedLogoType(header: string | null): string | null {
  const type = header?.split(";")[0]?.trim().toLowerCase() ?? "";
  return ALLOWED_TYPES.has(type) ? type : null;
}

/** Read a body, refusing (null) once it exceeds `max` bytes — never buffers more. */
export async function readCapped(res: Response, max: number): Promise<Buffer | null> {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max) return null;
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
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
      "x-content-type-options": "nosniff",
      // browser-cached per user; the DB cache covers cold serverless starts
      "cache-control": "private, max-age=86400",
    },
  });
}

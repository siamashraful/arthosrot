/**
 * "Auth required → redirect to sign-in preserving the return path"
 * (docs/design/UX_PATTERNS.md). The return path travels in `?next=` and is
 * only ever honoured as a same-origin, absolute in-app path — never a full
 * URL, a protocol-relative `//host`, or a backslash trick — so the sign-in
 * page can't be turned into an open redirect.
 */

/** Request header src/proxy.ts sets to the requested path (+ query) for server layouts. */
export const PATHNAME_HEADER = "x-arthosrot-path";

/** The in-app path to land on after sign-in; "/" when `next` is missing or unsafe. */
export function safeReturnPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.includes("\\")) return "/";
  // Control characters (incl. tab/newline, which URL parsers strip) are never legitimate.
  if (/[\u0000-\u001f\u007f]/.test(next)) return "/";
  // Back to an auth page would just bounce; the dashboard is the honest default.
  if (/^\/(signin|signup)(?:[/?#]|$)/.test(next)) return "/";
  return next;
}

/** `/signin`, carrying the page to come back to when there is one worth keeping. */
export function signInHref(returnTo: string | null | undefined): string {
  const path = safeReturnPath(returnTo);
  return path === "/" ? "/signin" : `/signin?next=${encodeURIComponent(path)}`;
}

"use client";

import { RouteError } from "@/components/route-error";

/**
 * Failures outside the app shell — the auth pages, or the (app) layout
 * itself (e.g. the session check could not reach the database).
 */
export default function RootError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <RouteError {...props} variant="standalone" />;
}

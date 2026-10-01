"use client";

import { RouteError } from "@/components/route-error";

/** A page inside the app shell failed to render: the shell (nav, ribbon) stays put. */
export default function AppError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError {...props} variant="shell" />;
}

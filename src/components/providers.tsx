"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "@/lib/api";
import { signInHref } from "@/lib/return-path";

/**
 * A 401 means the session ended under an open page (expired, or signed out
 * in another tab). Every query would otherwise just show its error state, so
 * go to sign-in once — carrying this page as the return path — and drop the
 * signed-out user's cached data on the way.
 */
let signingOut = false;

/**
 * A deliberate sign-out is not a lost session: its in-flight refetches 401
 * too, and must not win the race and send the user to /signin?next=… .
 */
export function beginSignOut(): void {
  signingOut = true;
}

function onAuthLost(client: () => QueryClient) {
  let redirecting = false;
  return (error: unknown) => {
    if (redirecting || signingOut || !(error instanceof ApiError) || error.status !== 401) return;
    redirecting = true;
    client().clear();
    window.location.assign(signInHref(window.location.pathname + window.location.search));
  };
}

/** Client errors (4xx) are answers, not blips — retrying them only delays the state. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => {
    const onError = onAuthLost(() => queryClient);
    const queryClient: QueryClient = new QueryClient({
      queryCache: new QueryCache({ onError }),
      mutationCache: new MutationCache({ onError }),
      defaultOptions: {
        queries: {
          staleTime: 5_000,
          retry: shouldRetry,
          refetchOnWindowFocus: true,
        },
      },
    });
    return queryClient;
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

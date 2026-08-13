import { getAuth } from "./auth";

export interface SessionInfo {
  userId: string;
  email: string;
  name: string;
}

/**
 * The single auth touchpoint for the rest of the app (provider-swap seam,
 * ADR-009). Returns null when unauthenticated.
 */
export async function getSession(headers: Headers): Promise<SessionInfo | null> {
  const session = await getAuth().api.getSession({ headers });
  if (!session) return null;
  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}

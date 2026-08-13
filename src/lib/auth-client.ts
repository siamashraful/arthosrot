"use client";

import { createAuthClient } from "better-auth/react";

/** Browser-side auth client (signin/signup forms). Server code uses getSession(). */
export const authClient = createAuthClient();

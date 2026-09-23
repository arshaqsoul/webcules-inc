"use client";

/* Client-side Better Auth bindings for the components playground + dashboard.
 * Server config lives in lib/auth.server.ts (D1-backed). */
import { emailOTPClient, magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [magicLinkClient(), emailOTPClient()],
});

export const { signIn, signOut, useSession } = authClient;

"use client";

/* Client-side Better Auth for Snap. Server config: lib/auth.server.ts. */
import { emailOTPClient } from "better-auth/client/plugins";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [organizationClient(), emailOTPClient()],
});

export const { signIn, signOut, signUp, useSession } = authClient;

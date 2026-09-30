/* WEB-287 — staff password reset: anti-enumeration on the request, a
 * single-use token in the verification table, reset swaps the credential,
 * and every existing session is revoked. Runs against the real auth
 * instance (sendResetPassword takes the dev-delivery path — no EMAIL
 * binding in tests). */
import { beforeEach, describe, expect, it } from "vitest";

import { getDb, schema } from "@/lib/db";
import { getAuth } from "@/lib/auth.server";
import { resetDb } from "../helpers/db";

const EMAIL = "owner@test.test";
const ORIGINAL_PASSWORD = "original-pass-1";
const NEW_PASSWORD = "brand-new-pass-1";

async function resetTokenFromDb(): Promise<string | null> {
  const rows = await getDb().select().from(schema.verification);
  const row = rows.find((r) => r.identifier.startsWith("reset-password:"));
  return row ? row.identifier.slice("reset-password:".length) : null;
}

beforeEach(async () => {
  await resetDb();
});

describe("password reset (WEB-287)", () => {
  it("unknown email gets the generic success and leaves no token behind", async () => {
    const auth = await getAuth();
    const res = await auth.api.requestPasswordReset({
      body: { email: "ghost@test.test", redirectTo: "/reset-password" },
    });
    expect(res.status).toBe(true);
    expect(await resetTokenFromDb()).toBeNull();
  });

  it("full flow: token minted, single-use, old password dead, sessions revoked", async () => {
    const auth = await getAuth();
    await auth.api.signUpEmail({
      body: { email: EMAIL, password: ORIGINAL_PASSWORD, name: "Owner" },
    });
    // A live session that must not outlive the reset.
    await auth.api.signInEmail({ body: { email: EMAIL, password: ORIGINAL_PASSWORD } });

    const res = await auth.api.requestPasswordReset({
      body: { email: EMAIL, redirectTo: "/reset-password" },
    });
    expect(res.status).toBe(true);

    const token = await resetTokenFromDb();
    expect(token).toBeTruthy();

    await auth.api.resetPassword({ body: { token: token!, newPassword: NEW_PASSWORD } });

    // Single-use: the verification row was consumed.
    expect(await resetTokenFromDb()).toBeNull();
    // revokeSessionsOnPasswordReset: no session survives.
    const sessions = await getDb().select().from(schema.session);
    expect(sessions).toHaveLength(0);

    await expect(
      auth.api.signInEmail({ body: { email: EMAIL, password: ORIGINAL_PASSWORD } }),
    ).rejects.toThrow();
    const backIn = await auth.api.signInEmail({ body: { email: EMAIL, password: NEW_PASSWORD } });
    expect(backIn.user.email).toBe(EMAIL);
  });

  it("garbage token is rejected and the real password stays untouched", async () => {
    const auth = await getAuth();
    await auth.api.signUpEmail({
      body: { email: EMAIL, password: ORIGINAL_PASSWORD, name: "Owner" },
    });
    await expect(
      auth.api.resetPassword({ body: { token: "no-such-token", newPassword: NEW_PASSWORD } }),
    ).rejects.toThrow();
    const still = await auth.api.signInEmail({
      body: { email: EMAIL, password: ORIGINAL_PASSWORD },
    });
    expect(still.user.email).toBe(EMAIL);
  });
});

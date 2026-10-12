/* Integration tokens (WEB-186, Integrations 1/6): mint → hash-only storage,
 * bearer verification, soft revocation, scope validation, and org scoping —
 * the foundation every later integration story authenticates against. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { authenticateIntegrationToken } from "@/lib/integrations/auth";
import {
  PREFIX_LEN,
  TOKEN_PREFIX,
  createIntegrationToken,
  findLiveTokenByRaw,
  listIntegrationTokens,
  normalizeName,
  normalizeScopes,
  revokeIntegrationToken,
} from "@/lib/integrations/tokens";
import { resetDb } from "../helpers/db";
import { seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

function bearerReq(token: string | null): Request {
  return new Request("https://snap.test/api/integrations/v1", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("validation", () => {
  it("names trim and cap", () => {
    expect(normalizeName("  Lightroom  ")).toBe("Lightroom");
    expect(normalizeName("x".repeat(200))).toHaveLength(80);
    expect(normalizeName("   ")).toBeNull();
    expect(normalizeName(42)).toBeNull();
  });

  it("scopes reject unknown ids, non-arrays, and empty sets; dedupes", () => {
    expect(normalizeScopes(["assets:read", "assets:read"])).toEqual([
      "assets:read",
    ]);
    expect(normalizeScopes(["assets:read", "wat:no"])).toBeNull();
    expect(normalizeScopes([])).toBeNull();
    expect(normalizeScopes("assets:read")).toBeNull();
  });
});

describe("minting", () => {
  it("stores only the hash — raw token never lands in the row", async () => {
    const org = await seedStudio();
    const { token, row } = await createIntegrationToken({
      organizationId: org.organizationId,
      name: "Lightroom",
      scopes: ["assets:write"],
    });
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(token).toHaveLength(TOKEN_PREFIX.length + 43);
    expect(row.tokenHash).not.toContain(token);
    expect(row.tokenHash).toHaveLength(64); // sha-256 hex
    expect(row.prefix).toBe(token.slice(0, PREFIX_LEN));
    expect(JSON.parse(row.scopes)).toEqual(["assets:write"]);
    // stored hash really is the sha-256 of the raw token
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token),
    );
    const hex = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    expect(row.tokenHash).toBe(hex);
  });
});

describe("bearer auth", () => {
  it("round-trips a valid token to its org context", async () => {
    const org = await seedStudio({ name: "Studio A" });
    const { token } = await createIntegrationToken({
      organizationId: org.organizationId,
      name: "Lightroom",
      scopes: ["galleries:read", "assets:write"],
    });
    const auth = await authenticateIntegrationToken(bearerReq(token));
    expect(auth).toMatchObject({
      organizationId: org.organizationId,
      tokenName: "Lightroom",
      scopes: ["galleries:read", "assets:write"],
    });
  });

  it("rejects missing, malformed, unknown, and wrong-length tokens", async () => {
    await seedStudio();
    expect(await authenticateIntegrationToken(bearerReq(null))).toBeNull();
    expect(
      await authenticateIntegrationToken(bearerReq("Basic abc")),
    ).toBeNull();
    expect(
      await authenticateIntegrationToken(bearerReq("snapit_nope")),
    ).toBeNull();
    expect(
      await authenticateIntegrationToken(
        bearerReq(`${TOKEN_PREFIX}${"a".repeat(42)}`),
      ),
    ).toBeNull();
  });

  it("a revoked token stops authenticating immediately", async () => {
    const org = await seedStudio();
    const { token, row } = await createIntegrationToken({
      organizationId: org.organizationId,
      name: "Old desktop",
      scopes: ["assets:read"],
    });
    expect(await revokeIntegrationToken(org.organizationId, row.id)).toBe(true);
    expect(await findLiveTokenByRaw(token)).toBeNull();
    expect(await authenticateIntegrationToken(bearerReq(token))).toBeNull();
    // revoking twice / revoking an unknown id is a no-op false
    expect(await revokeIntegrationToken(org.organizationId, row.id)).toBe(
      false,
    );
    expect(await revokeIntegrationToken(org.organizationId, "missing")).toBe(
      false,
    );
  });
});

describe("org scoping", () => {
  it("lists only the caller's org; cross-org revocation fails", async () => {
    const a = await seedStudio({ name: "A" });
    const b = await seedStudio({ name: "B" });
    const { row: rowA } = await createIntegrationToken({
      organizationId: a.organizationId,
      name: "A token",
      scopes: ["assets:read"],
    });
    await createIntegrationToken({
      organizationId: b.organizationId,
      name: "B token",
      scopes: ["assets:read"],
    });

    const listA = await listIntegrationTokens(a.organizationId);
    expect(listA.map((t) => t.name)).toEqual(["A token"]);
    expect(listA[0]).not.toHaveProperty("tokenHash");

    expect(await revokeIntegrationToken(b.organizationId, rowA.id)).toBe(false);
    // A's token still authenticates after B tried to revoke it
    const rows = await getDb()
      .select()
      .from(schema.integrationTokens)
      .where(eq(schema.integrationTokens.id, rowA.id));
    expect(rows[0].revokedAt).toBeNull();
  });
});

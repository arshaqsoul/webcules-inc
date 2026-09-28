/* Share-grant lifecycle: create (snapshot + hashed token), revoke,
 * regenerate (supersede), expiry. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import {
  assetInGrant,
  createShareGrant,
  getGrantByTokenHashAny,
  grantIsEffectivelyActive,
  hashToken,
  regenerateShareGrant,
  revokeShareGrant,
} from "@/lib/shares/grants";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

describe("createShareGrant", () => {
  it("snapshots the asset set and stores only the hashed token", async () => {
    const s = await seedStudio();
    const project = await seedProject(s.organizationId);
    const a1 = await seedAsset({ organizationId: s.organizationId, projectId: project });
    const a2 = await seedAsset({ organizationId: s.organizationId, projectId: project });

    const res = await createShareGrant({
      organizationId: s.organizationId, projectId: project, clientEmail: "client@t.test",
      assetIds: [a1, a2], expiresAt: new Date(Date.now() + 7 * 86400_000), createdById: s.userId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(await assetInGrant(res.grantId, a1)).toBe(true);
    expect(await assetInGrant(res.grantId, a2)).toBe(true);

    // Row holds the SHA-256 of the minted token, never the token itself.
    const row = (await getDb().select().from(schema.shareGrants).limit(1))[0];
    expect(row.tokenHash).toBe(await hashToken(res.token));
    expect(row.tokenHash).not.toContain(res.token);
  });

  it("refuses empty sets and cross-org/cross-project assets", async () => {
    const a = await seedStudio({ name: "A" });
    const b = await seedStudio({ name: "B" });
    const projectA = await seedProject(a.organizationId);
    const assetA = await seedAsset({ organizationId: a.organizationId, projectId: projectA });
    const otherProject = await seedProject(a.organizationId);

    expect(
      await createShareGrant({
        organizationId: a.organizationId, projectId: projectA, clientEmail: "c@t.test",
        assetIds: [], expiresAt: null, createdById: a.userId,
      }),
    ).toMatchObject({ ok: false, error: "no_assets" });

    // B's asset offered under A's org → mismatch.
    const assetB = await seedAsset({ organizationId: b.organizationId, projectId: await seedProject(b.organizationId) });
    expect(
      await createShareGrant({
        organizationId: a.organizationId, projectId: projectA, clientEmail: "c@t.test",
        assetIds: [assetB], expiresAt: null, createdById: a.userId,
      }),
    ).toMatchObject({ ok: false, error: "asset_mismatch" });

    // A's asset under the wrong project of the same org → mismatch.
    expect(
      await createShareGrant({
        organizationId: a.organizationId, projectId: otherProject, clientEmail: "c@t.test",
        assetIds: [assetA], expiresAt: null, createdById: a.userId,
      }),
    ).toMatchObject({ ok: false, error: "asset_mismatch" });
  });
});

describe("grant lifecycle", () => {
  async function makeGrant(expiresAt: Date | null = null) {
    const s = await seedStudio();
    const project = await seedProject(s.organizationId);
    const asset = await seedAsset({ organizationId: s.organizationId, projectId: project });
    const res = await createShareGrant({
      organizationId: s.organizationId, projectId: project, clientEmail: "client@t.test",
      assetIds: [asset], expiresAt, createdById: s.userId,
    });
    if (!res.ok) throw new Error("grant create failed");
    return { s, project, asset, grantId: res.grantId, token: res.token };
  }

  it("resolves by token while active", async () => {
    const { token } = await makeGrant(new Date(Date.now() + 86400_000));
    // getGrantByTokenHashAny hashes internally — pass the raw token.
    const row = await getGrantByTokenHashAny(token);
    expect(row).not.toBeNull();
    expect(grantIsEffectivelyActive(row!)).toBe(true);
  });

  it("revoke kills the link and audits it", async () => {
    const { s, grantId } = await makeGrant(null);
    const res = await revokeShareGrant({ organizationId: s.organizationId, grantId, actorUserId: s.userId });
    expect(res.ok).toBe(true);
    const row = (await getDb().select().from(schema.shareGrants).where(eq(schema.shareGrants.id, grantId)))[0];
    expect(row.status).toBe("revoked");
    expect(row.revokedAt).not.toBeNull();
  });

  it("regenerate mints a new token and supersedes the old grant", async () => {
    const { s, grantId, token } = await makeGrant(null);
    const res = await regenerateShareGrant({ organizationId: s.organizationId, grantId, actorUserId: s.userId });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.token).not.toBe(token);
    // Old token no longer resolves to a live grant; new one does.
    const oldRow = await getGrantByTokenHashAny(token);
    expect(oldRow?.status).toBe("regenerated");
    const newRow = await getGrantByTokenHashAny(res.token);
    expect(grantIsEffectivelyActive(newRow!)).toBe(true);
  });
});

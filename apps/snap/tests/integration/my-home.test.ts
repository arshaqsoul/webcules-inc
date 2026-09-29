/* WEB-263 client home — remembered-device session, OTP caps/consume,
 * paid-org gating, gallery listing (cover + counts), sneak-peek gating,
 * and the open-handoff session mint. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq, and } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { emailHasContent, issueMyOtp, mintMyCookie, resolveMySession, verifyMyOtp } from "@/lib/shares/my-auth";
import { listMyGalleries, listMyPeeks } from "@/lib/repos/my-home";
import { createShareGrant } from "@/lib/shares/grants";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

beforeEach(resetDb);

async function seedClientGallery(plan = "lite") {
  const s = await seedStudio({ plan });
  const db = getDb();
  // A client row so sneak peeks can attach to the project's client.
  const clientId = crypto.randomUUID();
  await db.insert(schema.clients).values({
    id: clientId,
    organizationId: s.organizationId,
    name: "Nova Client",
    email: "client@t.test",
  });
  const p = await seedProject(s.organizationId);
  await db.update(schema.projects).set({ clientId }).where(eq(schema.projects.id, p));
  const a1 = await seedAsset({ organizationId: s.organizationId, projectId: p, kind: "image", filename: "one.jpg", status: "approved" });
  const a2 = await seedAsset({ organizationId: s.organizationId, projectId: p, kind: "image", filename: "two.jpg", status: "approved" });
  const grant = await createShareGrant({
    organizationId: s.organizationId, projectId: p, clientEmail: "client@t.test",
    assetIds: [a1, a2], expiresAt: null, createdById: s.userId,
  });
  expect(grant.ok).toBe(true);
  return { studio: s, project: p, client: clientId, assets: [a1, a2], grantId: grant.ok ? grant.grantId : "" };
}

describe("remembered-device session (WEB-263)", () => {
  it("cookie round-trips for the email; tampering and foreign cookies fail", async () => {
    const cookie = (await mintMyCookie("Client@T.test")).split(";")[0];
    expect(await resolveMySession(new Headers({ cookie }))).toBe("client@t.test");
    expect(await resolveMySession(new Headers({ cookie: cookie.slice(0, -2) + "xx" }))).toBeNull();
    expect(await resolveMySession(new Headers())).toBeNull();
  });
});

describe("OTP (WEB-263)", () => {
  it("wrong emails never get a code; right ones do; codes consume on verify", async () => {
    await seedClientGallery();
    expect(await issueMyOtp("nobody@t.test")).toMatchObject({ error: "no_galleries" });
    const issued = await issueMyOtp("client@t.test");
    expect("code" in issued).toBe(true);
    if (!("code" in issued)) return;
    expect(await verifyMyOtp("client@t.test", "000000")).toBe(false);
    expect(await verifyMyOtp("client@t.test", issued.code)).toBe(true);
    expect(await verifyMyOtp("client@t.test", issued.code)).toBe(false); // consumed
  });

  it("caps at 5 codes / 15 minutes", async () => {
    await seedClientGallery();
    for (let i = 0; i < 5; i++) expect("code" in (await issueMyOtp("client@t.test"))).toBe(true);
    expect(await issueMyOtp("client@t.test")).toMatchObject({ error: "rate_limited" });
  });
});

describe("paid-org gating (WEB-267 via WEB-263)", () => {
  it("free orgs' galleries are invisible to the home; paid ones list", async () => {
    const free = await seedClientGallery("free");
    expect(await emailHasContent("client@t.test")).toBe(false);
    expect(await listMyGalleries("client@t.test")).toHaveLength(0);

    await getDb().update(schema.studioProfiles).set({ plan: "lite" }).where(eq(schema.studioProfiles.organizationId, free.studio.organizationId));
    expect(await emailHasContent("client@t.test")).toBe(true);
    const cards = await listMyGalleries("client@t.test");
    expect(cards).toHaveLength(1);
    expect(cards[0].assetCount).toBe(2);
    expect(cards[0].coverAssetId).toBeTruthy();
  });
});

describe("sneak peeks (WEB-263)", () => {
  it("flagged assets surface for the project's client only on Studio+ orgs", async () => {
    const g = await seedClientGallery("lite");
    await getDb().update(schema.assets).set({ sneakPeek: true }).where(eq(schema.assets.id, g.assets[0]));
    // Lite org: hidden.
    expect(await listMyPeeks("client@t.test")).toHaveLength(0);
    // Studio org: one project, up to its peek assets.
    await getDb().update(schema.studioProfiles).set({ plan: "studio" }).where(eq(schema.studioProfiles.organizationId, g.studio.organizationId));
    const peeks = await listMyPeeks("client@t.test");
    expect(peeks).toHaveLength(1);
    expect(peeks[0].assetIds).toEqual([g.assets[0]]);
    // Another email never sees them.
    expect(await listMyPeeks("other@t.test")).toHaveLength(0);
  });

  it("peek thumbs ride the session-cookie proxy (myimg auth mirrored)", async () => {
    const g = await seedClientGallery("studio");
    const { putObject } = await import("@/lib/storage/service");
    await putObject(g.studio.organizationId, `${g.project}/${g.assets[1]}/two.jpg`, new TextEncoder().encode("peek-bytes").buffer as ArrayBuffer, "image/jpeg");
    await getDb().update(schema.assets).set({ sneakPeek: true }).where(eq(schema.assets.id, g.assets[1]));
    const { GET: myimg } = await import("@/app/api/myimg/[id]/route");
    const cookie = (await mintMyCookie("client@t.test")).split(";")[0];
    const ok = await myimg(new Request(`https://x/api/myimg/${g.assets[1]}?p=${g.project}`, { headers: { cookie } }), { params: Promise.resolve({ id: g.assets[1] }) });
    expect(ok.status).toBe(200);
    const wrongEmail = (await mintMyCookie("other@t.test")).split(";")[0];
    const denied = await myimg(new Request(`https://x/api/myimg/${g.assets[1]}?p=${g.project}`, { headers: { cookie: wrongEmail } }), { params: Promise.resolve({ id: g.assets[1] }) });
    expect(denied.status).toBe(404);
    // Unflagged asset on the peek path → 404 even for the right email.
    const unflagged = await myimg(new Request(`https://x/api/myimg/${g.assets[0]}?p=${g.project}`, { headers: { cookie } }), { params: Promise.resolve({ id: g.assets[0] }) });
    expect(unflagged.status).toBe(404);
  });
});

describe("open handoff (WEB-263)", () => {
  it("mints a snap-g session for the matching email and redirects into the gallery", async () => {
    const g = await seedClientGallery("lite");
    const { GET: open } = await import("@/app/api/my/open/[grantId]/route");
    const cookie = (await mintMyCookie("client@t.test")).split(";")[0];
    const res = await open(new Request(`https://x/api/my/open/${g.grantId}`, { headers: { cookie } }), { params: Promise.resolve({ grantId: g.grantId }) });
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toMatch(/^\/g\/[A-Za-z0-9_-]{20,64}$/);
    expect(res.headers.get("set-cookie")).toContain("snap-g=");
    // Wrong email → bounced home, no session.
    const wrong = (await mintMyCookie("other@t.test")).split(";")[0];
    const denied = await open(new Request(`https://x/api/my/open/${g.grantId}`, { headers: { cookie: wrong } }), { params: Promise.resolve({ grantId: g.grantId }) });
    expect((denied.headers.get("location") ?? "").endsWith("/my")).toBe(true);
    expect(denied.headers.get("set-cookie")).toBeNull();
  });
});

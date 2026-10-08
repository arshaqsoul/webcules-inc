/* WEB-307 — the ingest pipeline end to end: the ①-⑤ threading corpus, R2
 * body storage, tracking-pixel neutralization on ingest, DSN bounce
 * handling, the dual-delivery mirror toggle, parse-failure triage, and the
 * lead bridge. Runs through the same ingestInboxEmail the webhook calls. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { ingestInboxEmail } from "@/lib/inbox/ingest";
import { appendThreadMessage, listInboxItems, resolveOrCreateThread } from "@/lib/repos/inbox";
import { createManualLead } from "@/lib/repos/leads";
import { mintThreadIndex, threadAddress } from "@/lib/inbox/threading";
import { resetDb } from "../helpers/db";
import { seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

async function seedThread(org: string, clientEmail: string, subject: string) {
  const threadId = await resolveOrCreateThread({ organizationId: org, clientEmail, subject });
  return threadId;
}

const PAYLOAD_BASE = {
  to: "hello@snaphq.app",
  subject: "Wedding inquiry",
  text: "We'd love to book!",
  html: null as string | null,
  messageId: null as string | null,
  inReplyTo: null as string | null,
  references: null as string | null,
  date: null,
  receivedAt: new Date().toISOString(),
  threadIndex: null as string | null,
  xSnapThreadId: null as string | null,
};

async function orgSlugStudio() {
  const s = await seedStudio();
  // Route via hello+{slug}@ like the live catch-all does.
  return { s, to: `hello+${s.slug}@snaphq.app` };
}

describe("threading pipeline ①-⑤", () => {
  it("① resolves In-Reply-To against our stored outbound ids", async () => {
    const { s, to } = await orgSlugStudio();
    const threadId = await seedThread(s.organizationId, "dana@t.test", "Wedding inquiry");
    await appendThreadMessage({
      organizationId: s.organizationId,
      threadId,
      direction: "out",
      rfcMessageId: "<out-1@snaphq.app>",
      subject: "Re: Wedding inquiry",
      textPreview: "our reply",
    });

    const res = await ingestInboxEmail({
      ...PAYLOAD_BASE,
      to,
      from: "Dana <dana@t.test>",
      subject: "Re: Wedding inquiry",
      inReplyTo: "<out-1@snaphq.app>",
      messageId: "<in-1@dana>",
    });
    expect(res.matched).toBe(true);
    expect(res.threadId).toBe(threadId);
    const msgs = await getDb().select().from(schema.threadMessages).where(eq(schema.threadMessages.threadId, threadId));
    expect(msgs.length).toBe(2);
    expect(msgs.find((m) => m.direction === "in")!.rfcMessageId).toBe("<in-1@dana>");
  });

  it("① also matches any id inside References", async () => {
    const { s, to } = await orgSlugStudio();
    const threadId = await seedThread(s.organizationId, "dana@t.test", "Wedding inquiry");
    await appendThreadMessage({
      organizationId: s.organizationId,
      threadId,
      direction: "out",
      rfcMessageId: "<chain-a@snaphq.app>",
      textPreview: "x",
    });
    const res = await ingestInboxEmail({
      ...PAYLOAD_BASE,
      to,
      from: "dana@t.test",
      references: "<older@x.test> <chain-a@snaphq.app>",
      messageId: "<in-2@dana>",
    });
    expect(res.threadId).toBe(threadId);
  });

  it("② resolves our X-Snap-Thread-ID header", async () => {
    const { s, to } = await orgSlugStudio();
    const threadId = await seedThread(s.organizationId, "dana@t.test", "Wedding inquiry");
    const res = await ingestInboxEmail({
      ...PAYLOAD_BASE,
      to,
      from: "dana@t.test",
      xSnapThreadId: threadId,
      messageId: "<in-3@dana>",
    });
    expect(res.threadId).toBe(threadId);
  });

  it("③ resolves Outlook Thread-Index by the stable GUID half", async () => {
    const { s, to } = await orgSlugStudio();
    const threadId = await seedThread(s.organizationId, "dana@t.test", "Wedding inquiry");
    // The thread carries the index we emitted outbound.
    const minted = mintThreadIndex();
    await getDb().update(schema.threads).set({ threadIndex: minted.base64 }).where(eq(schema.threads.id, threadId));
    // Outlook rewrote the clock bytes but kept the GUID (refresh simulates).
    const { refreshThreadIndexBase64 } = await import("@/lib/inbox/threading");
    const inbound = refreshThreadIndexBase64(minted.guidHex);
    const res = await ingestInboxEmail({
      ...PAYLOAD_BASE,
      to,
      from: "dana@t.test",
      threadIndex: inbound,
      messageId: "<in-4@dana>",
    });
    expect(res.threadId).toBe(threadId);
  });

  it("④ the per-thread t- address self-identifies with every header stripped", async () => {
    const { s } = await orgSlugStudio();
    const threadId = await seedThread(s.organizationId, "dana@t.test", "Wedding inquiry");
    await getDb().update(schema.threads).set({ addressToken: "tok12345" }).where(eq(schema.threads.id, threadId));
    const res = await ingestInboxEmail({
      ...PAYLOAD_BASE,
      to: threadAddress(threadId, "tok12345"),
      from: "dana@t.test",
      subject: "(headers stripped)",
      messageId: null,
    });
    expect(res.threadId).toBe(threadId);
  });

  it("⑤ subject + participant fallback; a different subject does NOT thread", async () => {
    const { s, to } = await orgSlugStudio();
    const threadId = await seedThread(s.organizationId, "dana@t.test", "Wedding inquiry");
    const hit = await ingestInboxEmail({
      ...PAYLOAD_BASE,
      to,
      from: "Dana <dana@t.test>",
      subject: "RE: FWD: Wedding inquiry", // localized prefixes strip to the same base
      messageId: "<in-5@dana>",
    });
    expect(hit.threadId).toBe(threadId);

    // Same client, unrelated subject → triage, never a wrong thread.
    const miss = await ingestInboxEmail({
      ...PAYLOAD_BASE,
      to,
      from: "Dana <dana@t.test>",
      subject: "Totally different topic",
      messageId: "<in-6@dana>",
    });
    expect(miss.matched).toBe(false);
    expect(miss.triage).toBe(true);
    const triaged = await listInboxItems({ userId: s.userId, organizationId: s.organizationId, tab: "needs-triage" });
    expect(triaged.items.length).toBe(1);
    expect(triaged.items[0].entityType).toBe("email.unmatched");
  });

  it("foreign mail with no routing and no trail is dropped quietly", async () => {
    await seedStudio();
    const res = await ingestInboxEmail({
      ...PAYLOAD_BASE,
      to: "someone@snaphq.app",
      from: "stranger@spam.test",
      subject: "buy seo",
    });
    expect(res.matched).toBe(false);
    expect(res.triage).toBeUndefined(); // no org → not even a triage item
  });
});

describe("bodies, pixels, bounces, mirror", () => {
  it("stores sanitized+neutralized HTML and the raw eml in R2, keys on the message", async () => {
    const { s, to } = await orgSlugStudio();
    const threadId = await seedThread(s.organizationId, "dana@t.test", "Wedding inquiry");
    const res = await ingestInboxEmail({
      ...PAYLOAD_BASE,
      to,
      from: "dana@t.test",
      inReplyTo: null,
      subject: "Re: Wedding inquiry",
      html: '<p style="color:#333">Hello <script>alert(1)</script></p><img src="https://t.test/px.gif" width="1" height="1">',
      messageId: "<in-7@dana>",
      rawEml: btoa("From: dana@t.test\r\nSubject: test\r\n\r\nbody"),
    });
    expect(res.threadId).toBe(threadId);
    const msg = (await getDb().select().from(schema.threadMessages).where(eq(schema.threadMessages.threadId, threadId)))[0];
    expect(msg.htmlR2Key).toMatch(new RegExp(`^${s.organizationId}/mail/${threadId}/.+\\.html$`));
    expect(msg.rawR2Key).toMatch(/\.eml$/);
    // The stored HTML is sanitized AND pixel-free.
    const { getObject } = await import("@/lib/storage/service");
    const stored = await getObject(s.organizationId, msg.htmlR2Key!);
    const html = stored ? await new Response(stored.body as unknown as BodyInit).text() : "";
    expect(html).toContain("Hello");
    expect(html).not.toContain("script");
    expect(html).not.toContain("t.test/px.gif");
  });

  it("a DSN marks our outbound message failed and surfaces on the thread", async () => {
    const { s, to } = await orgSlugStudio();
    const threadId = await seedThread(s.organizationId, "dana@t.test", "Wedding inquiry");
    await appendThreadMessage({
      organizationId: s.organizationId,
      threadId,
      direction: "out",
      rfcMessageId: "<bounced-1@snaphq.app>",
      status: "sent",
      textPreview: "our reply that will bounce",
    });
    const res = await ingestInboxEmail({
      ...PAYLOAD_BASE,
      to,
      from: "MAILER-DAEMON@mx.google.com",
      subject: "Delivery Status Notification (Failure)",
      text: "The message <bounced-1@snaphq.app> could not be delivered",
      messageId: "<dsn-1@mx>",
    });
    expect(res.bounced).toBe(true);
    expect(res.threadId).toBe(threadId);
    const msg = (await getDb().select().from(schema.threadMessages).where(eq(schema.threadMessages.rfcMessageId, "<bounced-1@snaphq.app>")))[0];
    expect(msg.status).toBe("failed");
    const items = await listInboxItems({ userId: s.userId, organizationId: s.organizationId });
    expect(items.items.some((i) => i.entityType === "email.bounced")).toBe(true);
  });

  it("parse failure mints a triage item instead of crashing", async () => {
    const { s, to } = await orgSlugStudio();
    const res = await ingestInboxEmail({
      ...PAYLOAD_BASE,
      to,
      from: "client@t.test",
      subject: "garbled",
      text: null,
      html: null,
      parseError: true,
      rawEml: btoa("binary garbage"),
    });
    expect(res.matched).toBe(false);
    expect(res.triage).toBe(true);
    const triaged = await listInboxItems({ userId: s.userId, organizationId: s.organizationId, tab: "needs-triage" });
    expect(triaged.items[0].entityType).toBe("email.parse_failed");
  });

  it("dual delivery: mirror gated by the org toggle (dev has no EMAIL binding — flag only)", async () => {
    const { s, to } = await orgSlugStudio();
    const threadId = await seedThread(s.organizationId, "dana@t.test", "Wedding inquiry");
    await ingestInboxEmail({ ...PAYLOAD_BASE, to, from: "dana@t.test", messageId: "<m-1@dana>" });
    // Default toggle ON + no contact email in seed → no crash, mirrorQueued false.
    const items = await getDb().select().from(schema.inboxItems);
    expect(items.length).toBeGreaterThan(0);

    await getDb().update(schema.studioProfiles).set({ inboxMirror: false, contactEmail: "owner@t.test" }).where(eq(schema.studioProfiles.organizationId, s.organizationId));
    const off = await ingestInboxEmail({ ...PAYLOAD_BASE, to, from: "dana@t.test", messageId: "<m-2@dana>" });
    expect(off.mirrorQueued).toBe(false);
    void threadId;
  });

  it("lead bridge: a reply on a lead's thread also lands in lead_message", async () => {
    const s = await seedStudio();
    const created = await createManualLead({
      organizationId: s.organizationId,
      actorUserId: s.userId,
      name: "Dana Doe",
      email: "dana@t.test",
      message: "hi",
      eventType: "Wedding",
    });
    if (!created.ok) throw new Error("seed failed");
    const res = await ingestInboxEmail({
      ...PAYLOAD_BASE,
      to: `hello+${created.leadId}@snaphq.app`,
      from: "Dana <dana@t.test>",
      subject: "Re: Wedding inquiry",
      messageId: "<lead-1@dana>",
    });
    expect(res.matched).toBe(true);
    const leadMsgs = await getDb().select().from(schema.leadMessages).where(eq(schema.leadMessages.leadId, created.leadId));
    expect(leadMsgs.filter((m) => m.direction === "in").length).toBe(1);
  });
});

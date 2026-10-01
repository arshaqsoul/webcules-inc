/* WEB-305 — the conversation layer: full-body round-trip on thread
 * messages, per-user thread items + mark-thread-read, and the lead-linked
 * outbound reply recording (thread message + status flip, delivered flag
 * propagated so the composer's retry banner is honest). */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import {
  appendThreadMessage,
  listThreadItems,
  markThreadItemsRead,
  mintInboxItems,
  resolveOrCreateThread,
} from "@/lib/repos/inbox";
import { createManualLead, recordOutboundReply } from "@/lib/repos/leads";
import { resetDb } from "../helpers/db";
import { seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

describe("thread message bodies", () => {
  it("stores the full stripped body (not a 500-char preview)", async () => {
    const s = await seedStudio();
    const threadId = await resolveOrCreateThread({ organizationId: s.organizationId, clientEmail: "c@t.test" });
    const long = "x".repeat(7000);
    await appendThreadMessage({
      organizationId: s.organizationId,
      threadId,
      direction: "in",
      subject: "Re: photos",
      textPreview: `intro\n\n${long}`,
    });
    const rows = await getDb().select().from(schema.threadMessages);
    expect(rows[0].textPreview.length).toBeGreaterThan(7000);
    expect(rows[0].textPreview).toContain("intro");
  });

  it("caps at 8 KB so a pathological body cannot bloat the row", async () => {
    const s = await seedStudio();
    const threadId = await resolveOrCreateThread({ organizationId: s.organizationId, clientEmail: "c@t.test" });
    await appendThreadMessage({
      organizationId: s.organizationId,
      threadId,
      direction: "in",
      textPreview: "y".repeat(20_000),
    });
    const rows = await getDb().select().from(schema.threadMessages);
    expect(rows[0].textPreview.length).toBe(8000);
  });
});

describe("thread items + read state", () => {
  it("listThreadItems returns the caller's open cards; markThreadItemsRead reads them", async () => {
    const s = await seedStudio();
    const threadId = await resolveOrCreateThread({ organizationId: s.organizationId, clientEmail: "c@t.test" });
    await mintInboxItems({
      organizationId: s.organizationId,
      kind: "booking",
      entityType: "booking",
      entityId: "b1",
      threadId,
      title: "New booking — Dana",
    });

    const before = await listThreadItems({ userId: s.userId, organizationId: s.organizationId, threadId });
    expect(before.length).toBe(1);
    expect(before[0].readAt).toBeNull();

    expect(await markThreadItemsRead({ userId: s.userId, organizationId: s.organizationId, threadId })).toBe(1);
    // Idempotent — re-opening the thread reads nothing new.
    expect(await markThreadItemsRead({ userId: s.userId, organizationId: s.organizationId, threadId })).toBe(0);
    const after = await listThreadItems({ userId: s.userId, organizationId: s.organizationId, threadId });
    expect(after[0].readAt).not.toBeNull();
  });

  it("items on OTHER threads stay unread", async () => {
    const s = await seedStudio();
    const t1 = await resolveOrCreateThread({ organizationId: s.organizationId, clientEmail: "a@t.test" });
    const t2 = await resolveOrCreateThread({ organizationId: s.organizationId, clientEmail: "b@t.test" });
    await mintInboxItems({ organizationId: s.organizationId, kind: "booking", entityType: "booking", entityId: "b1", threadId: t1, title: "one" });
    await mintInboxItems({ organizationId: s.organizationId, kind: "booking", entityType: "booking", entityId: "b2", threadId: t2, title: "two" });

    await markThreadItemsRead({ userId: s.userId, organizationId: s.organizationId, threadId: t1 });
    const other = (await listThreadItems({ userId: s.userId, organizationId: s.organizationId, threadId: t2 }))[0];
    expect(other.readAt).toBeNull();
  });
});

describe("outbound reply recording (lead-linked threads)", () => {
  it("appends the thread message with sent status and flips the lead", async () => {
    const s = await seedStudio();
    const created = await createManualLead({
      organizationId: s.organizationId,
      actorUserId: s.userId,
      name: "Dana Doe",
      email: "dana@t.test",
      message: "hi",
    });
    if (!created.ok) throw new Error("seed lead failed");

    await recordOutboundReply({
      organizationId: s.organizationId,
      leadId: created.leadId,
      fromUserId: s.userId,
      subject: "Re: inquiry",
      body: "October works for us",
    });

    const lead = (await getDb().select().from(schema.leads).where(eq(schema.leads.id, created.leadId)))[0];
    expect(lead.status).toBe("replied");
    const msgs = await getDb().select().from(schema.threadMessages);
    expect(msgs.length).toBe(1);
    expect(msgs[0].direction).toBe("out");
    expect(msgs[0].status).toBe("sent");
    expect(msgs[0].textPreview).toContain("October works for us");
  });

  it("failed delivery records status=failed (the composer's retry banner is truthful)", async () => {
    const s = await seedStudio();
    const created = await createManualLead({
      organizationId: s.organizationId,
      actorUserId: s.userId,
      name: "Dana Doe",
      email: "dana@t.test",
      message: "hi",
    });
    if (!created.ok) throw new Error("seed lead failed");

    await recordOutboundReply({
      organizationId: s.organizationId,
      leadId: created.leadId,
      fromUserId: s.userId,
      subject: "Re: inquiry",
      body: "attempt",
      delivered: false,
    });

    const msgs = await getDb().select().from(schema.threadMessages);
    expect(msgs[0].status).toBe("failed");
  });

  it("lead_message and thread stay in lockstep (one row each per reply)", async () => {
    const s = await seedStudio();
    const created = await createManualLead({
      organizationId: s.organizationId,
      actorUserId: s.userId,
      name: "Dana Doe",
      email: "dana@t.test",
      message: "hi",
    });
    if (!created.ok) throw new Error("seed lead failed");
    for (const body of ["first", "second"]) {
      await recordOutboundReply({
        organizationId: s.organizationId,
        leadId: created.leadId,
        fromUserId: s.userId,
        subject: "Re: inquiry",
        body,
      });
    }
    expect((await getDb().select().from(schema.leadMessages)).length).toBe(2);
    expect((await getDb().select().from(schema.threadMessages)).length).toBe(2);
    expect((await getDb().select().from(schema.threads)).length).toBe(1); // one conversation, not one per reply
  });
});

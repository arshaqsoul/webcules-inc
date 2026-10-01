/* WEB-308 — the lead-thread absorption: the 0059 migration converts
 * lead_message history into threads/messages (idempotent, originals kept),
 * and the triage attach picker joins threadless items to real records. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { attachTriageItem, mintInboxItems, listInboxItems } from "@/lib/repos/inbox";
import { createManualLead } from "@/lib/repos/leads";
import m59 from "../../migrations/0059_lead_thread_absorb.sql?raw";
import { applyMigrations, resetDb } from "../helpers/db";
import { seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

/** Split + run the migration's statements against the seeded data (the
 * same quote-aware splitting tests/helpers/db.ts applies at migrate time). */
async function run0059() {
  const { env } = await import("cloudflare:test");
  const statements: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const line of m59.split("\n")) {
    const trimmed = line.trim();
    if (!quote && (trimmed.startsWith("--") || trimmed === "")) continue;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === "'" || ch === '"') {
        quote = ch;
      }
    }
    current += (current ? "\n" : "") + line;
    if (!quote && trimmed.endsWith(";")) {
      statements.push(current);
      current = "";
    }
  }
  await env.D1.batch(statements.map((s) => env.D1.prepare(s)));
}

async function seedLeadWithHistory(org: string, email: string, count: number) {
  const created = await createManualLead({
    organizationId: org,
    actorUserId: crypto.randomUUID(),
    name: email.split("@")[0].replace(/^\w/, (c) => c.toUpperCase()) + " Client",
    email,
    message: "initial inquiry",
  });
  if (!created.ok) throw new Error("seed lead failed");
  const db = getDb();
  for (let i = 0; i < count; i++) {
    await db.insert(schema.leadMessages).values({
      id: crypto.randomUUID(),
      organizationId: org,
      leadId: created.leadId,
      direction: i % 2 === 0 ? "in" : "out",
      subject: `Re: thread ${email}`,
      body: `message ${i} for ${email}`,
      createdAt: new Date(Date.now() - (count - i) * 60_000),
    });
  }
  return created.leadId;
}

describe("0059 migration: lead history → threads", () => {
  it("converts every lead_message, reconciled by count; originals intact", async () => {
    const s = await seedStudio();
    await seedLeadWithHistory(s.organizationId, "dana@t.test", 4);
    await seedLeadWithHistory(s.organizationId, "eli@t.test", 2);

    const before = await getDb().select({ id: schema.leadMessages.id }).from(schema.leadMessages);
    await run0059();

    const threads = await getDb().select().from(schema.threads);
    expect(threads.length).toBe(2); // one per lead
    const msgs = await getDb().select().from(schema.threadMessages);
    expect(msgs.length).toBe(6); // 4 + 2 — count reconciliation

    // Direction/status mapped; thread activity pointers refreshed.
    const danaThread = threads.find((t) => t.clientEmail === "dana@t.test")!;
    expect(danaThread.leadId).toBeTruthy();
    expect(danaThread.lastDirection).toBe("out"); // message 3 (0-based) is out
    const danaMsgs = msgs.filter((m) => m.threadId === danaThread.id);
    expect(danaMsgs.find((m) => m.direction === "in")!.fromAddr).toBe("dana@t.test");

    // Rollback by design: originals never touched.
    const after = await getDb().select({ id: schema.leadMessages.id }).from(schema.leadMessages);
    expect(after.length).toBe(before.length);
  });

  it("is idempotent — re-running mints nothing new, and claims runtime threads", async () => {
    const s = await seedStudio();
    const leadId = await seedLeadWithHistory(s.organizationId, "dana@t.test", 2);
    await run0059();
    await run0059(); // again

    const msgs = await getDb().select().from(schema.threadMessages);
    expect(msgs.length).toBe(2);

    // A runtime thread created LATER for the same email gets claimed on a
    // re-run: its history joins the live conversation.
    await getDb().insert(schema.threads).values({
      id: crypto.randomUUID(),
      organizationId: s.organizationId,
      clientEmail: "dana@t.test",
      subject: "Wedding inquiry",
    });
    await run0059();
    const threads = await getDb().select().from(schema.threads).where(eq(schema.threads.clientEmail, "dana@t.test"));
    // Both survive (deterministic + later runtime) but BOTH now carry the
    // lead link; nothing was duplicated.
    expect(threads.length).toBe(2);
    expect(threads.every((t) => t.leadId === leadId)).toBe(true);
    const totalMsgs = await getDb().select().from(schema.threadMessages);
    expect(totalMsgs.length).toBe(2);
    void applyMigrations;
  });
});

describe("triage attach", () => {
  it("attaches a threadless item to a lead — thread created, item re-pointed + retitled", async () => {
    const s = await seedStudio();
    const leadId = await seedLeadWithHistory(s.organizationId, "dana@t.test", 0);
    await mintInboxItems({
      organizationId: s.organizationId,
      kind: "email",
      entityType: "email.unmatched",
      entityId: "unmatched-1",
      threadId: null,
      title: "Unmatched email — Dana <dana@t.test>",
      preview: "hello, are you free?",
    });
    const items = (await listInboxItems({ userId: s.userId, organizationId: s.organizationId })).items;
    const item = items.find((i) => i.entityType === "email.unmatched")!;
    expect(item.threadId).toBeNull();

    const out = await attachTriageItem({
      userId: s.userId,
      organizationId: s.organizationId,
      itemId: item.id,
      kind: "lead",
      recordId: leadId,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    const moved = (await listInboxItems({ userId: s.userId, organizationId: s.organizationId })).items[0];
    expect(moved.threadId).toBe(out.threadId);
    expect(moved.title).toBe(out.title);
    const thread = (await getDb().select().from(schema.threads).where(eq(schema.threads.id, out.threadId)))[0];
    expect(thread.leadId).toBe(leadId);
    expect(thread.clientEmail).toBe("dana@t.test");
  });

  it("attaches to a project (client email resolved through it)", async () => {
    const s = await seedStudio();
    const client = (
      await getDb()
        .insert(schema.clients)
        .values({ id: crypto.randomUUID(), organizationId: s.organizationId, email: "eli@t.test", name: "Eli" })
        .returning()
    )[0];
    const project = (
      await getDb()
        .insert(schema.projects)
        .values({ id: crypto.randomUUID(), organizationId: s.organizationId, title: "Eli Wedding", status: "booked", clientId: client.id })
        .returning()
    )[0];
    await mintInboxItems({
      organizationId: s.organizationId,
      kind: "email",
      entityType: "email.unmatched",
      entityId: "unmatched-2",
      threadId: null,
      title: "Unmatched email",
      preview: "x",
    });
    const items = (await listInboxItems({ userId: s.userId, organizationId: s.organizationId })).items;
    const item = items.find((i) => i.entityType === "email.unmatched")!;
    const out = await attachTriageItem({
      userId: s.userId,
      organizationId: s.organizationId,
      itemId: item.id,
      kind: "project",
      recordId: project.id,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const thread = (await getDb().select().from(schema.threads).where(eq(schema.threads.id, out.threadId)))[0];
    expect(thread.projectId).toBe(project.id);
    expect(thread.clientEmail).toBe("eli@t.test");
  });

  it("rejects double attach and unknown records honestly", async () => {
    const s = await seedStudio();
    const leadId = await seedLeadWithHistory(s.organizationId, "dana@t.test", 0);
    await mintInboxItems({
      organizationId: s.organizationId,
      kind: "email",
      entityType: "email.unmatched",
      entityId: "unmatched-3",
      threadId: null,
      title: "Unmatched",
      preview: "",
    });
    const items = (await listInboxItems({ userId: s.userId, organizationId: s.organizationId })).items;
    const item = items.find((i) => i.entityType === "email.unmatched")!;
    const first = await attachTriageItem({ userId: s.userId, organizationId: s.organizationId, itemId: item.id, kind: "lead", recordId: leadId });
    expect(first.ok).toBe(true);
    const again = await attachTriageItem({ userId: s.userId, organizationId: s.organizationId, itemId: item.id, kind: "lead", recordId: leadId });
    expect(again).toEqual({ ok: false, error: "already_threaded" });
    const ghost = await attachTriageItem({ userId: s.userId, organizationId: s.organizationId, itemId: crypto.randomUUID(), kind: "lead", recordId: leadId });
    expect(ghost).toEqual({ ok: false, error: "item_not_found" });
  });
});

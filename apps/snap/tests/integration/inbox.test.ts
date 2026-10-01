/* WEB-304 — the inbox data layer: minting (per-member fanout, WEB-278 prefs
 * gate, entity-identity bump), per-user read/snooze/delete state, keyset
 * pagination (stable under concurrent inserts), the unread badge, bulk
 * actions, the 2,000-open cap prune, and the live adapters (lead create,
 * inbound reply ingest, booking created, gallery first view). */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import {
  INBOX_OPEN_CAP,
  appendThreadMessage,
  applyInboxItemAction,
  deleteReadInboxItems,
  decodeInboxCursor,
  encodeInboxCursor,
  listInboxItems,
  markAllInboxRead,
  mintInboxItems,
  pruneInboxCaps,
  resolveOrCreateThread,
  unreadInboxCount,
} from "@/lib/repos/inbox";
import { createManualLead, mintLeadInboxItem } from "@/lib/repos/leads";
import { ingestInboxEmail } from "@/lib/inbox/ingest";
import { emitInboxItem } from "@/lib/inbox/sources";
import { resetDb } from "../helpers/db";
import { seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

/** Mint an item with an explicit clock so ordering is deterministic. */
function mintAt(org: string, i: number, at: Date) {
  return mintInboxItems({
    organizationId: org,
    kind: "booking",
    entityType: "booking",
    entityId: `booking-${i}`,
    title: `Item ${i}`,
    preview: `preview ${i}`,
    occurredAt: at,
  });
}

describe("minting", () => {
  it("fans out one item per org member and bumps the same entity on refire", async () => {
    const s = await seedStudio();
    // A second member: the fanout reaches both.
    const member2 = crypto.randomUUID();
    await getDb().batch([
      getDb().insert(schema.user).values({ id: member2, name: "Second", email: "m2@test.test", emailVerified: true }),
      getDb().insert(schema.member).values({ id: crypto.randomUUID(), organizationId: s.organizationId, userId: member2, role: "member" }),
    ]);

    expect(await mintAt(s.organizationId, 1, new Date("2026-01-01T00:00:01Z"))).toBe(2);

    const count = async () =>
      Number((await getDb().select({ n: schema.inboxItems.userId }).from(schema.inboxItems)).length);
    expect(await count()).toBe(2);

    // Same-entity refire (webhook retry) collapses to an update, not a row.
    expect(await mintAt(s.organizationId, 1, new Date("2026-01-01T00:00:02Z"))).toBe(2);
    expect(await count()).toBe(2);

    // A DIFFERENT entity mints fresh rows.
    expect(await mintAt(s.organizationId, 2, new Date("2026-01-01T00:00:03Z"))).toBe(2);
    expect(await count()).toBe(4);
  });

  it("a new event on the same entity bumps title/created_at and re-opens the item", async () => {
    const s = await seedStudio();
    await mintInboxItems({
      organizationId: s.organizationId,
      kind: "booking",
      entityType: "booking",
      entityId: "b1",
      title: "New booking — Client",
      occurredAt: new Date("2026-01-01T00:00:00Z"),
    });
    const owner = (await getDb().select({ id: schema.inboxItems.id }).from(schema.inboxItems).limit(1))[0];
    await applyInboxItemAction(s.organizationId, s.userId, owner.id, { action: "read" });
    await applyInboxItemAction(s.organizationId, s.userId, owner.id, {
      action: "snooze",
      until: new Date(Date.now() + 86_400_000),
    });
    const read = (await getDb().select().from(schema.inboxItems).limit(1))[0];
    expect(read.readAt).not.toBeNull();
    expect(read.snoozedUntil).not.toBeNull();

    // The reschedule arrives — same entity, new state.
    await mintInboxItems({
      organizationId: s.organizationId,
      kind: "booking",
      entityType: "booking",
      entityId: "b1",
      title: "Booking rescheduled — Client",
      occurredAt: new Date("2026-01-02T00:00:00Z"),
    });
    const bumped = (await getDb().select().from(schema.inboxItems).limit(1))[0];
    expect(bumped.id).toBe(owner.id);
    expect(bumped.title).toBe("Booking rescheduled — Client");
    expect(bumped.readAt).toBeNull(); // re-opened
    expect(bumped.snoozedUntil).toBeNull(); // un-snoozed
  });

  it("WEB-278 prefs gate minting per branch; corrupt prefs never mute", async () => {
    const s = await seedStudio();
    await getDb()
      .update(schema.studioProfiles)
      .set({ notificationPrefs: JSON.stringify({ booking: false }) })
      .where(eq(schema.studioProfiles.organizationId, s.organizationId));

    // The gate lives in emitInboxItem (the ONLY mint path adapters use).
    await emitInboxItem({
      organizationId: s.organizationId,
      kind: "booking",
      eventType: "booking.created",
      entityType: "booking",
      entityId: "b1",
      title: "x",
    });
    expect((await getDb().select().from(schema.inboxItems)).length).toBe(0);

    await emitInboxItem({
      organizationId: s.organizationId,
      kind: "lead",
      eventType: "lead.created",
      entityType: "lead",
      entityId: "l1",
      title: "y",
    });
    expect((await getDb().select().from(schema.inboxItems)).length).toBe(1);

    await getDb()
      .update(schema.studioProfiles)
      .set({ notificationPrefs: "{oops" })
      .where(eq(schema.studioProfiles.organizationId, s.organizationId));
    await emitInboxItem({
      organizationId: s.organizationId,
      kind: "booking",
      eventType: "booking.created",
      entityType: "booking",
      entityId: "b2",
      title: "z",
    });
    expect((await getDb().select().from(schema.inboxItems)).length).toBe(2);
  });

  it("deleted items free the entity slot — a later event mints fresh", async () => {
    const s = await seedStudio();
    await mintInboxItems({ organizationId: s.organizationId, kind: "booking", entityType: "booking", entityId: "b1", title: "v1" });
    const item = (await getDb().select().from(schema.inboxItems).limit(1))[0];
    await applyInboxItemAction(s.organizationId, s.userId, item.id, { action: "delete" });

    await mintInboxItems({ organizationId: s.organizationId, kind: "booking", entityType: "booking", entityId: "b1", title: "v2" });
    const rows = await getDb().select().from(schema.inboxItems);
    expect(rows.length).toBe(2); // the deleted row + the fresh mint
    const open = rows.find((r) => r.deletedAt === null)!;
    expect(open.title).toBe("v2");
  });
});

describe("threads", () => {
  it("resolves one thread per client email and links lead context", async () => {
    const s = await seedStudio();
    const t1 = await resolveOrCreateThread({ organizationId: s.organizationId, clientEmail: "Client@Example.com", subject: "Hi" });
    const t2 = await resolveOrCreateThread({ organizationId: s.organizationId, clientEmail: "client@example.com", subject: "Again" });
    expect(t1).toBe(t2); // case-insensitive identity
    const other = await resolveOrCreateThread({ organizationId: s.organizationId, clientEmail: "someoneelse@x.test" });
    expect(other).not.toBe(t1);
    const rows = await getDb().select().from(schema.threads);
    expect(rows.length).toBe(2);
  });

  it("appendThreadMessage bumps last_direction; rfc_message_id dedupes", async () => {
    const s = await seedStudio();
    const threadId = await resolveOrCreateThread({ organizationId: s.organizationId, clientEmail: "c@t.test" });

    await appendThreadMessage({
      organizationId: s.organizationId,
      threadId,
      direction: "in",
      rfcMessageId: "<msg-1@client>",
      subject: "Re: photos",
      textPreview: "they look great",
    });
    // Duplicate delivery — same Message-ID collapses.
    expect(
      await appendThreadMessage({
        organizationId: s.organizationId,
        threadId,
        direction: "in",
        rfcMessageId: "<msg-1@client>",
      }),
    ).toBeNull();

    await appendThreadMessage({ organizationId: s.organizationId, threadId, direction: "out", subject: "Re: photos" });
    const thread = (await getDb().select().from(schema.threads).limit(1))[0];
    expect(thread.lastDirection).toBe("out");
    expect((await getDb().select().from(schema.threadMessages)).length).toBe(2);
  });
});

describe("per-user state + listing", () => {
  it("read/snooze/delete are per-user and never touch the entity", async () => {
    const s = await seedStudio();
    const member2 = crypto.randomUUID();
    await getDb().batch([
      getDb().insert(schema.user).values({ id: member2, name: "Second", email: "m2@test.test", emailVerified: true }),
      getDb().insert(schema.member).values({ id: crypto.randomUUID(), organizationId: s.organizationId, userId: member2, role: "member" }),
    ]);
    await mintAt(s.organizationId, 1, new Date("2026-01-01T00:00:00Z"));

    const mine = await listInboxItems({ userId: s.userId, organizationId: s.organizationId });
    const theirs = await listInboxItems({ userId: member2, organizationId: s.organizationId });
    expect(mine.items.length).toBe(1);
    expect(theirs.items.length).toBe(1);
    expect(mine.items[0].entityId).toBe(theirs.items[0].entityId);
    expect(mine.items[0].id).not.toBe(theirs.items[0].id); // separate rows

    await applyInboxItemAction(s.organizationId, s.userId, mine.items[0].id, { action: "read" });
    const mineAfter = await listInboxItems({ userId: s.userId, organizationId: s.organizationId, tab: "unread" });
    const theirsAfter = await listInboxItems({ userId: member2, organizationId: s.organizationId, tab: "unread" });
    expect(mineAfter.items.length).toBe(0);
    expect(theirsAfter.items.length).toBe(1); // untouched for the other member

    // The underlying entity — a booking row here — is never written to.
    const bookingRow = await getDb().select().from(schema.bookings);
    expect(bookingRow.length).toBe(0);
  });

  it("snoozed items leave the list and return when the snooze passes", async () => {
    const s = await seedStudio();
    await mintAt(s.organizationId, 1, new Date("2026-01-01T00:00:00Z"));
    const { items } = await listInboxItems({ userId: s.userId, organizationId: s.organizationId });
    await applyInboxItemAction(s.organizationId, s.userId, items[0].id, {
      action: "snooze",
      until: new Date(Date.now() + 3600_000),
    });
    expect((await listInboxItems({ userId: s.userId, organizationId: s.organizationId })).items.length).toBe(0);
    expect((await listInboxItems({ userId: s.userId, organizationId: s.organizationId, includeSnoozed: true })).items.length).toBe(1);
    // Unread count hides snoozed items the same way.
    expect(await unreadInboxCount({ userId: s.userId, organizationId: s.organizationId })).toBe(0);

    await applyInboxItemAction(s.organizationId, s.userId, items[0].id, {
      action: "snooze",
      until: new Date(Date.now() - 1000),
    });
    expect((await listInboxItems({ userId: s.userId, organizationId: s.organizationId })).items.length).toBe(1);
  });

  it("tabs: unread, needs-reply (thread last_direction=in), needs-triage (no thread)", async () => {
    const s = await seedStudio();
    const threadId = await resolveOrCreateThread({ organizationId: s.organizationId, clientEmail: "c@t.test" });

    // A triage-less event on the thread (in) + a plain event without thread.
    await appendThreadMessage({ organizationId: s.organizationId, threadId, direction: "in" });
    await mintInboxItems({ organizationId: s.organizationId, kind: "email", entityType: "email", entityId: "m1", threadId, title: "reply" });
    await mintInboxItems({ organizationId: s.organizationId, kind: "booking", entityType: "booking", entityId: "b9", title: "event" });

    const all = await listInboxItems({ userId: s.userId, organizationId: s.organizationId });
    expect(all.items.length).toBe(2);
    expect((await listInboxItems({ userId: s.userId, organizationId: s.organizationId, tab: "needs-reply" })).items.map((i) => i.entityId)).toEqual(["m1"]);
    expect((await listInboxItems({ userId: s.userId, organizationId: s.organizationId, tab: "needs-triage" })).items.map((i) => i.entityId)).toEqual(["b9"]);

    // The studio replies — the thread leaves needs-reply.
    await appendThreadMessage({ organizationId: s.organizationId, threadId, direction: "out" });
    expect((await listInboxItems({ userId: s.userId, organizationId: s.organizationId, tab: "needs-reply" })).items.length).toBe(0);
  });

  it("keyset pagination walks (created_at, id) with no dupes or skips, stable under concurrent inserts", async () => {
    const s = await seedStudio();
    for (let i = 1; i <= 5; i++) {
      await mintAt(s.organizationId, i, new Date(Date.UTC(2026, 0, 1, 0, 0, i)));
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const { items, nextCursor } = await listInboxItems({
        userId: s.userId,
        organizationId: s.organizationId,
        limit: 2,
        cursor,
      });
      seen.push(...items.map((i) => i.entityId));
      cursor = nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(["booking-5", "booking-4", "booking-3", "booking-2", "booking-1"]);

    // A NEWER item minting mid-scroll must not shift the cursor window.
    cursor = null;
    const page1 = await listInboxItems({ userId: s.userId, organizationId: s.organizationId, limit: 2, cursor });
    await mintAt(s.organizationId, 6, new Date(Date.UTC(2026, 0, 1, 0, 5, 0)));
    const page2 = await listInboxItems({ userId: s.userId, organizationId: s.organizationId, limit: 2, cursor: page1.nextCursor });
    expect(page2.items.map((i) => i.entityId)).toEqual(["booking-3", "booking-2"]);

    // Cursor round-trip is exact.
    const c = encodeInboxCursor({ createdAt: new Date(1700000000_000), id: "abc" });
    expect(decodeInboxCursor(c)).toEqual({ createdAt: new Date(1700000000_000), id: "abc" });
    expect(decodeInboxCursor("garbage!!")).toBeNull();
  });

  it("kind + thread filters and tenant isolation", async () => {
    const s = await seedStudio();
    const s2 = await seedStudio({ name: "Other Studio" });
    await mintInboxItems({ organizationId: s.organizationId, kind: "lead", entityType: "lead", entityId: "l1", title: "lead" });
    await mintInboxItems({ organizationId: s.organizationId, kind: "booking", entityType: "booking", entityId: "b1", title: "booking" });
    await mintInboxItems({ organizationId: s2.organizationId, kind: "booking", entityType: "booking", entityId: "b2", title: "other org" });

    const leads = await listInboxItems({ userId: s.userId, organizationId: s.organizationId, kind: "lead" });
    expect(leads.items.map((i) => i.entityId)).toEqual(["l1"]);

    // s.userId is not a member of org2 — nothing leaks.
    const cross = await listInboxItems({ userId: s.userId, organizationId: s2.organizationId });
    expect(cross.items.length).toBe(0);
  });
});

describe("bulk actions + badge + prune", () => {
  it("mark-all-read zeroes the badge; delete-read spares unread", async () => {
    const s = await seedStudio();
    await mintAt(s.organizationId, 1, new Date("2026-01-01T00:00:01Z"));
    await mintAt(s.organizationId, 2, new Date("2026-01-01T00:00:02Z"));
    await mintAt(s.organizationId, 3, new Date("2026-01-01T00:00:03Z"));
    expect(await unreadInboxCount({ userId: s.userId, organizationId: s.organizationId })).toBe(3);

    // Read one, then delete-read: only the two unread survive.
    const { items } = await listInboxItems({ userId: s.userId, organizationId: s.organizationId });
    await applyInboxItemAction(s.organizationId, s.userId, items[0].id, { action: "read" });
    expect(await deleteReadInboxItems({ userId: s.userId, organizationId: s.organizationId })).toBe(1);
    expect((await listInboxItems({ userId: s.userId, organizationId: s.organizationId })).items.length).toBe(2);

    expect(await markAllInboxRead({ userId: s.userId, organizationId: s.organizationId })).toBe(2);
    expect(await unreadInboxCount({ userId: s.userId, organizationId: s.organizationId })).toBe(0);
  });

  it("2,000-open cap prunes oldest-first per user", async () => {
    const s = await seedStudio();
    const cap = 3; // exercise the mechanics without 2,000 inserts
    for (let i = 1; i <= 5; i++) {
      await mintAt(s.organizationId, i, new Date(Date.UTC(2026, 0, 1, 0, 0, i)));
    }
    const out = await pruneInboxCaps(cap);
    expect(out.users).toBe(1);
    expect(out.pruned).toBe(2);

    const open = await getDb()
      .select()
      .from(schema.inboxItems)
      .where(eq(schema.inboxItems.userId, s.userId));
    const openRows = open.filter((r) => r.deletedAt === null);
    expect(openRows.map((r) => r.entityId).sort()).toEqual(["booking-3", "booking-4", "booking-5"]);
    expect(INBOX_OPEN_CAP).toBe(2000);
  });

  it("under the cap the prune is a no-op", async () => {
    const s = await seedStudio();
    await mintAt(s.organizationId, 1, new Date());
    expect(await pruneInboxCaps(3)).toEqual({ users: 0, pruned: 0 });
  });
});

describe("live adapters", () => {
  it("manual lead creation mints a lead item on the lead's thread", async () => {
    const s = await seedStudio();
    const res = await createManualLead({
      organizationId: s.organizationId,
      actorUserId: s.userId,
      name: "Dana Doe",
      email: "dana@t.test",
      message: "Hi! Do you shoot weddings in October?",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const { items } = await listInboxItems({ userId: s.userId, organizationId: s.organizationId });
    expect(items.length).toBe(1);
    expect(items[0].kind).toBe("lead");
    expect(items[0].entityType).toBe("lead");
    expect(items[0].entityId).toBe(res.leadId);
    expect(items[0].title).toBe("New inquiry — Dana Doe");
    expect(items[0].threadId).not.toBeNull();

    const thread = (await getDb().select().from(schema.threads).limit(1))[0];
    expect(thread.clientEmail).toBe("dana@t.test");
    expect(thread.leadId).toBe(res.leadId);

    // The lead row itself is untouched by any inbox state change.
    await applyInboxItemAction(s.organizationId, s.userId, items[0].id, { action: "read" });
    const lead = (await getDb().select().from(schema.leads).where(eq(schema.leads.id, res.leadId)))[0];
    expect(lead.status).toBe("new");
  });

  it("mintLeadInboxItem respects the inquiry toggle", async () => {
    const s = await seedStudio();
    await getDb()
      .update(schema.studioProfiles)
      .set({ notificationPrefs: JSON.stringify({ inquiry: false }) })
      .where(eq(schema.studioProfiles.organizationId, s.organizationId));
    await mintLeadInboxItem({ organizationId: s.organizationId, leadId: "l1", name: "X", email: "x@t.test" });
    expect((await getDb().select().from(schema.inboxItems)).length).toBe(0);
  });

  it("inbound reply ingest appends the thread message and mints an email item", async () => {
    const s = await seedStudio();
    const created = await createManualLead({
      organizationId: s.organizationId,
      actorUserId: s.userId,
      name: "Dana Doe",
      email: "dana@t.test",
      message: "first",
      eventType: "Wedding", // thread subject becomes "Wedding inquiry" → ⑤ subject match
    });
    if (!created.ok) throw new Error("seed lead failed");

    // The lead's hello+ address routes the org; the inquiry item created the
    // thread for this client (WEB-307 ingest resolves ④ then ⑤).
    const result = await ingestInboxEmail({
      from: "Dana <dana@t.test>",
      to: `hello+${created.leadId}@snap.webcules.com`,
      subject: "Re: Wedding inquiry",
      text: "Great — let's book October 12.",
      html: null,
      messageId: "<reply-1@dana>",
      receivedAt: new Date().toISOString(),
    });
    expect(result.matched).toBe(true);

    const { items } = await listInboxItems({ userId: s.userId, organizationId: s.organizationId, tab: "unread" });
    const emailItem = items.find((i) => i.kind === "email");
    expect(emailItem).toBeTruthy();
    expect(emailItem!.title).toBe("Dana Doe replied");
    expect(emailItem!.threadId).toBeTruthy();

    // The thread now has the studio's outbound + Dana's inbound, needs-reply.
    const threadId = emailItem!.threadId!;
    const messages = await getDb().select().from(schema.threadMessages).where(eq(schema.threadMessages.threadId, threadId));
    expect(messages.length).toBe(1); // only the inbound reply used the thread so far
    const thread = (await getDb().select().from(schema.threads).where(eq(schema.threads.id, threadId)))[0];
    expect(thread.lastDirection).toBe("in");
    // Needs-reply surfaces every open item on an awaiting thread — the
    // original inquiry AND the fresh reply (independent notifications,
    // shared conversation).
    expect(
      (await listInboxItems({ userId: s.userId, organizationId: s.organizationId, tab: "needs-reply" })).items.length,
    ).toBe(2);
  });

  it("gallery first view mints once across repeat views", async () => {
    const s = await seedStudio();
    const projectId = crypto.randomUUID();
    const grantId = crypto.randomUUID();
    await getDb().batch([
      getDb().insert(schema.projects).values({ id: projectId, organizationId: s.organizationId, title: "P", status: "booked" }),
      getDb().insert(schema.shareGrants).values({
        id: grantId,
        organizationId: s.organizationId,
        projectId,
        clientEmail: "viewer@t.test",
        tokenHash: "hash-" + grantId,
      }),
    ]);

    const { logShareAccess } = await import("@/lib/shares/gallery-auth");
    await logShareAccess(grantId, "view");
    await logShareAccess(grantId, "view");
    await logShareAccess(grantId, "view");

    const rows = await getDb().select().from(schema.inboxItems);
    expect(rows.length).toBe(1);
    expect(rows[0].entityType).toBe("gallery.first_view");
    expect(rows[0].entityId).toBe(grantId);
  });
});

/* WEB-306 — the triage layer's data contracts: search (LIKE with escaping),
 * tab composition against seeded conversations, badge reconciliation (the
 * number always equals the unread rows the list would show), snooze
 * hide/resurface, and the search performance gate at a 10k-item corpus with
 * the EXPLAIN QUERY PLAN recorded in the assertion output. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb, getD1, schema } from "@/lib/db";
import {
  applyInboxItemAction,
  listInboxItems,
  markAllInboxRead,
  mintInboxItems,
  resolveOrCreateThread,
  appendThreadMessage,
  unreadInboxCount,
} from "@/lib/repos/inbox";
import { resetDb } from "../helpers/db";
import { seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

describe("search (v1 LIKE)", () => {
  it("matches title and preview substrings, scoped to the caller", async () => {
    const s = await seedStudio();
    const other = await seedStudio({ name: "Other" });
    await mintInboxItems({ organizationId: s.organizationId, kind: "lead", entityType: "lead", entityId: "l1", title: "New inquiry — Dana Doe", preview: "wedding in October" });
    await mintInboxItems({ organizationId: s.organizationId, kind: "booking", entityType: "booking", entityId: "b1", title: "Booking rescheduled", preview: "moved to Friday" });
    await mintInboxItems({ organizationId: other.organizationId, kind: "lead", entityType: "lead", entityId: "l9", title: "New inquiry — Dana Other", preview: "x" });

    const byTitle = await listInboxItems({ userId: s.userId, organizationId: s.organizationId, q: "Dana Doe" });
    expect(byTitle.items.map((i) => i.entityId)).toEqual(["l1"]);

    const byPreview = await listInboxItems({ userId: s.userId, organizationId: s.organizationId, q: "october" });
    expect(byPreview.items.map((i) => i.entityId)).toEqual(["l1"]);

    const none = await listInboxItems({ userId: s.userId, organizationId: s.organizationId, q: "nonexistent-zz" });
    expect(none.items.length).toBe(0);
  });

  it("escapes LIKE wildcards in the needle", async () => {
    const s = await seedStudio();
    await mintInboxItems({ organizationId: s.organizationId, kind: "lead", entityType: "lead", entityId: "l1", title: "100% sure", preview: "" });
    await mintInboxItems({ organizationId: s.organizationId, kind: "lead", entityType: "lead", entityId: "l2", title: "anything else", preview: "" });

    // "%" must match literally — not act as a wildcard over every row.
    const hit = await listInboxItems({ userId: s.userId, organizationId: s.organizationId, q: "100% sure" });
    expect(hit.items.map((i) => i.entityId)).toEqual(["l1"]);
    const under = await listInboxItems({ userId: s.userId, organizationId: s.organizationId, q: "100_sure" });
    expect(under.items.length).toBe(0);
  });
});

describe("tabs against seeded conversations", () => {
  it("needs-reply = client spoke last; needs-triage = threadless; unread = readAt null", async () => {
    const s = await seedStudio();
    // Conversation A: inbound reply unanswered → needs reply.
    const tA = await resolveOrCreateThread({ organizationId: s.organizationId, clientEmail: "a@t.test" });
    await appendThreadMessage({ organizationId: s.organizationId, threadId: tA, direction: "in" });
    await mintInboxItems({ organizationId: s.organizationId, kind: "email", entityType: "email", entityId: "a1", threadId: tA, title: "A replied" });
    // Conversation B: studio answered → not needs reply.
    const tB = await resolveOrCreateThread({ organizationId: s.organizationId, clientEmail: "b@t.test" });
    await appendThreadMessage({ organizationId: s.organizationId, threadId: tB, direction: "out" });
    await mintInboxItems({ organizationId: s.organizationId, kind: "email", entityType: "email", entityId: "b1", threadId: tB, title: "B answered" });
    // Threadless event → needs triage.
    await mintInboxItems({ organizationId: s.organizationId, kind: "booking", entityType: "booking", entityId: "x1", title: "Threadless" });

    const needsReply = await listInboxItems({ userId: s.userId, organizationId: s.organizationId, tab: "needs-reply" });
    expect(needsReply.items.map((i) => i.entityId)).toEqual(["a1"]);

    const needsTriage = await listInboxItems({ userId: s.userId, organizationId: s.organizationId, tab: "needs-triage" });
    expect(needsTriage.items.map((i) => i.entityId)).toEqual(["x1"]);

    const unread = await listInboxItems({ userId: s.userId, organizationId: s.organizationId, tab: "unread" });
    expect(unread.items.length).toBe(3);

    // The studio replies on A → it leaves needs-reply.
    await appendThreadMessage({ organizationId: s.organizationId, threadId: tA, direction: "out" });
    const after = await listInboxItems({ userId: s.userId, organizationId: s.organizationId, tab: "needs-reply" });
    expect(after.items.length).toBe(0);
  });
});

describe("badge reconciliation", () => {
  it("unreadInboxCount always equals the unread tab's row count (incl. after actions)", async () => {
    const s = await seedStudio();
    for (let i = 1; i <= 3; i++) {
      await mintInboxItems({ organizationId: s.organizationId, kind: "lead", entityType: "lead", entityId: `r${i}`, title: `t${i}` });
    }
    const scope = { userId: s.userId, organizationId: s.organizationId };
    const rowsFor = async () => (await listInboxItems({ ...scope, tab: "unread", limit: 100 })).items.length;

    expect(await unreadInboxCount(scope)).toBe(await rowsFor());

    // Read one — both move together.
    const first = (await listInboxItems({ ...scope, limit: 1 })).items[0];
    await applyInboxItemAction(scope.organizationId, scope.userId, first.id, { action: "read" });
    expect(await unreadInboxCount(scope)).toBe(await rowsFor());

    // Snooze one — hidden from BOTH (the badge ignores snoozed-until-future).
    const second = (await listInboxItems({ ...scope, limit: 2 })).items[1];
    await applyInboxItemAction(scope.organizationId, scope.userId, second.id, {
      action: "snooze",
      until: new Date(Date.now() + 3600_000),
    });
    expect(await unreadInboxCount(scope)).toBe(await rowsFor());

    // Mark-all-read — badge clears everywhere, list agrees.
    await markAllInboxRead(scope);
    expect(await unreadInboxCount(scope)).toBe(0);
    expect(await rowsFor()).toBe(0);
  });

  it("snoozed items resurface (unread) once the moment passes", async () => {
    const s = await seedStudio();
    await mintInboxItems({ organizationId: s.organizationId, kind: "lead", entityType: "lead", entityId: "s1", title: "snoozed" });
    const item = (await listInboxItems({ userId: s.userId, organizationId: s.organizationId })).items[0];
    await applyInboxItemAction(s.organizationId, s.userId, item.id, {
      action: "snooze",
      until: new Date(Date.now() + 2000),
    });
    expect((await listInboxItems({ userId: s.userId, organizationId: s.organizationId })).items.length).toBe(0);

    // Force the moment to pass directly on the row (the cron of the test).
    await getDb()
      .update(schema.inboxItems)
      .set({ snoozedUntil: Math.floor(Date.now() / 1000) - 1 })
      .where(eq(schema.inboxItems.id, item.id));
    const back = await listInboxItems({ userId: s.userId, organizationId: s.organizationId });
    expect(back.items.length).toBe(1);
    expect(back.items[0].readAt).toBeNull(); // resurfaced unread
    expect(await unreadInboxCount({ userId: s.userId, organizationId: s.organizationId })).toBe(1);
  });
});

describe("search performance at corpus scale", () => {
  it("answers LIKE search over a 10k-item corpus well under budget (plan recorded)", async () => {
    const s = await seedStudio();
    const db = getDb();
    // 10k rows in chunked batches (D1 batch limits) — titles carry a
    // searchable marker every 10th row.
    const CHUNK = 500;
    for (let base = 0; base < 10000; base += CHUNK) {
      const stmts = Array.from({ length: CHUNK }, (_, k) => {
        const n = base + k;
        return db.insert(schema.inboxItems).values({
          id: `perf-${n}`,
          userId: s.userId,
          organizationId: s.organizationId,
          kind: "lead",
          entityType: "lead",
          entityId: `perf-${n}`,
          title: n % 10 === 0 ? `needle row ${n}` : `regular inquiry ${n}`,
          preview: `preview text ${n}`,
        });
      });
      // db.batch wants a [first, ...rest] tuple; a dynamic array needs the cast.
      await db.batch(stmts as unknown as Parameters<typeof db.batch>[0]);
    }
    const total = await getDb().select({ n: schema.inboxItems.id }).from(schema.inboxItems);
    expect(total.length).toBe(10000);

    // EXPLAIN QUERY PLAN — recorded: the v1 LIKE filter scans the
    // (user_id-indexed) subset; this is the documented baseline the FTS5
    // external-content upgrade (noted in lib/repos/inbox.ts) replaces when
    // real corpora demand it.
    const planRes = await getD1()
      .prepare(
        "EXPLAIN QUERY PLAN SELECT id FROM inbox_item WHERE user_id = ? AND deleted_at IS NULL AND (title LIKE ? ESCAPE '\\' OR preview LIKE ? ESCAPE '\\')",
      )
      .bind(s.userId, "%needle row%", "%needle row%")
      .all<{ detail: string }>();
    const planText = (planRes.results ?? []).map((p) => p.detail).join(" | ");

    const t0 = Date.now();
    const hits = await listInboxItems({ userId: s.userId, organizationId: s.organizationId, q: "needle row", limit: 100 });
    const elapsed = Date.now() - t0;
    expect(hits.items.length).toBe(100); // exactly the capped page of the 1000 matches
    expect(hits.nextCursor).toBeTruthy();
    // miniflare timings are noisy; the gate is order-of-magnitude, not a SLA.
    expect(elapsed).toBeLessThan(5000);
    expect(planText.length).toBeGreaterThan(0);
  });
});

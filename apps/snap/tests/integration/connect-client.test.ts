/* WEB-335 - no invented recipients: attaching to a client-less project asks
 * for a client, and legacy unknown@ conversations can be connected. */
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { getDb, schema } from "@/lib/db";
import { attachTriageItem, linkClientToPlaceholderThread, listInboxItems, mintInboxItems, resolveOrCreateThread } from "@/lib/repos/inbox";
import { resetDb } from "../helpers/db";
import { seedStudio } from "../helpers/seed";

beforeEach(resetDb);

async function clientlessProject(orgId: string, title = "Wedding") {
  return (
    await getDb()
      .insert(schema.projects)
      .values({ id: crypto.randomUUID(), organizationId: orgId, title, status: "booked" })
      .returning()
  )[0];
}

async function triageItem(s: { organizationId: string; userId: string }, title: string) {
  await mintInboxItems({
    organizationId: s.organizationId,
    kind: "email",
    entityType: "email.unmatched",
    entityId: crypto.randomUUID(),
    threadId: null,
    title,
    preview: "hello",
  });
  const items = (await listInboxItems({ userId: s.userId, organizationId: s.organizationId })).items;
  return items.find((i) => i.entityType === "email.unmatched" && !i.threadId)!;
}

describe("attach to a project with no client", () => {
  it("asks for a client and suggests the unmatched email's sender - nothing is created", async () => {
    const s = await seedStudio();
    const project = await clientlessProject(s.organizationId);
    const item = await triageItem(s, "Unmatched email — Dana Lee <dana@t.test>");

    const out = await attachTriageItem({ userId: s.userId, organizationId: s.organizationId, itemId: item.id, kind: "project", recordId: project.id });
    expect(out).toEqual({ ok: false, error: "client_required", suggested: { email: "dana@t.test", name: "Dana Lee" } });

    expect((await getDb().select().from(schema.threads).where(eq(schema.threads.organizationId, s.organizationId)))).toHaveLength(0);
    const p = (await getDb().select().from(schema.projects).where(eq(schema.projects.id, project.id)))[0];
    expect(p.clientId).toBeNull();
    // never an unknown@ recipient anywhere
    const all = await getDb().select().from(schema.threads);
    expect(all.some((t) => t.clientEmail.startsWith("unknown@"))).toBe(false);
  });

  it("connects the given client to the project and attaches to their conversation", async () => {
    const s = await seedStudio();
    const project = await clientlessProject(s.organizationId, "Eli Wedding");
    const item = await triageItem(s, "Unmatched email — dana@t.test");

    const out = await attachTriageItem({
      userId: s.userId,
      organizationId: s.organizationId,
      itemId: item.id,
      kind: "project",
      recordId: project.id,
      client: { email: " Dana@T.test ", name: "Dana" },
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    const client = (await getDb().select().from(schema.clients).where(and(eq(schema.clients.organizationId, s.organizationId), eq(schema.clients.email, "dana@t.test"))))[0];
    expect(client.name).toBe("Dana");
    const p = (await getDb().select().from(schema.projects).where(eq(schema.projects.id, project.id)))[0];
    expect(p.clientId).toBe(client.id);
    const thread = (await getDb().select().from(schema.threads).where(eq(schema.threads.id, out.threadId)))[0];
    expect(thread.clientEmail).toBe("dana@t.test");
    expect(thread.clientId).toBe(client.id);
    expect(thread.projectId).toBe(project.id);
  });

  it("a project that already has a client still attaches straight away (no prompt)", async () => {
    const s = await seedStudio();
    const client = (await getDb().insert(schema.clients).values({ id: crypto.randomUUID(), organizationId: s.organizationId, email: "eli@t.test", name: "Eli" }).returning())[0];
    const project = (await getDb().insert(schema.projects).values({ id: crypto.randomUUID(), organizationId: s.organizationId, title: "Eli", status: "booked", clientId: client.id }).returning())[0];
    const item = await triageItem(s, "Unmatched email — someone-else@t.test");
    const out = await attachTriageItem({ userId: s.userId, organizationId: s.organizationId, itemId: item.id, kind: "project", recordId: project.id });
    expect(out.ok).toBe(true);
    if (out.ok) {
      const thread = (await getDb().select().from(schema.threads).where(eq(schema.threads.id, out.threadId)))[0];
      expect(thread.clientEmail).toBe("eli@t.test");
    }
  });
});

describe("linkClientToPlaceholderThread (legacy unknown@ conversations)", () => {
  async function placeholder(s: { organizationId: string }, projectId: string) {
    return resolveOrCreateThread({ organizationId: s.organizationId, clientEmail: "unknown@snap.webcules.com", subject: "x", projectId });
  }

  it("re-addresses the thread and links the project's client", async () => {
    const s = await seedStudio();
    const project = await clientlessProject(s.organizationId);
    const threadId = await placeholder(s, project.id);
    const out = await linkClientToPlaceholderThread({ organizationId: s.organizationId, threadId, email: "Dana@T.test", name: "Dana" });
    expect(out).toEqual({ ok: true, threadId });
    const t = (await getDb().select().from(schema.threads).where(eq(schema.threads.id, threadId)))[0];
    expect(t.clientEmail).toBe("dana@t.test");
    expect(t.clientId).toBeTruthy();
    const p = (await getDb().select().from(schema.projects).where(eq(schema.projects.id, project.id)))[0];
    expect(p.clientId).toBe(t.clientId);
  });

  it("folds into the client's existing thread, moving messages and items", async () => {
    const s = await seedStudio();
    const project = await clientlessProject(s.organizationId);
    const placeholderId = await placeholder(s, project.id);
    const realId = await resolveOrCreateThread({ organizationId: s.organizationId, clientEmail: "dana@t.test", subject: "real" });
    await getDb().insert(schema.threadMessages).values({ id: crypto.randomUUID(), threadId: placeholderId, organizationId: s.organizationId, direction: "out", status: "failed" });
    await mintInboxItems({ organizationId: s.organizationId, kind: "email", entityType: "email.thread", entityId: placeholderId, threadId: placeholderId, title: "t", preview: "p" });

    const out = await linkClientToPlaceholderThread({ organizationId: s.organizationId, threadId: placeholderId, email: "dana@t.test" });
    expect(out).toEqual({ ok: true, threadId: realId });
    expect((await getDb().select().from(schema.threads).where(eq(schema.threads.id, placeholderId)))).toHaveLength(0);
    expect((await getDb().select().from(schema.threadMessages).where(eq(schema.threadMessages.threadId, realId))).length).toBe(1);
    const items = (await listInboxItems({ userId: s.userId, organizationId: s.organizationId })).items;
    expect(items.every((i) => i.threadId !== placeholderId)).toBe(true);
  });

  it("refuses real threads, other studios' threads and unknown ids", async () => {
    const s = await seedStudio();
    const other = await seedStudio();
    const real = await resolveOrCreateThread({ organizationId: s.organizationId, clientEmail: "dana@t.test" });
    expect(await linkClientToPlaceholderThread({ organizationId: s.organizationId, threadId: real, email: "x@t.test" })).toEqual({ ok: false, error: "not_placeholder" });
    const project = await clientlessProject(s.organizationId);
    const ph = await placeholder(s, project.id);
    expect(await linkClientToPlaceholderThread({ organizationId: other.organizationId, threadId: ph, email: "x@t.test" })).toEqual({ ok: false, error: "not_found" });
    expect(await linkClientToPlaceholderThread({ organizationId: s.organizationId, threadId: "nope", email: "x@t.test" })).toEqual({ ok: false, error: "not_found" });
  });
});

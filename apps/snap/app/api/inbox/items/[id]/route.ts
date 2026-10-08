/* Per-item inbox actions (WEB-304) — read/unread/snooze/unsnooze/delete/
 * restore, plus triage ATTACH (one-click "this email belongs to that
 * client/lead/project"). Ownership is (user_id, organization_id): a member
 * can only ever touch their own view of an item. */
import { z } from "zod";

import { getOrgContext } from "@/lib/session";
import { applyInboxItemAction, attachTriageItem, type InboxItemAction } from "@/lib/repos/inbox";

export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read") }),
  z.object({ action: z.literal("unread") }),
  z.object({ action: z.literal("snooze"), until: z.string().datetime() }),
  z.object({ action: z.literal("unsnooze") }),
  z.object({ action: z.literal("delete") }),
  z.object({ action: z.literal("restore") }),
]);

const attachSchema = z.object({
  attach: z.literal(true),
  kind: z.enum(["lead", "client", "project"]),
  recordId: z.string().min(1).max(64),
  /** WEB-335: connect this client when the project has none. */
  client: z
    .object({ email: z.string().trim().toLowerCase().email().max(200), name: z.string().trim().max(120).optional() })
    .optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  // Triage attach: {attach: true, kind, recordId} — the shape the triage
  // pane sends. The route used to accept only {action} shapes and 400'd on
  // every attach attempt (founder-reported); the repo path existed but was
  // never reachable from the API.
  const attach = attachSchema.safeParse(body);
  if (attach.success) {
    const { id } = await params;
    const result = await attachTriageItem({
      userId: ctx.user.id,
      organizationId: ctx.organizationId,
      itemId: id,
      kind: attach.data.kind,
      recordId: attach.data.recordId,
      client: attach.data.client,
    });
    if (result.ok) return Response.json({ ok: true, threadId: result.threadId, title: result.title });
    if (result.error === "client_required") {
      return Response.json({ error: result.error, suggested: result.suggested }, { status: 409 });
    }
    return Response.json({ error: result.error }, { status: result.error === "already_threaded" ? 409 : 404 });
  }

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_input" }, { status: 400 });
  const a = parsed.data;

  const { id } = await params;

  // WEB-309 tier gate: snooze is Lite+ (the inbox itself is free-for-all).
  if (a.action === "snooze" || a.action === "unsnooze") {
    const { getPlanEntitlements } = await import("@/lib/plans");
    const ent = await getPlanEntitlements(ctx.organizationId);
    if (ent && !ent.inboxSnooze) {
      return Response.json({ error: "upgrade_required", plan: "lite" }, { status: 402 });
    }
  }

  const action: InboxItemAction =
    a.action === "snooze"
      ? { action: "snooze", until: new Date(a.until) }
      : { action: a.action };
  const item = await applyInboxItemAction(ctx.organizationId, ctx.user.id, id, action);
  if (!item) return Response.json({ error: "not_found" }, { status: 404 });

  return Response.json({
    ok: true,
    item: {
      id: item.id,
      readAt: item.readAt,
      snoozedUntil: item.snoozedUntil,
      deletedAt: item.deletedAt,
    },
  });
}

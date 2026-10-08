/* WEB-307 — the inbox's front door. Inbound email (parsed by postal-mime in
 * the snap-email worker, posted to /api/email/inbound) resolves its thread
 * through a five-step pipeline, stores bodies in R2, mirrors to the
 * photographer while the inbox is young, and never lets a parse failure or
 * unmatched message disappear.
 *
 * Threading resolution order:
 *   ① In-Reply-To / each References id — exact match on thread_message
 *   ② our X-Snap-Thread-ID header echoed back
 *   ③ Outlook Thread-Index: stable GUID half (bytes 6..21) vs the index we emit
 *   ④ per-thread address t-{threadId}-{token}@ (self-identifying, headers gone)
 *   ⑤ RFC 5256 base subject + shared participant + 45-day recency
 *   …else: a "Needs triage" item with no thread.
 *
 * Bounces (DSN): mark the referenced outbound message failed + item on the
 * thread. Gmail auto-forwards: the wrapped original sender is unwrapped from
 * X-Forwarded-For so replies attribute to the real client. */
import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";

import { getD1, getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { appendThreadMessage, mintInboxItems } from "@/lib/repos/inbox";
import {
  baseSubject,
  extractSnapMessageIds,
  looksLikeDsn,
  mintAddressToken,
  mintThreadIndex,
  parseInboundAddress,
  parseMessageIds,
  refreshThreadIndexBase64,
  threadIndexGuid,
  unwrapForwardedSender,
} from "@/lib/inbox/threading";
import { neutralizeTrackingPixels, sanitizeEmailHtml } from "@/lib/inbox/sanitize-email";
import { stripQuotedReply } from "@/lib/strip-reply";
import { putObject } from "@/lib/storage/service";
import { sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/app-origin";

export type InboundEmailPayload = {
  from: string;
  to: string;
  subject: string;
  text: string | null;
  html: string | null;
  messageId: string | null;
  /** Optional because the legacy (pre-307) worker payload omitted them. */
  inReplyTo?: string | null;
  references?: string | null;
  date?: string | null;
  receivedAt?: string;
  /** WEB-307 additions (absent from the legacy worker payload — handled). */
  rawSize?: number | null;
  threadIndex?: string | null;
  xSnapThreadId?: string | null;
  contentType?: string | null;
  autoSubmitted?: boolean | null;
  xForwardedFor?: string | null;
  /** base64 raw .eml — the worker only sends it when small. */
  rawEml?: string | null;
  /** postal-mime failed — stash what we have into triage, never crash. */
  parseError?: boolean;
  attachments?: Array<{ filename: string; mimeType: string; size: number }>;
};

export type IngestResult = {
  matched: boolean;
  threadId?: string;
  organizationId?: string;
  bounced?: boolean;
  triage?: boolean;
  mirrorQueued?: boolean;
};

/* ---------------- org + thread routing ---------------- */

/** Org routing from the envelope recipient: per-thread / per-lead / studio
 * +tag local-parts on the Snap mail domain. Returns null for foreign mail. */
async function resolveOrg(to: string): Promise<{ organizationId: string; threadId?: string } | null> {
  const addr = parseInboundAddress(to);
  if (addr?.kind === "thread") {
    const t = (
      await getDb()
        .select({ id: schema.threads.id, organizationId: schema.threads.organizationId })
        .from(schema.threads)
        .where(eq(schema.threads.id, addr.threadId))
        .limit(1)
    )[0];
    return t ? { organizationId: t.organizationId, threadId: t.id } : null;
  }
  if (addr?.kind === "lead") {
    const l = (
      await getDb()
        .select({ organizationId: schema.leads.organizationId })
        .from(schema.leads)
        .where(eq(schema.leads.id, addr.leadId))
        .limit(1)
    )[0];
    return l ? { organizationId: l.organizationId } : null;
  }
  if (addr?.kind === "slug") {
    const o = (
      await getDb()
        .select({ id: schema.organization.id })
        .from(schema.organization)
        .where(eq(schema.organization.slug, addr.slug))
        .limit(1)
    )[0];
    return o ? { organizationId: o.id } : null;
  }
  return null;
}

/** The ①-⑤ pipeline. orgHint comes from the recipient routing. */
export async function resolveInboundThread(params: {
  organizationId: string;
  from: string;
  subject: string | null;
  inReplyTo: string | null;
  references: string | null;
  threadIndexHeader: string | null;
  xSnapThreadId: string | null;
  routeThreadId?: string | null;
}): Promise<string | null> {
  const db = getDb();
  const org = params.organizationId;
  const scope = eq(schema.threadMessages.organizationId, org);

  // ① exact match on any referenced id
  const ids = [...parseMessageIds(params.inReplyTo), ...parseMessageIds(params.references)];
  if (ids.length) {
    const hit = (
      await db
        .select({ threadId: schema.threadMessages.threadId })
        .from(schema.threadMessages)
        .where(and(scope, inArray(schema.threadMessages.rfcMessageId, ids)))
        .limit(1)
    )[0];
    if (hit) return hit.threadId;
  }

  // ② our own header, echoed back
  if (params.xSnapThreadId) {
    const hit = (
      await db
        .select({ id: schema.threads.id })
        .from(schema.threads)
        .where(and(eq(schema.threads.organizationId, org), eq(schema.threads.id, params.xSnapThreadId)))
        .limit(1)
    )[0];
    if (hit) return hit.id;
  }

  // ③ Outlook Thread-Index: match the stable GUID half against what we emit
  const guid = threadIndexGuid(params.threadIndexHeader);
  if (guid) {
    const rows = await db
      .select({ id: schema.threads.id, threadIndex: schema.threads.threadIndex })
      .from(schema.threads)
      .where(and(eq(schema.threads.organizationId, org), isNotNull(schema.threads.threadIndex)))
      .limit(500);
    const hit = rows.find((r) => threadIndexGuid(r.threadIndex) === guid);
    if (hit) return hit.id;
  }

  // ④ per-thread address already routed us here
  if (params.routeThreadId) return params.routeThreadId;

  // ⑤ RFC 5256 base subject + shared participant + 45-day recency
  const base = baseSubject(params.subject);
  if (base) {
    const sender = params.from.toLowerCase();
    const match = sender.match(/[^\s<>,]+@[^\s<>,]+/);
    const senderEmail = match ? match[0] : null;
    if (senderEmail) {
      const candidate = (
        await db
          .select({ id: schema.threads.id, subject: schema.threads.subject })
          .from(schema.threads)
          .where(
            and(
              eq(schema.threads.organizationId, org),
              eq(schema.threads.clientEmail, senderEmail),
              gte(schema.threads.lastActivityAt, new Date(Date.now() - 45 * 86400_000)),
            ),
          )
          .orderBy(desc(schema.threads.lastActivityAt))
          .limit(1)
      )[0];
      // Same normalized subject (Re:/Fwd:/tags stripped) — not just any
      // thread with this client.
      if (candidate && baseSubject(candidate.subject) === base) return candidate.id;
    }
  }
  return null;
}

/** Ensure the thread carries routing material (address token + Thread-Index
 * GUID), minting and persisting on first use. Refreshed base64 returned. */
export async function ensureThreadRouting(organizationId: string, threadId: string): Promise<{
  addressToken: string;
  threadIndexBase64: string;
}> {
  const db = getDb();
  const row = (
    await db
      .select({ addressToken: schema.threads.addressToken, threadIndex: schema.threads.threadIndex })
      .from(schema.threads)
      .where(and(eq(schema.threads.id, threadId), eq(schema.threads.organizationId, organizationId)))
      .limit(1)
  )[0];
  if (!row) throw new Error("thread not found");
  let token = row.addressToken;
  let stored = row.threadIndex;
  const updates: Partial<typeof schema.threads.$inferInsert> = {};
  if (!token) {
    token = mintAddressToken();
    updates.addressToken = token;
  }
  if (!stored) {
    const minted = mintThreadIndex();
    stored = minted.base64;
    updates.threadIndex = minted.base64;
  }
  const refreshed = refreshThreadIndexBase64(threadIndexGuid(stored)!);
  if (Object.keys(updates).length || refreshed !== stored) {
    await db
      .update(schema.threads)
      .set({ ...updates, threadIndex: refreshed })
      .where(eq(schema.threads.id, threadId));
  }
  return { addressToken: token, threadIndexBase64: refreshed };
}

/* ---------------- the front door ---------------- */

export async function ingestInboxEmail(payload: InboundEmailPayload): Promise<IngestResult> {
  // Route the org (and possibly the thread) from the recipient.
  const routed = await resolveOrg(payload.to);
  const sender = (unwrapForwardedSender(payload) ?? payload.from).toLowerCase();

  // Gmail auto-forward: envelope sender is the forwarding account; the real
  // client is inside X-Forwarded-For (already unwrapped above).
  if (!routed) {
    // Legacy trail: sender recently replied-to via hello+slug (pre-307
    // behavior) so today's live mail keeps threading during rollout.
    const trail = await legacySenderTrail(sender);
    if (!trail) return { matched: false };
    return ingestRouted({ ...payload, from: sender }, trail.organizationId, trail.threadId ?? null);
  }
  return ingestRouted({ ...payload, from: sender }, routed.organizationId, routed.threadId ?? null);
}

/** Pre-307 fallback: the most recent outbound lead reply to this sender. */
async function legacySenderTrail(sender: string): Promise<{ organizationId: string; threadId?: string } | null> {
  const hit = await getD1()
    .prepare(
      `SELECT tm.organization_id AS organizationId, tm.thread_id AS threadId
       FROM thread_message tm
       JOIN thread t ON t.id = tm.thread_id
       WHERE tm.direction = 'out' AND lower(t.client_email) = ?
         AND tm.created_at > unixepoch() - 45*86400
       ORDER BY tm.created_at DESC LIMIT 1`,
    )
    .bind(sender)
    .first<{ organizationId: string; threadId: string }>();
  return hit ?? null;
}

async function ingestRouted(
  payload: InboundEmailPayload,
  organizationId: string,
  routeThreadId: string | null,
): Promise<IngestResult> {
  // Parse failure → stash + triage, never a crash.
  if (payload.parseError) {
    await stashRaw(organizationId, null, payload);
    await mintInboxItems({
      organizationId,
      kind: "email",
      entityType: "email.parse_failed",
      entityId: payload.messageId || crypto.randomUUID(),
      threadId: null,
      title: "Couldn't read an incoming email",
      preview: (payload.subject || payload.from || "").slice(0, 240),
    });
    return { matched: false, organizationId, triage: true };
  }

  // Bounce (DSN): mark the referenced outbound message failed + surface it.
  if (looksLikeDsn(payload)) {
    const ids = [
      ...extractSnapMessageIds(payload.text),
      ...extractSnapMessageIds(payload.inReplyTo),
      ...extractSnapMessageIds(payload.references),
    ];
    if (ids.length) {
      const db = getDb();
      const out = await db
        .update(schema.threadMessages)
        .set({ status: "failed" })
        .where(and(eq(schema.threadMessages.organizationId, organizationId), inArray(schema.threadMessages.rfcMessageId, ids)))
        .returning({ id: schema.threadMessages.id, threadId: schema.threadMessages.threadId });
      if (out.length) {
        const threadId = out[0].threadId;
        await mintInboxItems({
          organizationId,
          kind: "email",
          entityType: "email.bounced",
          entityId: out[0].id,
          threadId,
          title: "A reply didn't deliver — it bounced",
          preview: (payload.subject || "Delivery failure").slice(0, 240),
        });
        return { matched: true, threadId, organizationId, bounced: true };
      }
    }
    return { matched: false, organizationId };
  }

  // Resolve the conversation ①→⑤.
  const threadId = await resolveInboundThread({
    organizationId,
    from: payload.from,
    subject: payload.subject,
    inReplyTo: payload.inReplyTo ?? null,
    references: payload.references ?? null,
    threadIndexHeader: payload.threadIndex ?? null,
    xSnapThreadId: payload.xSnapThreadId ?? null,
    routeThreadId,
  });

  const strippedText = stripQuotedReply(payload.text ?? payload.html ?? "");
  const bodyText = strippedText.slice(0, 8000);
  const subject = (payload.subject || "").slice(0, 300);

  if (!threadId) {
    // Needs triage: known org, unknown conversation.
    await stashRaw(organizationId, null, payload);
    await mintInboxItems({
      organizationId,
      kind: "email",
      entityType: "email.unmatched",
      entityId: payload.messageId || crypto.randomUUID(),
      threadId: null,
      title: `Unmatched email — ${payload.from}`,
      preview: (strippedText || subject).slice(0, 240),
    });
    return { matched: false, organizationId, triage: true };
  }

  const db = getDb();
  const thread = (
    await db.select().from(schema.threads).where(eq(schema.threads.id, threadId)).limit(1)
  )[0];

  // Bodies: sanitized + pixel-neutralized HTML and the raw .eml to R2; D1
  // keeps the text body + keys (2 MB row cap).
  let htmlKey: string | null = null;
  let rawKey: string | null = null;
  try {
    if (payload.html) {
      const clean = neutralizeTrackingPixels(sanitizeEmailHtml(payload.html).html).html;
      htmlKey = await putObject(
        organizationId,
        `mail/${threadId}/${crypto.randomUUID()}.html`,
        clean,
        "text/html",
      );
    }
    rawKey = await stashRaw(organizationId, threadId, payload);
  } catch (err) {
    console.error("inbound body storage failed (continuing without R2 keys):", String(err));
  }

  const messageId = await appendThreadMessage({
    organizationId,
    threadId,
    direction: "in",
    rfcMessageId: payload.messageId || null,
    inReplyTo: payload.inReplyTo ? payload.inReplyTo.slice(0, 995) : null,
    referencesChain: payload.references ? payload.references.slice(0, 4000) : null,
    fromAddr: payload.from.slice(0, 320),
    subject,
    textPreview: bodyText,
    htmlR2Key: htmlKey,
    rawR2Key: rawKey,
    hasAttachments: Boolean(payload.attachments?.length),
    status: "received",
  });

  // Lead bridge: keep the Leads view whole until WEB-308 absorbs it.
  if (thread?.leadId && messageId) {
    try {
      await db.insert(schema.leadMessages).values({
        id: crypto.randomUUID(),
        organizationId,
        leadId: thread.leadId,
        direction: "in",
        subject,
        body: bodyText,
        providerId: payload.messageId,
      });
      await db.update(schema.leads).set({ updatedAt: new Date() }).where(eq(schema.leads.id, thread.leadId));
    } catch (err) {
      console.error("lead bridge failed (inbox message already stored):", String(err));
    }
  }

  const clientName = thread ? await clientNameFor(organizationId, thread) : null;
  await mintInboxItems({
    organizationId,
    kind: "email",
    entityType: "email",
    entityId: payload.messageId || crypto.randomUUID(),
    threadId,
    title: `${clientName ?? payload.from.split("@")[0]} replied`,
    preview: bodyText.slice(0, 240),
  });

  // Dual delivery (WEB-307): mirror to the photographer's real inbox while
  // the Snap inbox is young — org toggle, default on.
  const mirrorQueued = await mirrorToContact(organizationId, payload, threadId, clientName);
  return { matched: true, threadId, organizationId, mirrorQueued };
}

/** Raw .eml to R2 under the org prefix (or an unfiled bucket for triage). */
async function stashRaw(organizationId: string, threadId: string | null, payload: InboundEmailPayload): Promise<string | null> {
  if (!payload.rawEml) return null;
  try {
    const bytes = Uint8Array.from(atob(payload.rawEml), (c) => c.charCodeAt(0));
    const bucket = threadId ? `mail/${threadId}` : "mail/unfiled";
    return await putObject(organizationId, `${bucket}/${crypto.randomUUID()}.eml`, bytes.slice().buffer as ArrayBuffer, "message/rfc822");
  } catch (err) {
    console.error("raw eml stash failed:", String(err));
    return null;
  }
}

async function clientNameFor(
  organizationId: string,
  thread: { clientEmail: string; clientId: string | null; leadId: string | null },
): Promise<string | null> {
  const db = getDb();
  if (thread.clientId) {
    const byId = (
      await db.select({ name: schema.clients.name }).from(schema.clients).where(eq(schema.clients.id, thread.clientId)).limit(1)
    )[0];
    if (byId?.name) return byId.name;
  }
  const byEmail = (
    await db
      .select({ name: schema.clients.name })
      .from(schema.clients)
      .where(and(eq(schema.clients.organizationId, organizationId), eq(schema.clients.email, thread.clientEmail)))
      .limit(1)
  )[0];
  if (byEmail?.name) return byEmail.name;
  if (thread.leadId) {
    const lead = (
      await db.select({ name: schema.leads.name }).from(schema.leads).where(eq(schema.leads.id, thread.leadId)).limit(1)
    )[0];
    if (lead?.name) return lead.name;
  }
  return null;
}

/** The mirror email — branded, deep-linked, X-Snap-* tagged so studios can
 * filter; gated by the org's inbox_mirror toggle. */
async function mirrorToContact(
  organizationId: string,
  payload: InboundEmailPayload,
  threadId: string,
  clientName: string | null,
): Promise<boolean> {
  try {
    const profile = (
      await getDb()
        .select({
          contactEmail: schema.studioProfiles.contactEmail,
          inboxMirror: schema.studioProfiles.inboxMirror,
          studioName: schema.studioProfiles.studioName,
        })
        .from(schema.studioProfiles)
        .where(eq(schema.studioProfiles.organizationId, organizationId))
        .limit(1)
    )[0];
    if (!profile?.contactEmail || !profile.inboxMirror) return false;

    const { getEmailBrand } = await import("@/lib/branding");
    const b = await getEmailBrand(organizationId);
    const senderLabel = clientName ?? payload.from;
    const excerpt = stripQuotedReply(payload.text ?? payload.html ?? "").slice(0, 240);
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    const url = await appUrl("/dashboard/inbox");
    await sendEmail({
      to: profile.contactEmail,
      subject: `💬 ${senderLabel.split(" ")[0]} replied — view in Snap`,
      html: `<!doctype html><html><body style="margin:0;padding:0;background:#f7f8f8;font-family:Inter,-apple-system,system-ui,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8f8;padding:32px 16px;"><tr><td align="center">
  <table role="presentation" style="max-width:480px;background:#fff;border:1px solid #e3e5e8;border-radius:12px;padding:28px 32px;" cellpadding="0" cellspacing="0">
    <tr><td><span style="font-size:12px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${b.accent};">${esc(profile.studioName)} · SNAP</span></td></tr>
    <tr><td style="padding-top:12px;"><p style="margin:0;font-size:15px;color:#0f1011;"><strong>${esc(payload.from)}</strong> replied to your conversation:</p></td></tr>
    <tr><td style="padding-top:12px;"><p style="margin:0;padding:12px 16px;background:#f7f8f8;border-radius:8px;font-size:14px;color:#3f4149;white-space:pre-wrap;">${esc(excerpt || "(see the full message in Snap)")}</p></td></tr>
    <tr><td style="padding-top:20px;"><a href="${url}" style="display:inline-block;background:${b.accent};color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">Reply in Snap</a></td></tr>
  </table>
</td></tr></table></body></html>`,
      text: `${payload.from} replied: ${excerpt}\n\nReply in Snap: ${url}`,
      organizationId,
      template: "inbox.inbound_mirror",
      refId: threadId,
      headers: { "X-Snap-Thread-ID": threadId, "X-Snap-Type": "client-reply-mirror" },
    });
    return true;
  } catch (err) {
    console.error("mirror to contact failed:", String(err));
    return false;
  }
}

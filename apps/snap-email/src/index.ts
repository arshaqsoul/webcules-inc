/**
 * snap-email — inbound email worker for Snap (snaphq.app).
 *
 * Cloudflare Email Routing delivers mail addressed to @snaphq.app
 * here (catch-all). The handler parses with postal-mime, enforces the
 * 25 MiB inbound cap with a graceful setReject (clients are told to use
 * gallery links), and posts the parsed payload to the Snap webhook. WEB-307
 * additions: threading headers (Thread-Index, X-Snap-Thread-ID), the raw
 * .eml for R2 archival (small mail only), auto-forward detection, and a
 * parse-failure path that still posts enough to mint a triage item.
 *
 * message.raw is single-use — buffer it exactly once.
 */
import PostalMime from "postal-mime";

export interface Env {
  EMAIL: SendEmail;
  SNAP_INBOUND_WEBHOOK_URL: string;
  SNAP_INBOUND_WEBHOOK_SECRET?: string;
  OPS_FORWARD_ADDRESS: string;
}

const MAX_INBOUND_BYTES = 25 * 1024 * 1024;
/** Raw .eml rides the webhook only when small — keeps the JSON sane while
 * archiving the text-reply corpus that matters. */
const RAW_EML_MAX_BYTES = 2 * 1024 * 1024;

interface InboundPayload {
  from: string;
  to: string;
  subject: string;
  text: string | null;
  html: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  date: string | null;
  attachments: { filename: string; mimeType: string; size: number }[];
  receivedAt: string;
  rawSize: number;
  threadIndex: string | null;
  xSnapThreadId: string | null;
  contentType: string | null;
  autoSubmitted: boolean;
  xForwardedFor: string | null;
  rawEml: string | null;
  parseError: boolean;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    // 25 MiB cap — reject gracefully before buffering anything.
    if (message.rawSize > MAX_INBOUND_BYTES) {
      message.setReject("Message over 25 MiB — Snap mail is for conversations, not files. Please share via a gallery link.");
      return;
    }

    const raw = await new Response(message.raw).arrayBuffer();

    let payload: InboundPayload;
    try {
      const parsed = await PostalMime.parse(raw);
      const h = (name: string): string | null =>
        parsed.headers?.find((x) => x.key?.toLowerCase() === name)?.value ??
        message.headers.get(name);

      const autoSubmitted = (() => {
        const v = h("auto-submitted");
        return Boolean(v && !/no/i.test(v));
      })();

      payload = {
        from: message.from,
        to: message.to,
        subject: parsed.subject ?? "(no subject)",
        text: parsed.text ?? null,
        html: parsed.html ?? null,
        messageId: h("message-id"),
        inReplyTo: h("in-reply-to"),
        references: h("references"),
        date: h("date"),
        attachments: (parsed.attachments ?? []).map((a) => ({
          filename: a.filename ?? "unnamed",
          mimeType: a.mimeType ?? "application/octet-stream",
          size: typeof a.content === "string" ? a.content.length : (a.content?.byteLength ?? 0),
        })),
        receivedAt: new Date().toISOString(),
        rawSize: message.rawSize,
        threadIndex: h("thread-index"),
        xSnapThreadId: h("x-snap-thread-id"),
        contentType: h("content-type"),
        autoSubmitted,
        xForwardedFor: h("x-forwarded-for"),
        rawEml: raw.byteLength <= RAW_EML_MAX_BYTES ? arrayBufferToBase64(raw) : null,
        parseError: false,
      };
    } catch (err) {
      // Never lose the mail to a parser bug — minimal payload → triage item.
      console.error("snap-email postal-mime parse failed:", String(err));
      payload = {
        from: message.from,
        to: message.to,
        subject: message.headers.get("subject") ?? "(unreadable email)",
        text: null,
        html: null,
        messageId: message.headers.get("message-id"),
        inReplyTo: null,
        references: null,
        date: null,
        attachments: [],
        receivedAt: new Date().toISOString(),
        rawSize: message.rawSize,
        threadIndex: null,
        xSnapThreadId: null,
        contentType: message.headers.get("content-type"),
        autoSubmitted: false,
        xForwardedFor: message.headers.get("x-forwarded-for"),
        rawEml: raw.byteLength <= RAW_EML_MAX_BYTES ? arrayBufferToBase64(raw) : null,
        parseError: true,
      };
    }

    console.log(
      JSON.stringify({
        kind: "snap.inbound_email",
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        messageId: payload.messageId,
        attachments: payload.attachments.length,
        rawSize: payload.rawSize,
        parseError: payload.parseError,
      })
    );

    // Deliver to the Snap app when its inbound webhook is configured.
    if (env.SNAP_INBOUND_WEBHOOK_URL) {
      ctx.waitUntil(deliverToSnap(env, payload));
    }

    // Safety net until (and alongside) the webhook: forward to ops.
    // message.forward() requires a verified destination address.
    if (env.OPS_FORWARD_ADDRESS) {
      try {
        await message.forward(env.OPS_FORWARD_ADDRESS);
      } catch (err) {
        console.error("snap-email forward failed (destination verified?):", String(err));
      }
    }
  },

  /** Daily pipeline automation: ping snap's cron endpoint (status moves). */
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    void controller;
    const target = env.SNAP_INBOUND_WEBHOOK_URL.replace(/\/api\/email\/inbound$/, "/api/cron/daily-status");
    try {
      const res = await fetch(target, {
        method: "POST",
        headers: {
          ...(env.SNAP_INBOUND_WEBHOOK_SECRET
            ? { Authorization: `Bearer ${env.SNAP_INBOUND_WEBHOOK_SECRET}` }
            : {}),
        },
      });
      console.log("snap-email cron ping:", res.status, await res.text());
    } catch (err) {
      console.error("snap-email cron ping failed:", String(err));
    }
  },
} satisfies ExportedHandler<Env>;

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function deliverToSnap(env: Env, payload: InboundPayload): Promise<void> {
  try {
    const res = await fetch(env.SNAP_INBOUND_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.SNAP_INBOUND_WEBHOOK_SECRET
          ? { Authorization: `Bearer ${env.SNAP_INBOUND_WEBHOOK_SECRET}` }
          : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`snap-email webhook delivery failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error("snap-email webhook delivery error:", String(err));
  }
}

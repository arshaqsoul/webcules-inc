/**
 * webcules-snap-email — inbound email worker for Snap (snap.webcules.com).
 *
 * Cloudflare Email Routing delivers mail addressed to @snap.webcules.com
 * addresses here. The handler parses the message, preserves threading
 * headers, forwards to the ops address so nothing is lost before the Snap
 * app's inbound webhook exists, and POSTs the parsed payload to the webhook
 * once configured.
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
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    const raw = await new Response(message.raw).arrayBuffer();
    const parsed = await PostalMime.parse(raw);

    const h = (name: string): string | null =>
      parsed.headers?.find((x) => x.key?.toLowerCase() === name)?.value ??
      message.headers.get(name);

    const payload: InboundPayload = {
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
    };

    // Structured log — visible in Workers observability (tail) for debugging.
    console.log(
      JSON.stringify({
        kind: "snap.inbound_email",
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        messageId: payload.messageId,
        attachments: payload.attachments.length,
        rawSize: message.rawSize,
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
} satisfies ExportedHandler<Env>;

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

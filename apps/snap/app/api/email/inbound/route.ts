/* Inbound email webhook — consumed by the `webcules-snap-email` worker
 * (postal-mime parsed payloads). Bearer-authed with the shared
 * SNAP_INBOUND_WEBHOOK_SECRET set on both workers. Unmatched senders are
 * acknowledged and dropped. */
import { env } from "cloudflare:workers";

import { ingestInboundEmail } from "@/lib/repos/leads";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = env.SNAP_INBOUND_WEBHOOK_SECRET;
  const auth = req.headers.get("Authorization") ?? "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: {
    from?: string;
    to?: string;
    subject?: string;
    text?: string | null;
    html?: string | null;
    messageId?: string | null;
  };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!payload.from || !payload.subject) {
    return Response.json({ error: "invalid_payload" }, { status: 400 });
  }

  const result = await ingestInboundEmail({
    from: payload.from,
    to: payload.to ?? "",
    subject: payload.subject.slice(0, 300),
    text: payload.text ?? null,
    html: payload.html ?? null,
    messageId: payload.messageId ?? null,
  });
  return Response.json({ ok: true, ...result });
}

/* Inbound email webhook — consumed by the `webcules-snap-email` worker
 * (postal-mime parsed payloads). Bearer-authed with the shared
 * SNAP_INBOUND_WEBHOOK_SECRET set on both workers. WEB-307: the full
 * threading pipeline (lib/inbox/ingest.ts) resolves the conversation —
 * headers, Thread-Index, per-thread addresses, subject fallback — stores
 * bodies to R2, mirrors to the photographer per the org toggle, and routes
 * unmatched mail to Needs triage instead of dropping it. Accepts the legacy
 * (pre-307) payload shape during worker rollout. */
import { env } from "cloudflare:workers";

import { ingestInboxEmail, type InboundEmailPayload } from "@/lib/inbox/ingest";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = env.SNAP_INBOUND_WEBHOOK_SECRET;
  const auth = req.headers.get("Authorization") ?? "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: InboundEmailPayload;
  try {
    payload = (await req.json()) as InboundEmailPayload;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!payload.from || (!payload.to && !payload.subject)) {
    return Response.json({ error: "invalid_payload" }, { status: 400 });
  }

  // Ingest never throws into the worker — its failures degrade to triage.
  const result = await ingestInboxEmail({
    ...payload,
    from: payload.from,
    to: payload.to ?? "",
    subject: payload.subject ?? "(no subject)",
  });

  return Response.json({ ok: true, ...result });
}

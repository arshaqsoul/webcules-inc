/* Founder-facing margin report (WEB-161) — internal, JSON only.
 * Access: a signed-in founder (FOUNDER_EMAILS allowlist) or the cron bearer
 * secret for scripted pulls. Usage snapshots must be rolled up first (the
 * daily cron does it); the report is then a single snapshot query. */
import { env } from "cloudflare:workers";

import { computeMarginReport } from "@/lib/margin";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

function founderEmails(): string[] {
  return (env.FOUNDER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function GET(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (env.SNAP_INBOUND_WEBHOOK_SECRET && auth === `Bearer ${env.SNAP_INBOUND_WEBHOOK_SECRET}`) {
    // scripted path — fall through
  } else {
    const user = await getSessionUser();
    if (!user || !founderEmails().includes(user.email.toLowerCase())) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const month = new URL(req.url).searchParams.get("month") ?? undefined;
  const report = await computeMarginReport(month ?? undefined);
  return Response.json(report);
}

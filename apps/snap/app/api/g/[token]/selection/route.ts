/* Client selection submit — validates mode/deadline/limit/membership,
 * replaces any earlier submission (latest wins), and notifies the studio. */
import { getStudioProfile } from "@/lib/repos/studios";
import { sendEmail } from "@/lib/email";
import { resolveGalleryAccess } from "@/lib/shares/gallery-auth";
import { submitSelection } from "@/lib/shares/selections";
import { resolveGrantByToken } from "@/lib/shares/grants";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const grant = await resolveGrantByToken(token);
  const access = await resolveGalleryAccess(req.headers);
  // Same trust model as the gallery page (WEB-132): any valid verified
  // gallery session may interact; writes are scoped to THIS grant's asset
  // set by assetInGrant inside the repo calls.
  if (!grant || !access) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { assetIds?: string[]; note?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!Array.isArray(body.assetIds)) return Response.json({ error: "invalid_body" }, { status: 400 });

  const result = await submitSelection(grant, body.assetIds, body.note ?? null);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

  // Studio notification (best-effort — the row is the source of truth).
  void (async () => {
    try {
      const profile = await getStudioProfile(grant.organizationId);
      const to = profile?.contactEmail;
      if (!to) return;
      const deadline = grant.selectionDeadline
        ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(grant.selectionDeadline * 1000))
        : null;
      await sendEmail({
        to,
        subject: `Client selection submitted — ${result.count} photo${result.count === 1 ? "" : "s"}`,
        text:
          `Your client (${grant.clientEmail}) submitted a selection of ${result.count} photo${result.count === 1 ? "" : "s"}.\n` +
          (body.note ? `Note: ${body.note}\n` : "") +
          (deadline ? `Selection deadline was ${deadline}.\n` : "") +
          `Open the project's Client gallery tab in Snap to see the picks.`,
        html:
          `<p>Your client (<b>${grant.clientEmail}</b>) submitted a selection of <b>${result.count}</b> photo${result.count === 1 ? "" : "s"}.</p>` +
          (body.note ? `<p>Note: ${body.note}</p>` : "") +
          `<p>Open the project's <b>Client gallery</b> tab in Snap to see the picks.</p>`,
        organizationId: grant.organizationId,
        template: "client_selection_submitted",
        refId: grant.id,
      });
    } catch {
      /* notification is advisory */
    }
  })();

  return Response.json({ ok: true, count: result.count });
}

/* /portal/projects/{id} (WEB-133) — the client's read-only window into ONE
 * project. Authorization is strict: the session email must hold the client
 * record this project belongs to (org + clientId match), otherwise the page
 * is a 404 — existence itself is not revealed. Fields are a shared-safe
 * allowlist: internal notes, finances, and other clients never leave the
 * repository. Gallery entries reuse the secure /g/{token} experience. */
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getClientRow } from "@/lib/portal";
import { resolvePortalSession } from "@/lib/portal-auth";
import { getGrantToken, grantIsEffectivelyActive } from "@/lib/shares/grants";
import { getStudioProfile } from "@/lib/repos/studios";
import { safeHexColor } from "@/lib/embed";
import { PortalSignOut } from "@/components/portal-dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Project — Snap", robots: { index: false } };

const STATUS_COPY: Record<string, string> = {
  booked: "Booked",
  snapping: "In editing",
  evaluation: "Reviewing selects",
  complete: "Photos delivered",
  closed: "Archived",
};

export default async function PortalProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const email = await resolvePortalSession(await headers());
  if (!email) redirect("/portal/login");

  const db = getDb();
  const project = (
    await db
      .select({
        id: schema.projects.id,
        organizationId: schema.projects.organizationId,
        clientId: schema.projects.clientId,
        title: schema.projects.title,
        status: schema.projects.status,
        eventDate: schema.projects.eventDate,
        createdAt: schema.projects.createdAt,
      })
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .limit(1)
  )[0];
  if (!project) notFound();

  const client = await getClientRow(project.organizationId, email);
  if (!client || project.clientId !== client.id) notFound();

  const [profile, events, grants] = await Promise.all([
    getStudioProfile(project.organizationId),
    db
      .select({ fromStatus: schema.projectStatusEvents.fromStatus, toStatus: schema.projectStatusEvents.toStatus, createdAt: schema.projectStatusEvents.createdAt })
      .from(schema.projectStatusEvents)
      .where(eq(schema.projectStatusEvents.projectId, project.id))
      .orderBy(asc(schema.projectStatusEvents.createdAt))
      .limit(30),
    db
      .select({ tokenEnc: schema.shareGrants.tokenEnc, status: schema.shareGrants.status, expiresAt: schema.shareGrants.expiresAt, createdAt: schema.shareGrants.createdAt })
      .from(schema.shareGrants)
      .where(
        and(
          eq(schema.shareGrants.organizationId, project.organizationId),
          eq(schema.shareGrants.projectId, project.id),
          eq(schema.shareGrants.clientEmail, email),
        ),
      )
      .limit(20),
  ]);

  const galleryLinks = (
    await Promise.all(
      grants
        .filter((g) => grantIsEffectivelyActive(g) && g.tokenEnc)
        .map(async (g) => ({ url: `/g/${await getGrantToken(g as never)}`, createdAt: g.createdAt })),
    )
  ).filter((g): g is { url: string; createdAt: Date } => Boolean(g.url));

  const brand = JSON.parse(profile?.brand || "{}") as { accent?: string };
  const accent = safeHexColor(brand.accent) ?? "#5e6ad2";

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <div className="mb-8 flex items-center justify-between">
        <a href="/portal" className="text-sm text-ink-subtle hover:text-ink">
          ← Your studios
        </a>
        <PortalSignOut />
      </div>

      <div className="rounded-2xl border border-hairline bg-surface p-6">
        <span className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: accent }}>
          {profile?.studioName ?? "Your studio"}
        </span>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.6px] text-ink">{project.title}</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full px-2.5 py-1 font-medium" style={{ background: `${accent}1a`, color: accent }}>
            {STATUS_COPY[project.status] ?? project.status}
          </span>
          {project.eventDate && (
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-ink-subtle">
              Event {project.eventDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </span>
          )}
        </div>
      </div>

      {galleryLinks.length > 0 && (
        <div className="mt-5 rounded-2xl border border-hairline bg-surface p-6">
          <h2 className="text-base font-semibold text-ink">Your galleries</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {galleryLinks.map((g, i) => (
              <li key={i}>
                <a
                  href={g.url}
                  className="flex items-center justify-between rounded-lg border border-hairline px-4 py-3 text-sm text-ink hover:bg-surface-2"
                >
                  <span>View your photos</span>
                  <span className="text-xs text-ink-subtle">shared {g.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-subtle">Galleries open with your email verification — the same secure links your photographer sends.</p>
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-hairline bg-surface p-6">
        <h2 className="text-base font-semibold text-ink">Timeline</h2>
        {events.length > 0 ? (
          <ol className="mt-4 flex flex-col gap-0">
            {events.map((e, i) => (
              <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
                {i < events.length - 1 && <span className="absolute left-[5px] top-3 h-full w-px bg-hairline" aria-hidden />}
                <span className="mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2" style={{ borderColor: accent }} aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    {e.fromStatus ? `${STATUS_COPY[e.fromStatus] ?? e.fromStatus} → ` : "Created as "}
                    {STATUS_COPY[e.toStatus] ?? e.toStatus}
                  </p>
                  <p className="text-xs text-ink-subtle">
                    {e.createdAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-ink-subtle">No updates yet.</p>
        )}
      </div>
    </main>
  );
}


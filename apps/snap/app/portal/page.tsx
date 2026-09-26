/* /portal (WEB-130) — the client dashboard: every studio the session email
 * has a client record with, and nothing else. Cross-studio isolation comes
 * from the resolver: queries start from client rows for THIS email. */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getClientRows } from "@/lib/portal";
import { resolvePortalSession } from "@/lib/portal-auth";
import { getStudioProfile } from "@/lib/repos/studios";
import { safeHexColor } from "@/lib/embed";
import { NotifyToggle, PortalSignOut } from "@/components/portal-dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your studios — Snap", robots: { index: false } };

export default async function PortalPage() {
  const email = await resolvePortalSession(await headers());
  if (!email) redirect("/portal/login");

  const clientRows = await getClientRows(email);
  if (clientRows.length === 0) redirect("/portal/login");

  const db = getDb();
  const orgIds = clientRows.map((c) => c.organizationId);

  // Shared-safe slices only — never internal notes, finances, or other clients.
  const [profiles, projects, bookings, grants] = await Promise.all([
    db
      .select({ organizationId: schema.studioProfiles.organizationId, studioName: schema.studioProfiles.studioName, brand: schema.studioProfiles.brand, logoKey: schema.studioProfiles.logoKey, embedKey: schema.studioProfiles.embedKey })
      .from(schema.studioProfiles)
      .where(inArray(schema.studioProfiles.organizationId, orgIds)),
    db
      .select({ id: schema.projects.id, organizationId: schema.projects.organizationId, clientId: schema.projects.clientId, title: schema.projects.title, status: schema.projects.status, eventDate: schema.projects.eventDate, createdAt: schema.projects.createdAt })
      .from(schema.projects)
      .where(and(inArray(schema.projects.organizationId, orgIds), inArray(schema.projects.clientId, clientRows.map((c) => c.id))))
      .orderBy(desc(schema.projects.createdAt))
      .limit(100),
    db
      .select({ id: schema.bookings.id, organizationId: schema.bookings.organizationId, projectId: schema.bookings.projectId, startAt: schema.bookings.startAt, status: schema.bookings.status, clientEmail: schema.bookings.clientEmail })
      .from(schema.bookings)
      .where(and(inArray(schema.bookings.organizationId, orgIds), eq(schema.bookings.clientEmail, email)))
      .orderBy(desc(schema.bookings.startAt))
      .limit(50),
    db
      .select({ id: schema.shareGrants.id, organizationId: schema.shareGrants.organizationId, projectId: schema.shareGrants.projectId, tokenHash: schema.shareGrants.tokenHash, status: schema.shareGrants.status, expiresAt: schema.shareGrants.expiresAt, createdAt: schema.shareGrants.createdAt })
      .from(schema.shareGrants)
      .where(and(inArray(schema.shareGrants.organizationId, orgIds), eq(schema.shareGrants.clientEmail, email)))
      .orderBy(desc(schema.shareGrants.createdAt))
      .limit(100),
  ]);

  const now = Date.now();
  const sections = clientRows.map((client) => {
    const profile = profiles.find((p) => p.organizationId === client.organizationId);
    if (!profile) return null;
    const brand = JSON.parse(profile.brand || "{}") as { accent?: string };
    const myProjects = projects.filter((p) => p.organizationId === client.organizationId);
    const myBookings = bookings.filter((b) => b.organizationId === client.organizationId);
    const activeGrantProjectIds = new Set(
      grants
        .filter((g) => g.organizationId === client.organizationId && g.status === "active" && (!g.expiresAt || g.expiresAt.getTime() > now))
        .map((g) => g.projectId),
    );
    return {
      client,
      profile: {
        studioName: profile.studioName,
        accent: safeHexColor(brand.accent) ?? "#5e6ad2",
        logoUrl: profile.logoKey && profile.embedKey ? `/api/embed/logo?key=${profile.embedKey}` : null,
      },
      projects: myProjects.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        eventDate: p.eventDate ? p.eventDate.toISOString() : null,
        hasGallery: activeGrantProjectIds.has(p.id),
      })),
      upcomingBookings: myBookings
        .filter((b) => b.startAt.getTime() >= now - 86400e3 && b.status !== "canceled")
        .length,
      pastBookings: myBookings.filter((b) => b.startAt.getTime() < now - 86400e3 || b.status === "canceled").length,
      activeGalleries: [...activeGrantProjectIds].length,
    };
  });

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5e6ad2]">Snap</span>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.6px] text-ink">Your studios</h1>
          <p className="mt-1 text-sm text-ink-subtle">Signed in as {email}</p>
        </div>
        <PortalSignOut />
      </div>

      <div className="flex flex-col gap-5">
        {sections.filter(Boolean).map((s) => (
          <section key={s!.client.id} className="overflow-hidden rounded-2xl border border-hairline bg-surface">
            <div className="flex items-center gap-3 border-b border-hairline px-5 py-4" style={{ background: `${s!.profile.accent}0d` }}>
              {s!.profile.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- branded logo via authorized proxy
                <img src={s!.profile.logoUrl} alt={s!.profile.studioName} className="max-h-8 max-w-32 object-contain" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold text-white" style={{ background: s!.profile.accent }}>
                  {s!.profile.studioName.slice(0, 1)}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-base font-medium text-ink">{s!.profile.studioName}</span>
              <NotifyToggle organizationId={s!.client.organizationId} initial={s!.client.notify} />
            </div>
            <div className="grid grid-cols-3 divide-x divide-hairline border-b border-hairline text-center">
              <div className="px-3 py-3">
                <p className="text-lg font-semibold text-ink">{s!.projects.length}</p>
                <p className="text-xs text-ink-subtle">Projects</p>
              </div>
              <div className="px-3 py-3">
                <p className="text-lg font-semibold text-ink">
                  {s!.upcomingBookings} <span className="text-xs font-normal text-ink-subtle">upcoming</span>
                </p>
                <p className="text-xs text-ink-subtle">{s!.pastBookings} past bookings</p>
              </div>
              <div className="px-3 py-3">
                <p className="text-lg font-semibold text-ink">{s!.activeGalleries}</p>
                <p className="text-xs text-ink-subtle">Active galleries</p>
              </div>
            </div>
            {s!.projects.length > 0 ? (
              <ul className="divide-y divide-hairline">
                {s!.projects.slice(0, 8).map((p) => (
                  <li key={p.id}>
                    <a href={`/portal/projects/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{p.title}</span>
                      <span className="flex items-center gap-2 text-xs text-ink-subtle">
                        {p.hasGallery && <span className="rounded-full bg-[#5e6ad2]/10 px-2 py-0.5 text-[10px] font-medium text-[#5e6ad2]">gallery</span>}
                        <span>{p.status}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-ink-subtle">No projects with this studio yet.</p>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}

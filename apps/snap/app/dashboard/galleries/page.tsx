import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { NewGalleryPicker } from "@/components/new-gallery-picker";
import { GalleriesView } from "@/components/galleries-view";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { isActiveGrantRow } from "@/lib/galleries-overview";
import { getPlanEntitlements } from "@/lib/plans";
import { getOrgContext } from "@/lib/session";
import { listStudioGrants } from "@/lib/shares/grants";

export const metadata = { title: "Galleries" };

export default async function GalleriesPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");

  const [grants, entitlements, projects] = await Promise.all([
    listStudioGrants(ctx.organizationId),
    getPlanEntitlements(ctx.organizationId),
    getDb()
      .select({ id: schema.projects.id, title: schema.projects.title })
      .from(schema.projects)
      .where(eq(schema.projects.organizationId, ctx.organizationId))
      .orderBy(desc(schema.projects.updatedAt))
      .limit(100),
  ]);

  // Same entitlement source as Billing (WEBC-115) — the header count must
  // match the "n/cap galleries" chip there, including the family pooling.
  const activeCount = entitlements?.activeGalleries ?? grants.filter(isActiveGrantRow).length;
  const cap = entitlements?.maxActiveGalleries ?? null;
  const atCap = cap !== null && activeCount >= cap;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">Galleries</h1>
          <p className="mt-1 text-sm text-ink-subtle">
            Your client gallery links, grouped by project. Links are created from a project&apos;s
            Client gallery tab.
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            {cap === null ? (
              <>
                <span data-testid="gallery-slot-usage">{activeCount} active {activeCount === 1 ? "gallery" : "galleries"}</span>
                <span className="text-ink-tertiary"> · Unlimited</span>
              </>
            ) : (
              <>
                <span data-testid="gallery-slot-usage">
                  {activeCount} of {cap} active {activeCount === 1 ? "gallery" : "galleries"}
                </span>
                {atCap && (
                  <>
                    {" — "}
                    <Link
                      href="/dashboard/settings/billing"
                      className="font-medium text-primary hover:underline"
                    >
                      You&apos;re at your plan cap — upgrade for more
                    </Link>
                  </>
                )}
              </>
            )}
          </p>
        </div>
        <NewGalleryPicker projects={projects} />
      </div>

      <GalleriesView grants={grants} />
    </div>
  );
}

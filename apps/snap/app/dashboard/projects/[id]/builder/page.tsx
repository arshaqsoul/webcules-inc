/* WEB-321 — the gallery page builder route (Lite+). Free studios get an
 * honest locked panel pointing at seed templates + the upgrade path; the
 * builder itself is a desktop surface. Server loads the project's own
 * photos/folders so bindings resolve against reality. */
import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GalleryBuilder } from "@/components/gallery-builder";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { getProjectGalleryDesign } from "@/lib/repos/gallery-design";
import { getDefaultTemplate } from "@/lib/repos/templates";
import { parseGalleryDesignJson, type GalleryDesign } from "@/lib/gallery-design";
import { getStudioProfile } from "@/lib/repos/studios";
import { safeHexColor } from "@/lib/embed";
import { isWhiteLabeled } from "@/lib/branding";

export const dynamic = "force-dynamic";
export const metadata = { title: "Page builder" };

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export default async function BuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  const { id } = await params;
  if (!ctx || !ID_RE.test(id)) notFound();

  const [project, ent] = await Promise.all([
    getDb()
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.organizationId, ctx.organizationId)))
      .limit(1),
    getPlanEntitlements(ctx.organizationId),
  ]);
  if (!project.length) notFound();

  if ((ent?.id ?? "free") === "free") {
    return (
      <main className="mx-auto max-w-lg px-6 py-20 text-center">
        <h1 className="text-lg font-semibold text-ink">The page builder is a Lite feature</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-subtle">
          Every studio — including yours — can apply any of the ten designer gallery templates for free. Making them yours
          (sections, fonts, colors, collages) is where the builder comes in.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href={`/dashboard/projects/${id}?tab=gallery`} className="rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink">
            Browse templates
          </Link>
          <Link href="/dashboard/settings/billing" className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: "var(--accent)" }}>
            See plans
          </Link>
        </div>
      </main>
    );
  }

  const [designRow, presetRow, assetRows, folderRows, profile] = await Promise.all([
    getProjectGalleryDesign(ctx.organizationId, id),
    getDefaultTemplate(ctx.organizationId, "gallery_preset"),
    getDb()
      .select({
        id: schema.assets.id,
        filename: schema.assets.filename,
        kind: schema.assets.kind,
        stars: schema.assets.stars,
        width: schema.assets.width,
        height: schema.assets.height,
        folderId: schema.assets.folderId,
      })
      .from(schema.assets)
      .where(
        and(
          eq(schema.assets.organizationId, ctx.organizationId),
          eq(schema.assets.projectId, id),
          inArray(schema.assets.status, ["approved", "shared"]),
        ),
      )
      .orderBy(asc(schema.assets.createdAt))
      .limit(120),
    getDb()
      .select({ id: schema.folders.id, name: schema.folders.name })
      .from(schema.folders)
      .where(and(eq(schema.folders.organizationId, ctx.organizationId), eq(schema.folders.projectId, id))),
    getStudioProfile(ctx.organizationId),
  ]);

  const folderName = new Map(folderRows.map((f) => [f.id, f.name]));
  const inherited: GalleryDesign | null = presetRow ? parseGalleryDesignJson(presetRow.body) : null;
  const brand = JSON.parse(profile?.brand || "{}") as { accent?: string };

  return (
    <GalleryBuilder
      projectId={id}
      initialDesign={designRow}
      inherited={inherited}
      assets={assetRows.map((a) => ({ id: a.id, filename: a.filename, kind: a.kind, stars: a.stars, folder: a.folderId ? (folderName.get(a.folderId) ?? null) : null, width: a.width, height: a.height }))}
      folders={folderRows}
      canCollage={ent?.id === "studio" || ent?.id === "pro"}
      canNav={true}
      studioName={profile?.studioName ?? "your studio"}
      accent={safeHexColor(brand.accent) ?? "#5e6ad2"}
      contactEmail={profile?.contactEmail ?? null}
      logoUrl={profile?.logoKey && profile?.embedKey && !isWhiteLabeled(ent, profile?.brand) ? `/api/embed/logo?key=${profile.embedKey}` : null}
    />
  );
}

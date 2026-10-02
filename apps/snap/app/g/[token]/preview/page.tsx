/* /g/{projectId}/preview (WEB-301 WP-B) — preview-as-client, pre-send. The
 * photographer's dashboard session IS the key: org-scoped project check,
 * neutral 404 otherwise (never a redirect that leaks a project exists). No
 * grant is minted, no OTP, no token — and because media flows through the
 * staff path of /api/assets and this page writes no view counters, preview
 * traffic never touches budgets or WEB-265 analytics (asserted in tests).
 * The renderer is the SAME GalleryView the client route mounts — one code
 * path, composed with the settings a client grant would receive. */
import { and, asc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { GalleryView } from "@/components/gallery-view";
import { GalleryPreviewFrame } from "@/components/gallery-preview-frame";
import { deterrentsOn, isWhiteLabeled } from "@/lib/branding";
import { effectiveWatermark } from "@/lib/watermark";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getStudioProfile } from "@/lib/repos/studios";
import { effectiveGalleryDesign } from "@/lib/repos/gallery-design";
import { getProjectSlideshow, slideshowForTier } from "@/lib/repos/slideshow";
import { getPlanEntitlements } from "@/lib/plans";
import { getOrgContext } from "@/lib/session";
import { buildMergeValues, renderMerge } from "@/lib/merge";
import { mergeRenderDesign, resolveDesignSections } from "@/lib/gallery-sections";
import { fontFamilyOf, FONTS_CSS_HREF } from "@/lib/fonts";
import { safeHexColor } from "@/lib/embed";
import { adaptSeedToProject, seedTemplateOf } from "@/lib/seed-templates";
import type { GalleryDesign } from "@/lib/gallery-design";
import type { SlideshowProps } from "@/components/gallery-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gallery preview", robots: { index: false } };

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** WEB-258 parity: effective design with cover text merge-rendered.
 * WEB-318: section strings merge through the same path. */
async function designedGallery(organizationId: string, projectId: string): Promise<GalleryDesign | null> {
  const eff = await effectiveGalleryDesign(organizationId, projectId);
  if (!eff.design) return null;
  const values = await buildMergeValues({ organizationId, projectId });
  return mergeRenderDesign(eff.design, values);
}

export default async function GalleryPreviewPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // The dashboard session is the only key. Unauthenticated → the same neutral
  // 404 as any unknown /g path — existence is never confirmed.
  const ctx = await getOrgContext();
  const { token: projectId } = await params;
  const sp = await searchParams;
  const templateKey = typeof sp.template === "string" ? sp.template : null;
  if (!ctx || !ID_RE.test(projectId)) notFound();

  const rows = await getDb()
    .select({
      id: schema.projects.id,
      watermarkOverride: schema.projects.watermarkOverride,
      title: schema.projects.title,
      eventDate: schema.projects.eventDate,
    })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, ctx.organizationId)))
    .limit(1);
  const project = rows[0];
  if (!project) notFound();

  // One audit row per open — cheap, useful signal that previews happen.
  await getDb()
    .insert(schema.auditLog)
    .values({
      id: crypto.randomUUID(),
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.user.id,
      action: "gallery_previewed",
      targetType: "project",
      targetId: projectId,
      meta: "{}",
    })
    .catch(() => undefined);

  // The deliverable set a fresh grant would carry: approved + shared, in
  // delivery order, grouped by the folder names a grant would snapshot.
  const [profile, ent, design, slideshowCfg, assetRows, folderRows] = await Promise.all([
    getStudioProfile(ctx.organizationId),
    getPlanEntitlements(ctx.organizationId),
    designedGallery(ctx.organizationId, projectId),
    getProjectSlideshow(ctx.organizationId, projectId),
    getDb()
      .select({
        id: schema.assets.id,
        filename: schema.assets.filename,
        kind: schema.assets.kind,
        mimeType: schema.assets.mimeType,
        bytes: schema.assets.bytes,
        width: schema.assets.width,
        height: schema.assets.height,
        durationMs: schema.assets.durationMs,
        stars: schema.assets.stars,
        folderId: schema.assets.folderId,
      })
      .from(schema.assets)
      .where(
        and(
          eq(schema.assets.organizationId, ctx.organizationId),
          eq(schema.assets.projectId, projectId),
          inArray(schema.assets.status, ["approved", "shared"]),
        ),
      )
      .orderBy(asc(schema.assets.createdAt)),
    getDb()
      .select({ id: schema.folders.id, name: schema.folders.name })
      .from(schema.folders)
      .where(and(eq(schema.folders.organizationId, ctx.organizationId), eq(schema.folders.projectId, projectId))),
  ]);

  const folderName = new Map(folderRows.map((f) => [f.id, f.name]));
  const brand = JSON.parse(profile?.brand || "{}") as { accent?: string };
  const tier = ent?.id ?? "free";

  // WEB-318: the sectioned plan resolves against the deliverable set a fresh
  // grant would carry (approved + shared — the query above).
  const viewAssets = assetRows.map((a) => ({
    id: a.id,
    filename: a.filename,
    kind: a.kind,
    mimeType: a.mimeType,
    bytes: a.bytes,
    folder: a.folderId ? (folderName.get(a.folderId) ?? null) : null,
    width: a.width,
    height: a.height,
    durationMs: a.durationMs,
    stars: a.stars,
  }));
  const plan = design ? resolveDesignSections(design, viewAssets) : null;
  const fontFamily = fontFamilyOf(design?.theme.font);

  // WEB-320: ?template=<seed key> previews a seed BEFORE applying — the
  // saved design is untouched; the seed is adapted to this project's own
  // photos so the photographer sees exactly what applying would give them.
  let previewDesign = design;
  let previewPlan = plan;
  if (templateKey) {
    const seed = seedTemplateOf(templateKey);
    if (seed) {
      previewDesign = mergeRenderDesign(
        adaptSeedToProject(seed, viewAssets.filter((a) => a.kind === "image").map((a) => a.id)),
        await buildMergeValues({ organizationId: ctx.organizationId, projectId }),
      );
      previewPlan = resolveDesignSections(previewDesign, viewAssets);
    }
  }

  // Same shared context the client route builds — watermark previews ON
  // when the gallery watermarks (the client always sees watermarked).
  const effectiveSlideshow = slideshowForTier(slideshowCfg, tier !== "free");
  const slideshow: SlideshowProps | null = effectiveSlideshow
    ? {
        // No client token exists pre-send — music is token-gated, so the
        // preview shows the slideshow with its pacing/transitions, silent.
        pace: effectiveSlideshow.pace,
        transition: effectiveSlideshow.transition,
        musicUrl: null,
        musicStartAt: effectiveSlideshow.musicStartAt,
      }
    : null;

  return (
    <GalleryPreviewFrame projectId={projectId}>
      {(fontFamilyOf(previewDesign?.theme.font) || fontFamily) ? <link rel="stylesheet" href={FONTS_CSS_HREF} /> : null}
      <GalleryView
        studioName={profile?.studioName ?? "your studio"}
        accent={safeHexColor(brand.accent) ?? "#5e6ad2"}
        logoUrl={profile?.logoKey && profile?.embedKey ? `/api/embed/logo?key=${profile.embedKey}` : null}
        contactEmail={profile?.contactEmail ?? null}
        whiteLabel={isWhiteLabeled(ent, profile?.brand)}
        watermarked={effectiveWatermark({
          ent,
          brand: profile?.brand,
          override: project.watermarkOverride,
          studioName: profile?.studioName,
        }) !== null}
        deterrents={deterrentsOn(ent, profile?.brand)}
        assets={viewAssets}
        /* Grant-level policies don't exist pre-send — the preview shows the
         * media experience; download/selection/sharing activate with the
         * real grant's settings once sent. */
        allowDownload={false}
        expiresAt={null}
        selectionMode="off"
        selectionLimit={null}
        selectionDeadline={null}
        initialFavorites={[]}
        submittedSelection={null}
        clientToken="preview"
        favoriteLists={[]}
        initialNotes={{}}
        canMakeLists={false}
        canNote={false}
        design={previewDesign}
        plan={previewPlan}
        fontFamily={fontFamilyOf(previewDesign?.theme.font) ?? fontFamily}
        slideshow={slideshow}
        allowSharing={false}
        projectTitle={project.title}
        eventDate={
          project.eventDate
            ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(project.eventDate)
            : null
        }
      />
    </GalleryPreviewFrame>
  );
}

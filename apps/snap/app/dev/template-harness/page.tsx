/* WEB-319: the Template Studio harness — a dev-only surface that renders a
 * gallery design against the sample pack, no auth, no grant, no DB. This is
 * the preview-thumbs pipeline's render target (tools/render-template-previews.mjs
 * screenshots it) and the design-iteration loop for authoring seed templates.
 * Gated to local dev (NODE_ENV=development) or SNAP_DEV_HARNESS=1 (staging,
 * set as a worker var when the founder wants to browse templates).
 *
 * ?design=<urlencoded design JSON>  — render an arbitrary v2 design
 * ?template=<seed key>              — render a seed from lib/seed-templates
 * ?genre=<genre>                    — sample set (default: the mix)
 * ?accent=<hex>                     — demo studio accent (default lavender)
 */
import { notFound } from "next/navigation";
import { env } from "cloudflare:workers";

import { GalleryView } from "@/components/gallery-view";
import { parseGalleryDesign, type GalleryDesign } from "@/lib/gallery-design";
import { resolveDesignSections } from "@/lib/gallery-sections";
import { fontFamilyOf, FONTS_CSS_HREF } from "@/lib/fonts";
import { ALL_SAMPLES, SAMPLE_GENRES, SAMPLE_PACK } from "@/lib/sample-pack";
import { SEED_TEMPLATES } from "@/lib/seed-templates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Template harness", robots: { index: false } };

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default async function TemplateHarnessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // (the var is typed as its wrangler default "0" — staging overrides it to "1")
  const allowed = process.env.NODE_ENV === "development" || (env.SNAP_DEV_HARNESS as string) === "1";
  if (!allowed) notFound();

  const sp = await searchParams;
  const one = (k: string): string | null => {
    const v = sp[k];
    return typeof v === "string" && v.length ? v : null;
  };

  let design: GalleryDesign | null = null;
  const templateKey = one("template");
  const designJson = one("design");
  if (templateKey) {
    const seed = SEED_TEMPLATES.find((t) => t.key === templateKey);
    design = seed ? parseGalleryDesign(seed.design) : null;
  } else if (designJson) {
    try {
      design = parseGalleryDesign(JSON.parse(decodeURIComponent(designJson)));
    } catch {
      design = null;
    }
  }
  if (!design) {
    return (
      <main className="mx-auto max-w-2xl p-10 text-sm">
        <h1 className="text-lg font-semibold">Template harness</h1>
        <p className="mt-2 text-ink-subtle">
          Pass <code>?template=key</code> (a seed from lib/seed-templates) or <code>?design=…</code> (urlencoded
          gallery_design v2 JSON). Optional: <code>?genre=</code>{" "}
          {SAMPLE_GENRES.join("|all")} and <code>?accent=#rrggbb</code>.
        </p>
      </main>
    );
  }

  const genre = one("genre");
  const photos = genre && genre !== "all" && (SAMPLE_GENRES as readonly string[]).includes(genre) ? SAMPLE_PACK[genre as (typeof SAMPLE_GENRES)[number]] : ALL_SAMPLES;
  const assets = photos.map((p, i) => ({
    id: p.id,
    filename: p.filename,
    kind: "image",
    mimeType: "image/jpeg",
    bytes: 0,
    folder: p.genre,
    width: p.width,
    height: p.height,
    stars: i % 3 === 0 ? 5 : i % 3 === 1 ? 3 : 0,
    src: p.thumb,
    previewSrc: p.web,
  }));
  const plan = resolveDesignSections(design, assets);
  const fontFamily = fontFamilyOf(design.theme.font);
  const accent = one("accent") && HEX_RE.test(one("accent")!) ? one("accent")!.toLowerCase() : "#5e6ad2";

  return (
    <>
      {fontFamily ? <link rel="stylesheet" href={FONTS_CSS_HREF} /> : null}
      <GalleryView
        studioName="Snap Template Studio"
        accent={accent}
        logoUrl={null}
        contactEmail="hello@snap.example"
        assets={assets}
        allowDownload={false}
        expiresAt={null}
        selectionMode="favorites"
        selectionLimit={null}
        selectionDeadline={null}
        initialFavorites={[assets[1]?.id, assets[4]?.id].filter(Boolean) as string[]}
        submittedSelection={null}
        clientToken="harness"
        design={design}
        plan={plan}
        fontFamily={fontFamily}
        favoriteLists={[{ id: "l1", name: "My favorites" }]}
        initialNotes={{}}
        canMakeLists={false}
        canNote={false}
        projectTitle="Sample Gallery"
        eventDate={null}
      />
    </>
  );
}

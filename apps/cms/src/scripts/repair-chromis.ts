/**
 * One-off repair: the chromis collection's relationship rows were wiped when
 * an update hit D1's ~100 bound-variable limit mid-write. This deletes and
 * recreates the collection doc via the create path (which handles this size).
 * Idempotent; uploads nothing.
 *
 * Run from apps/cms:
 *   NODE_ENV=production PAYLOAD_SECRET=ignore PAYLOAD_REMOTE_MIGRATIONS=1 \
 *     pnpm payload run src/scripts/repair-chromis.ts
 */
import fs from "fs";
import path from "path";
import { getPayload } from "payload";
import config from "@webcules/payload/payload-config";

const IMAGES_ROOT =
  "/Users/arshaqhisham/Documents/Projects/webcules-projects/background-webcules/files/backgrounds";
const PREVIEWS_ROOT = "/tmp/bg-previews";

const TITLE = "Chromis";
const SLUG = "chromis";
const DESCRIPTION =
  "Glossy 3D fluid metal shapes in deep purple and blue gradients with realistic reflections on a dark backdrop.";
const PROMPT = fs
  .readFileSync(path.join(IMAGES_ROOT, SLUG, "prompt.txt"), "utf8")
  .trim();

const naturalSort = (files: string[]): string[] =>
  files.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );

await (async () => {
  const payload = await getPayload({ config });

  const pngs = naturalSort(
    fs
      .readdirSync(path.join(IMAGES_ROOT, SLUG))
      .filter((f) => f.toLowerCase().endsWith(".png")),
  );

  const highResIds: number[] = [];
  const previewIds: number[] = [];
  for (const png of pngs) {
    const base = png.replace(/\.png$/i, "");
    const media = await payload.find({
      collection: "backgroundMedia",
      where: { filename: { equals: png } },
      limit: 1,
    });
    const preview = await payload.find({
      collection: "media",
      where: { filename: { equals: `${base}-preview.jpg` } },
      limit: 1,
    });
    if (media.docs[0]) highResIds.push(media.docs[0].id);
    else console.log(`! missing backgroundMedia ${png}`);
    if (preview.docs[0]) previewIds.push(preview.docs[0].id);
    else console.log(`! missing media ${base}-preview.jpg`);
  }
  console.log(`found ${highResIds.length} high-res, ${previewIds.length} previews`);

  // Remove the broken doc (and any duplicates).
  const existing = await payload.find({
    collection: "backgroundCollections",
    where: { slug: { equals: SLUG } },
    depth: 0,
  });
  for (const doc of existing.docs) {
    await payload.delete({ collection: "backgroundCollections", id: doc.id });
    console.log(`- deleted broken collection #${doc.id}`);
  }

  const created = await payload.create({
    collection: "backgroundCollections",
    data: {
      title: TITLE,
      slug: SLUG,
      slugLock: true,
      description: DESCRIPTION,
      midjourneyPrompt: PROMPT,
      collectionPrice: 4.99,
      status: "published",
      _status: "published",
      publishedAt: new Date().toISOString(),
      isTrending: true,
      backgrounds: {
        lowResPreview: previewIds.slice(0, 3),
        highResFile: highResIds,
      },
    },
  });
  console.log(`+ recreated "${TITLE}" as #${created.id} (published)`);
})();
process.exit(0);

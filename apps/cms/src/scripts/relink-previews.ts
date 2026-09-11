/**
 * Links each backgroundMedia doc to its public low-res preview (media doc)
 * via the `preview` field, so grids render thumbnails and only the image
 * detail page loads the full-res file. Idempotent; uploads nothing.
 *
 * Run from apps/cms:
 *   NODE_ENV=production PAYLOAD_SECRET=ignore PAYLOAD_REMOTE_MIGRATIONS=1 \
 *     pnpm payload run src/scripts/relink-previews.ts
 */
import fs from "fs";
import path from "path";
import { getPayload } from "payload";
import config from "@webcules/payload/payload-config";

const IMAGES_ROOT =
  "/Users/arshaqhisham/Documents/Projects/webcules-projects/background-webcules/files/backgrounds";

const FOLDERS = ["chromis", "fluxa", "lumina", "vireo"];

const naturalSort = (files: string[]): string[] =>
  files.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );

await (async () => {
  const payload = await getPayload({ config });

  for (const folder of FOLDERS) {
    const pngs = naturalSort(
      fs
        .readdirSync(path.join(IMAGES_ROOT, folder))
        .filter((f) => f.toLowerCase().endsWith(".png")),
    );

    let linked = 0;
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
      const mediaDoc = media.docs[0];
      const previewDoc = preview.docs[0];
      if (!mediaDoc || !previewDoc) {
        console.log(`! ${folder}: missing pair for ${png}`);
        continue;
      }
      const currentPreview = mediaDoc.preview;
      const alreadyLinked =
        typeof currentPreview === "object" && currentPreview !== null
          ? currentPreview.id === previewDoc.id
          : currentPreview === previewDoc.id;
      if (!alreadyLinked) {
        await payload.update({
          collection: "backgroundMedia",
          id: mediaDoc.id,
          data: { preview: previewDoc.id },
        });
        linked++;
      }
    }
    console.log(`= ${folder}: ${linked} preview links set (${pngs.length} images)`);
  }

  console.log("Relink complete.");
})();
process.exit(0);

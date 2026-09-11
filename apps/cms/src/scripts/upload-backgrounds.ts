/**
 * One-off content seed for the live backgrounds site.
 *
 * Uploads the AI-generated background images from the source folder into the
 * production CMS (remote D1 + R2 via wrangler platform proxy):
 *  - full-resolution originals -> `backgroundMedia` (secure, paid downloads)
 *  - 1024px JPEG previews      -> `media` (public previews)
 *  - one published `backgroundCollections` doc per folder linking the above
 *
 * Run from apps/cms:
 *   NODE_ENV=production PAYLOAD_SECRET=ignore PAYLOAD_REMOTE_MIGRATIONS=1 \
 *     pnpm payload run src/scripts/upload-backgrounds.ts
 *
 * Idempotent: documents are matched by filename/slug and skipped if they
 * already exist, so the script can be safely rerun after a partial failure.
 */
import fs from "fs";
import path from "path";
import { getPayload } from "payload";
import config from "@webcules/payload/payload-config";

const IMAGES_ROOT =
  "/Users/arshaqhisham/Documents/Projects/webcules-projects/background-webcules/files/backgrounds";
// JPEG previews (1024px, q80) are generated outside Payload (Workers can't run
// sharp, so the CMS never resizes). Regenerate with, from the source folder:
//   sips -Z 1024 -s format jpeg -s formatOptions 80 <src>.png --out /tmp/bg-previews/<folder>/<name>-preview.jpg
const PREVIEWS_ROOT = "/tmp/bg-previews";

const SINGLE_IMAGE_PRICE = 0.5;
const COLLECTION_PRICE = 4.99;
// Every Nth image (alphabetical order) is a free sample.
const FREE_EVERY = 6;

type CollectionSeed = {
  folder: string;
  title: string;
  description: string;
  prompt: string;
  isTrending: boolean;
  altTheme: string;
};

// lumina has no prompt.txt in the source folder; this is the prompt recorded
// for it in the previous site's upload data (files/run-upload/data.csv).
const LUMINA_PROMPT =
  "Abstract fluid lines in the style of black background, neon lights, hyper-realistic water and glass reflections, colorful gradients, liquid metal, electric violet to mine shaft to orchid black, high detail, hyperrealism, close-up, sharp focus, studio lighting, octane render, minimalistic";

const readPrompt = (folder: string, fallback: string): string => {
  try {
    return fs
      .readFileSync(path.join(IMAGES_ROOT, folder, "prompt.txt"), "utf8")
      .trim();
  } catch {
    return fallback;
  }
};

const COLLECTION_SEEDS: CollectionSeed[] = [
  {
    folder: "chromis",
    title: "Chromis",
    description:
      "Glossy 3D fluid metal shapes in deep purple and blue gradients with realistic reflections on a dark backdrop.",
    prompt: readPrompt(
      "chromis",
      "3D abstract fluid shapes with glossy metal surface on a dark background",
    ),
    isTrending: true,
    altTheme: "Abstract glossy metal fluid shapes in purple and blue",
  },
  {
    folder: "fluxa",
    title: "Fluxa",
    description:
      "Smooth flowing silk waves in translucent dark blue and purple with an ethereal bokeh glow on black.",
    prompt: readPrompt(
      "fluxa",
      "Digital background, black, transparent and smooth flowing silk dark blue and purple ethereal",
    ),
    isTrending: false,
    altTheme: "Flowing translucent silk waves in dark blue and purple",
  },
  {
    folder: "lumina",
    title: "Lumina",
    description:
      "Neon liquid metal streams with hyper-realistic reflections and electric violet gradients on black.",
    prompt: LUMINA_PROMPT,
    isTrending: true,
    altTheme: "Neon liquid metal streams with violet gradients on black",
  },
  {
    folder: "vireo",
    title: "Vireo",
    description:
      "Macro photography of iridescent soap bubbles and glass spheres with soft light and serene minimalist depth.",
    prompt: readPrompt(
      "vireo",
      "Close-up of soap bubbles and glass spheres, macro photography, iridescent",
    ),
    isTrending: false,
    altTheme: "Iridescent soap bubbles and glass spheres in macro detail",
  },
];

const naturalSort = (files: string[]): string[] =>
  files.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );

const readBuffer = (filePath: string): {
  data: Buffer;
  size: number;
  name: string;
  mimetype: string;
} => {
  const data = fs.readFileSync(filePath);
  return {
    data,
    size: data.length,
    name: path.basename(filePath),
    mimetype: path.extname(filePath).toLowerCase() === ".png"
      ? "image/png"
      : "image/jpeg",
  };
};

async function main() {
  const payload = await getPayload({ config });
  const now = new Date().toISOString();

  for (const seed of COLLECTION_SEEDS) {
    const sourceDir = path.join(IMAGES_ROOT, seed.folder);
    const files = naturalSort(
      fs
        .readdirSync(sourceDir)
        .filter((f) => f.toLowerCase().endsWith(".png")),
    );
    console.log(
      `\n=== ${seed.title}: ${files.length} images (${seed.isTrending ? "trending" : "standard"}) ===`,
    );

    const highResIds: number[] = [];
    const previewIds: number[] = [];

    for (let i = 0; i < files.length; i++) {
      const filename = files[i];
      const originalPath = path.join(sourceDir, filename);
      const previewPath = path.join(PREVIEWS_ROOT, seed.folder, filename.replace(/\.png$/i, "-preview.jpg"));
      const baseName = filename.replace(/\.png$/i, "");

      if (!fs.existsSync(previewPath)) {
        throw new Error(`Missing preview for ${filename}: ${previewPath}`);
      }

      const isFree = (i + 1) % FREE_EVERY === 0;
      const alt = `${seed.altTheme} — ${seed.title} ${baseName}`;

      // Secure full-resolution original.
      const existingMedia = await payload.find({
        collection: "backgroundMedia",
        where: { filename: { equals: filename } },
        limit: 1,
      });
      let mediaId: number;
      let previewDocId: number;
      if (existingMedia.docs.length > 0) {
        mediaId = existingMedia.docs[0].id;
        // Re-upload the file too: a previous run may have created the doc
        // without its object landing in the real bucket.
        await payload.update({
          collection: "backgroundMedia",
          id: mediaId,
          data: {},
          file: readBuffer(originalPath),
        });
        console.log(`  = backgroundMedia #${mediaId} ${filename} (file refreshed)`);
      } else {
        const mediaDoc = await payload.create({
          collection: "backgroundMedia",
          data: {
            alt,
            isTrending: i === 0,
            isPremium: !isFree,
            singleImagePrice: isFree ? 0 : SINGLE_IMAGE_PRICE,
          },
          file: readBuffer(originalPath),
        });
        mediaId = mediaDoc.id;
        console.log(
          `  + backgroundMedia #${mediaId} ${filename} (${isFree ? "free" : `$${SINGLE_IMAGE_PRICE}`})`,
        );
      }
      highResIds.push(mediaId);

      // Public low-res preview.
      const previewFilename = path.basename(previewPath);
      const existingPreview = await payload.find({
        collection: "media",
        where: { filename: { equals: previewFilename } },
        limit: 1,
      });
      if (existingPreview.docs.length > 0) {
        previewDocId = existingPreview.docs[0].id;
        console.log(`  = ${previewFilename} already in media (#${previewDocId})`);
      } else {
        const previewDoc = await payload.create({
          collection: "media",
          data: { alt },
          file: readBuffer(previewPath),
        });
        previewDocId = previewDoc.id;
        console.log(`  + media #${previewDocId} ${previewFilename}`);
      }
      previewIds.push(previewDocId);

      // Keep the high-res doc pointed at its thumbnail.
      const current = existingMedia.docs[0];
      const linkedPreview =
        current && typeof current.preview === "object" && current.preview !== null
          ? current.preview.id
          : current?.preview;
      if (linkedPreview !== previewDocId) {
        await payload.update({
          collection: "backgroundMedia",
          id: mediaId,
          data: { preview: previewDocId },
        });
      }
    }

    // Collection document, published and linked to its images.
    const slug = seed.folder;
    const existingCollection = await payload.find({
      collection: "backgroundCollections",
      where: { slug: { equals: slug } },
      limit: 1,
    });
    if (existingCollection.docs.length > 0) {
      console.log(
        `  = collection "${seed.title}" already exists (#${existingCollection.docs[0].id}), updating links`,
      );
      await payload.update({
        collection: "backgroundCollections",
        id: existingCollection.docs[0].id,
        data: {
          backgrounds: {
            lowResPreview: previewIds.slice(0, 3),
            highResFile: highResIds,
          },
        },
      });
    } else {
      const collectionDoc = await payload.create({
        collection: "backgroundCollections",
        data: {
          title: seed.title,
          slug,
          slugLock: true,
          description: seed.description,
          midjourneyPrompt: seed.prompt,
          collectionPrice: COLLECTION_PRICE,
          // `_status` is what draft-enabled queries filter on; `status` is the
          // collection's own legacy select field shown in the admin sidebar.
          status: "published",
          _status: "published",
          publishedAt: now,
          isTrending: seed.isTrending,
          backgrounds: {
            lowResPreview: previewIds.slice(0, 3),
            highResFile: highResIds,
          },
        },
      });
      console.log(
        `  + backgroundCollections #${collectionDoc.id} "${seed.title}" published with ${highResIds.length} images`,
      );
    }
  }

  console.log("\nDone.");
}

// Top-level await: `payload run` exits when module evaluation finishes and
// does not wait for promise chains registered via .then().
await main();
process.exit(0);

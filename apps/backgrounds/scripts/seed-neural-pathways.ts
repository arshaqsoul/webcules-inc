import path from "node:path";
import fs from "node:fs";
import { getPayload } from "payload";
import config from "@webcules/payload/payload.config";

/**
 * Seeds the local backgrounds library with the NeuralPathways component pack:
 * public media (previews), secure backgroundMedia (full-res stills), and a
 * published backgroundCollections doc. Run while `pnpm --filter backgrounds dev`
 * is up (local D1/R2 via the wrangler proxy):
 *
 *   node --experimental-strip-types scripts/seed-neural-pathways.ts
 */

const SOCIAL = path.resolve("../..", "webcules", "social", "neural-pathways");
const RENDER = (f: string) => path.join(SOCIAL, "social", "renders", f);
const DOCS = (f: string) => path.join(SOCIAL, "docs", f);

const payload = await getPayload({ config });

// 1) admin user (idempotent)
const existing = await payload.find({ collection: "users", where: { email: { equals: "dev@webcules.com" } }, limit: 1 });
let userId = existing.docs[0]?.id;
if (!userId) {
  const user = await payload.create({
    collection: "users",
    data: { email: "dev@webcules.com", password: "webcules-dev", name: "Webcules Dev", role: "admin" } as any,
  });
  userId = user.id;
  console.log("created user dev@webcules.com");
}

// 2) public media previews (webp)
const uploadMedia = (filePath: string, alt: string) =>
  payload.create({
    collection: "media",
    data: { alt } as any,
    filePath,
  });

const posterMedia = await uploadMedia(DOCS("neural-pathways-poster.webp"), "NeuralPathways hero — gold and blue light-stream lens");
const neuralMedia = await uploadMedia(RENDER("stills/neural-1080x1350.png"), "Neural Pathways variant — gold/electric blue");
const auroraMedia = await uploadMedia(RENDER("stills/aurora-1080x1350.png"), "Neural Pathways variant — aurora emerald/violet");
console.log("media uploaded:", [posterMedia.id, neuralMedia.id, auroraMedia.id].join(", "));

// 3) secure high-res backgroundMedia
const uploadBg = async (filePath: string, alt: string, previewId: string, premium = false) =>
  payload.create({
    collection: "backgroundMedia",
    data: { alt, preview: previewId, isPremium: premium, isTrending: !premium } as any,
    filePath,
  });

const bgNeural = await uploadBg(RENDER("stills/neural-1080x1350.png"), "Neural Pathways — neural palette (full res)", neuralMedia.id);
const bgAurora = await uploadBg(RENDER("stills/aurora-1080x1350.png"), "Neural Pathways — aurora palette (full res)", auroraMedia.id);
const bgSynapse = await uploadBg(RENDER("stills/synapse-1080x1350.png"), "Neural Pathways — synapse palette (full res)", auroraMedia.id);
console.log("backgroundMedia uploaded");

// 4) published collection
const collection = await payload.create({
  collection: "backgroundCollections",
  data: {
    title: "Neural Pathways — Live Component",
    description:
      "The NeuralPathways React component as wallpaper renders: duotone light-stream lens with procedural fog, in three palettes. Installable via shadcn CLI.",
    collectionPrice: 0,
    status: "published",
    isTrending: true,
    backgrounds: {
      lowResPreview: [posterMedia.id, neuralMedia.id, auroraMedia.id],
      highResFile: [bgNeural.id, bgAurora.id, bgSynapse.id],
    },
  } as any,
});
console.log("collection created:", collection.id, collection.slug);
console.log("\nDONE — open http://localhost:3000/collection and the admin at http://localhost:3000/admin");

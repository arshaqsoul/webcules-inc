/**
 * Removes ONLY the documents created by upload-backgrounds.ts so the upload
 * can be rerun from a clean slate (fresh filenames, no -N suffixes).
 * Matches by collection-name prefixes; pre-existing template content
 * (e.g. image-hero1.webp) is untouched.
 */
import { getPayload } from "payload";
import config from "@webcules/payload/payload-config";

const SLUGS = ["chromis", "fluxa", "lumina", "vireo"];
const PATTERN = /^(chromis|fluxa|lumina|vireo)-\d+(-preview)?(-\d+)?\.(png|jpg)$/;

await (async () => {
  const payload = await getPayload({ config });

  for (const slug of SLUGS) {
    const cols = await payload.find({
      collection: "backgroundCollections",
      where: { slug: { equals: slug } },
      depth: 0,
      limit: 10,
    });
    for (const doc of cols.docs) {
      await payload.delete({ collection: "backgroundCollections", id: doc.id });
      console.log(`- backgroundCollections #${doc.id} (${slug})`);
    }
  }

  for (const collection of ["backgroundMedia", "media"] as const) {
    for (let page = 1; ; page++) {
      const { docs, hasNextPage } = await payload.find({
        collection,
        where: {
          or: SLUGS.map((s) => ({ filename: { like: `${s}-%` } })),
        },
        depth: 0,
        limit: 500,
        page,
      });
      const matched = docs.filter((d) =>
        PATTERN.test(String((d as { filename?: string }).filename ?? "")),
      );
      for (const doc of matched) {
        await payload.delete({ collection, id: doc.id });
      }
      console.log(`- ${collection}: deleted ${matched.length} of ${docs.length} (page ${page})`);
      if (!hasNextPage) break;
    }
  }

  console.log("Wipe complete.");
})();
process.exit(0);

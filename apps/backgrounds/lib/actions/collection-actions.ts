import { getPayload } from "payload";
import config from "@webcules/payload/payload-config";
import type { BackgroundCollection } from "@webcules/payload/payload-types";
import { notFound } from "next/navigation";

export async function fetchCollections({
  limit = 10,
  trending = false,
}: {
  limit?: number;
  trending?: boolean;
}): Promise<BackgroundCollection[]> {
  const payload = await getPayload({ config });

  try {
    const { docs } = await payload.find({
      collection: "backgroundCollections",
      where: {
        and: [
          { _status: { equals: "published" } },
          { ...(trending && { isTrending: { equals: true } }) },
        ],
      },
      sort: "-publishedAt",
      limit: limit || 10,
      depth: 1,
    });

    return docs;
  } catch (error) {
    console.error("Error fetching latest collections:", error);
    return [];
  }
}

export async function fetchCollectionId(
  id: string
): Promise<BackgroundCollection> {
  const payload = await getPayload({ config });
  try {
    const doc = await payload.findByID({
      collection: "backgroundCollections",
      id: id,
      // Depth 2 so each high-res file's low-res `preview` is populated for
      // the grid thumbnails (file -> preview).
      depth: 2,
    });

    if (!doc || doc._status !== "published") {
      console.warn(`Collection ID ${id} not found or not published.`);
      notFound();
    }

    return doc;
  } catch (error) {
    console.error(`Error fetching collection ID ${id}:`, error);
    notFound();
  }
}

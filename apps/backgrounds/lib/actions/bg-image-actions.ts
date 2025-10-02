// In your collection-actions.ts or wherever fetchCollectionImageId is located

import { getPayload } from "payload";
import config from "@webcules/payload/payload-config";
import type { BackgroundMedia } from "@webcules/payload/payload-types";
import { notFound } from "next/navigation";

export type ImagePageData = BackgroundMedia & {
  relatedCollection: {
    id: number;
    title: string;
    midjourneyPrompt: string;
  };
};

export async function fetchCollectionImageId(
  imageId: string
): Promise<ImagePageData> {
  const payload = await getPayload({ config });
  const collectionsResult = await payload.find({
    collection: "backgroundCollections",
    where: {
      "backgrounds.highResFile": {
        equals: imageId,
      },
    },
    limit: 1,
    depth: 0,
  });

  const relatedCollection = collectionsResult.docs[0];

  if (!relatedCollection) {
    console.error(`Collection not found for BackgroundMedia ID: ${imageId}`);
    notFound();
  }

  const imageDoc = await payload.findByID({
    collection: "backgroundMedia",
    id: imageId,
  });

  if (!imageDoc) {
    console.error(`BackgroundMedia not found for ID: ${imageId}`);
    notFound();
  }

  const combinedData: ImagePageData = {
    ...imageDoc,
    relatedCollection: {
      id: relatedCollection.id,
      title: relatedCollection.title,
      midjourneyPrompt:
        relatedCollection.midjourneyPrompt || "Prompt not available.",
    },
  };

  return combinedData;
}

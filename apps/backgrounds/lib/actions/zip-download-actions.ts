"use server";

import { getPayload } from "payload";
import config from "@webcules/payload/payload-config";
import JSZip from "jszip";
import type {
  BackgroundCollection,
  BackgroundMedia,
} from "@webcules/payload/payload-types";

interface CollectionDownloadData {
  collection: BackgroundCollection;
  highResFiles: BackgroundMedia[];
  isAccessible: boolean;
}

/**
 * Server action to get collection data for download
 */
export async function getCollectionDownloadData(
  collectionId: string,
  userId: string
): Promise<{ data: CollectionDownloadData | null; error: string | null }> {
  try {
    const payload = await getPayload({ config });

    // Get user data to check access
    const userQuery = await payload.find({
      collection: "users",
      where: { id: { equals: userId } },
      depth: 0,
    });

    const user = userQuery.docs[0];
    if (!user) {
      return { data: null, error: "User not found" };
    }

    // Get collection data
    const collectionQuery = await payload.find({
      collection: "backgroundCollections",
      where: { id: { equals: collectionId } },
      depth: 2, // Get related highResFile data
    });

    if (!collectionQuery.docs.length) {
      return { data: null, error: "Collection not found" };
    }

    const collection = collectionQuery.docs[0] as BackgroundCollection;

    // Check if user has access (paid user or has purchased this collection)
    const hasPurchased = await hasPurchasedCollection(userId, collectionId);
    const isAccessible =
      (user.isPaid && user.subscriptionStatus === "active") || hasPurchased;

    if (!isAccessible) {
      return { data: null, error: "Access denied" };
    }

    // Get high-res files
    const highResFiles = collection.backgrounds?.highResFile || [];

    return {
      data: {
        collection,
        highResFiles: highResFiles as BackgroundMedia[],
        isAccessible,
      },
      error: null,
    };
  } catch (error) {
    console.error("Error getting collection download data:", error);
    return { data: null, error: "Failed to get collection data" };
  }
}

/**
 * Check if user has purchased a specific collection
 */
async function hasPurchasedCollection(
  userId: string,
  collectionId: string
): Promise<boolean> {
  try {
    const payload = await getPayload({ config });

    const purchasesQuery = await payload.find({
      collection: "purchases",
      where: {
        and: [
          { user: { equals: userId } },
          { itemType: { equals: "Whole Collection" } },
          { item: { equals: collectionId } },
        ],
      },
      depth: 0,
    });

    return purchasesQuery.docs.length > 0;
  } catch (error) {
    console.error("Error checking purchase status:", error);
    return false;
  }
}

/**
 * Server action to create and return a ZIP file for a collection
 */
export async function createCollectionZip(
  collectionId: string,
  userId: string
): Promise<{
  zipBuffer: ArrayBuffer | null;
  error: string | null;
  filename: string;
}> {
  try {
    const downloadData = await getCollectionDownloadData(collectionId, userId);

    if (!downloadData.data || downloadData.error) {
      return {
        zipBuffer: null,
        error: downloadData.error || "Failed to get collection data",
        filename: "",
      };
    }

    const { collection, highResFiles } = downloadData.data;
    const zip = new JSZip();

    // Add files to ZIP
    for (const file of highResFiles) {
      if (file.url) {
        try {
          // Make URL absolute if it's relative
          const baseUrl =
            process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";
          const absoluteUrl = file.url.startsWith("http")
            ? file.url
            : `${baseUrl}${file.url}`;

          // Fetch the file content
          const response = await fetch(absoluteUrl);
          if (!response.ok) {
            continue;
          }

          const fileBuffer = await response.arrayBuffer();

          // Add file to ZIP with a clean filename
          const cleanFilename = file.filename
            ? file.filename.replace(/[^a-zA-Z0-9.-]/g, "_")
            : `image_${file.id}.jpg`;

          zip.file(cleanFilename, fileBuffer);
        } catch {
          // Continue with other files if one fails
        }
      }
    }

    // Check if any files were added to the ZIP
    const zipFiles = Object.keys(zip.files);
    if (zipFiles.length === 0) {
      return {
        zipBuffer: null,
        error:
          "No files could be added to ZIP. Check file URLs and permissions.",
        filename: "",
      };
    }

    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });

    // Record the download in history
    await recordDownload(userId, collectionId, "collection");

    // Create filename for download
    const collectionTitle = collection.title
      .replace(/[^a-zA-Z0-9]/g, "_")
      .toLowerCase();
    const filename = `${collectionTitle}_collection.zip`;

    return { zipBuffer, error: null, filename };
  } catch (error) {
    console.error("Error creating collection ZIP:", error);
    return {
      zipBuffer: null,
      error: "Failed to create ZIP file",
      filename: "",
    };
  }
}

/**
 * Server action to get single image file content for download
 */
export async function getImageDownloadData(
  imageId: string,
  userId: string
): Promise<{
  fileBuffer: ArrayBuffer | null;
  filename: string;
  error: string | null;
}> {
  try {
    const payload = await getPayload({ config });

    // Get the image data
    const imageQuery = await payload.find({
      collection: "backgroundMedia",
      where: { id: { equals: imageId } },
      depth: 0,
    });

    if (!imageQuery.docs.length) {
      return { fileBuffer: null, filename: "", error: "Image not found" };
    }

    const image = imageQuery.docs[0] as BackgroundMedia;

    // Get the file URL
    const fileUrl = image.url || "";

    // Make URL absolute if it's relative
    const baseUrl =
      process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";
    const absoluteUrl = fileUrl.startsWith("http")
      ? fileUrl
      : `${baseUrl}${fileUrl}`;

    // Fetch the file content
    const response = await fetch(absoluteUrl);
    if (!response.ok) {
      return {
        fileBuffer: null,
        filename: "",
        error: "Failed to fetch image file",
      };
    }

    const fileBuffer = await response.arrayBuffer();
    const filename = image.filename || `image_${imageId}.jpg`;

    // Record the download in history
    const recordResult = await recordDownload(userId, imageId, "media");
    if (!recordResult.success) {
      console.error("Failed to record image download:", recordResult.error);
    }

    return { fileBuffer, filename, error: null };
  } catch (error) {
    console.error("Error getting image download data:", error);
    return {
      fileBuffer: null,
      filename: "",
      error: "Failed to get image data",
    };
  }
}

/**
 * Server action to record download in download history (for both collections and images)
 */
export async function recordDownload(
  userId: string,
  itemId: string,
  itemType: "media" | "collection"
): Promise<{ success: boolean; error: string | null }> {
  try {
    const payload = await getPayload({ config });
    try {
      // Check if already downloaded to prevent duplicates
      const existingDownload = await payload.find({
        collection: "download-history",
        where: {
          and: [
            { user: { equals: parseInt(userId) } },
            { itemType: { equals: itemType } },
            { "item.value": { equals: parseInt(itemId) } },
          ],
        },
      });

      if (existingDownload.docs.length > 0) {
        return { success: true, error: null }; // Already recorded
      }

      // Record the download
      await payload.create({
        collection: "download-history",
        data: {
          user: parseInt(userId),
          itemType: itemType,
          item: {
            relationTo:
              itemType === "collection"
                ? "backgroundCollections"
                : "backgroundMedia",
            value: parseInt(itemId),
          },
          accessMethod: "subscription", // Could also be "purchase"
          downloadedAt: new Date().toISOString(),
        },
      });

      return { success: true, error: null };
    } catch (error) {
      console.error("Error recording download (continuing anyway):", error);
      return { success: true, error: null }; // Don't fail the download if recording fails
    }
  } catch (error) {
    console.error("Error recording collection download:", error);
    return { success: false, error: "Failed to record download" };
  }
}

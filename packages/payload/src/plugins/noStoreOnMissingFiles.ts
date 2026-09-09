import type { CollectionConfig, Plugin } from "payload";

/**
 * Cloudflare's edge may cache 404 responses for static file URLs. If a media
 * file is requested before it exists (or during a deploy), a cached 404 would
 * keep the URL broken after the file appears. This plugin wraps storage
 * handlers so 404 responses are explicitly non-cacheable.
 */
export const noStoreOnMissingFiles: Plugin = (incomingConfig) => ({
  ...incomingConfig,
  collections: ((incomingConfig.collections || []).map((collection: CollectionConfig) => {
    const upload = collection.upload;

    if (
      typeof upload !== "object" ||
      !Array.isArray(upload.handlers) ||
      upload.handlers.length === 0
    ) {
      return collection;
    }

    return {
      ...collection,
      upload: {
        ...upload,
        handlers: upload.handlers.map((handler) => async (req: any, args: any) => {
          const response = await handler(req, args);

          if (response instanceof Response && response.status === 404) {
            return new Response(null, {
              status: 404,
              headers: {
                "cache-control": "no-store, max-age=0",
              },
            });
          }

          return response;
        }),
      },
    };
  }) as CollectionConfig[]),
});

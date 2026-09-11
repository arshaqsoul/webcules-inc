import type { CollectionConfig } from "payload";
import { authenticated } from "@webcules/payload/access/authenticated";
import { anyone } from "@webcules/payload/access/anyone";
import { authenticatedAndPaid } from "@webcules/payload/access/authenticatedAndPaid";

export const BackgroundMedia: CollectionConfig = {
  slug: "backgroundMedia",
  folders: true,
  admin: {
    group: "Webcules-Backgrounds",
    useAsTitle: "filename",
    description:
      "Highly secure, high-resolution 4K background images. Public read access is DISABLED. Files are served via a secure custom API endpoint.",
  },
  access: {
    read: anyone,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  fields: [
    {
      name: "alt",
      type: "text",
    },
    {
      name: "preview",
      type: "relationship",
      relationTo: "media",
      admin: {
        position: "sidebar",
        description:
          "Public low-res preview (media collection) used as this image's thumbnail in grids. The full-res file is only loaded on the image detail page.",
      },
    },
    {
      name: "isTrending",
      label: "Mark as Trending Image",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description:
          'Mark this specific 4K file to be included in the global "Trending Images" feed.',
      },
    },
    {
      name: "isPremium",
      label: "Mark as Premium Image",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description:
          'Mark this specific 4K file to be included in the global "Trending Images" feed.',
      },
    },
    {
      name: "singleImagePrice",
      label: "Single Image Price (USD)",
      type: "number",
      min: 0,
      required: true,
      admin: {
        description:
          "Price for purchasing a single image from this collection.",
      },
    },
  ],
  upload: {
    // Image resizing/cropping requires sharp, which is unavailable on Cloudflare
    // Workers. Files are stored in R2 (see payload.config.ts storage plugin) and
    // served through the CMS at their original resolution.
    crop: false,
    focalPoint: false,
  },
  hooks: {
    afterRead: [
      ({ doc, req }) => {
        if (!authenticatedAndPaid) {
          doc.url = doc.thumbnailURL;
        }
        return doc;
      },
    ],
  },
};

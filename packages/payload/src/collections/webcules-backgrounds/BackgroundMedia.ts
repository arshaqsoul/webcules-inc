import type { CollectionConfig } from "payload";
import { authenticated } from "@webcules/payload/access/authenticated";
import { authenticatedAndPaid } from "@webcules/payload/access/authenticatedAndPaid";
import { generateBlurhash } from "@webcules/payload/hooks/generateBlurhash";
import { anyone } from "@webcules/payload/access/anyone";

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
    {
      name: "purchasers",
      label: "Individual Purchasers",
      type: "relationship",
      relationTo: "users",
      hasMany: true,
      access: {
        read: ({ req }) => req.user?.role === "admin",
        create: ({ req }) => req.user?.role === "admin",
        update: ({ req }) => req.user?.role === "admin",
      },
      admin: {
        description:
          "Users who have purchased THIS specific collection without a subscription. Only visible to admins.",
        readOnly: true,
      },
    },
  ],
  upload: {
    disableLocalStorage: true,
    adminThumbnail: "thumbnail",
    focalPoint: true,
    imageSizes: [
      {
        name: "thumbnail",
        width: 300,
      },
      {
        name: "small",
        width: 600,
      },
    ],
  },
  hooks: {
    beforeValidate: [generateBlurhash],
  },
};

import type { CollectionConfig } from "payload";
import { isAdmin } from "@webcules/payload/access/isAdmin";
import { authenticated } from "@webcules/payload/access/authenticated";

export const DownloadHistory: CollectionConfig = {
  slug: "download-history",
  admin: {
    useAsTitle: "downloadedAt",
    defaultColumns: ["user", "itemType", "downloadedAt"],
    description:
      "Track all content access by users. Prevents duplicate downloads and maintains user's accessed content library.",
    group: "Analytics",
  },
  access: {
    read: ({ req }) => {
      // Admins can see all download history, users can only see their own
      if (req.user?.role === "admin") {
        return true; // Admins can see all records
      }
      if (req.user) {
        return {
          user: {
            equals: req.user.id,
          },
        };
      }
      return false;
    },
    create: authenticated, // Allow authenticated server actions to create records
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      required: true,
      label: "User",
      admin: {
        readOnly: true,
      },
    },
    {
      name: "itemType",
      type: "select",
      options: [
        { label: "Single Image", value: "media" },
        { label: "Whole Collection", value: "collection" },
      ],
      required: true,
      label: "Content Type",
      admin: {
        readOnly: true,
      },
    },
    {
      name: "item",
      type: "relationship",
      relationTo: ["backgroundCollections", "backgroundMedia"],
      required: true,
      label: "Content Item",
      admin: {
        readOnly: true,
      },
    },
    {
      name: "accessMethod",
      type: "select",
      options: [
        { label: "Subscription Access", value: "subscription" },
        { label: "One-time Purchase", value: "purchase" },
      ],
      required: true,
      label: "How Content Was Accessed",
      admin: {
        readOnly: true,
      },
    },
    {
      name: "downloadedAt",
      type: "date",
      required: true,
      label: "First Accessed Date",
      admin: {
        readOnly: true,
        date: {
          pickerAppearance: "dayAndTime",
        },
      },
      defaultValue: () => new Date(),
    },
  ],
  timestamps: false, // We use downloadedAt instead
  hooks: {
    beforeChange: [
      async ({ data, operation }) => {
        // Create unique identifier for user+item combination
        if (operation === "create") {
          data.uniqueDownload = `${data.user}-${data.item}`;
        }
        return data;
      },
    ],
  },
};

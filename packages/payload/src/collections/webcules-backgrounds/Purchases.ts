import type { CollectionConfig } from "payload";
import { isAdmin } from "@webcules/payload/access/isAdmin";
import { authenticated } from "@webcules/payload/access/authenticated";

export const Purchases: CollectionConfig = {
  slug: "purchases",
  admin: {
    useAsTitle: "transactionID",
    defaultColumns: ["user", "itemType", "price", "createdAt"],
    description:
      "A record of every one-time purchase (single images or whole collections). Subscriptions are tracked on the Users collection.",
    group: "Stripe",
  },
  access: {
    read: authenticated,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      required: true,
      label: "Purchaser",
      access: {
        read: ({ req, doc }) =>
          req.user?.role === "admin" || doc?.user === req.user?.id,
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
      label: "Purchased Item Type",
    },
    {
      name: "item",
      type: "relationship",
      relationTo: ["backgroundCollections", "backgroundMedia"],
      required: true,
      label: "Purchased Item Reference",
      // Dynamic relationship based on itemType
      admin: {
        condition: (data) => data.itemType,
      },
    },
    {
      name: "price",
      type: "number",
      label: "Price Paid (USD)",
      required: true,
      min: 0,
    },
    {
      name: "transactionID",
      type: "text",
      label: "Stripe Checkout Session ID",
      required: true,
      // Ensure this is unique to prevent duplicate webhook processing
      unique: true,
      admin: {
        readOnly: true,
        description: "The unique ID from Stripe for this transaction.",
      },
    },
  ],
  timestamps: true,
};

import type { CollectionConfig } from "payload";
import { authenticated } from "@webcules/payload/access/authenticated";
import { isAdmin } from "@webcules/payload/access/isAdmin";
import { isAdminFieldLevel } from "@webcules/payload/access/isAdminFieldLevel";

export const Users: CollectionConfig = {
  slug: "users",
  access: {
    admin: isAdmin,
    create: authenticated,
    delete: isAdmin,
    read: authenticated,
    update: authenticated,
  },

  admin: {
    defaultColumns: ["name", "email", "role", "isPaid"],
    useAsTitle: "name",
  },
  auth: true,
  fields: [
    {
      name: "name",
      type: "text",
    },
    {
      name: "role",
      label: "User Role",
      type: "select",
      options: [
        { label: "Administrator", value: "admin" },
        { label: "Member", value: "member" },
      ],
      required: true,
      defaultValue: "member",
      admin: {
        position: "sidebar",
      },
      access: {
        update: isAdminFieldLevel,
      },
    },
    {
      name: "isPaid",
      label: "Has Paid Collection Access",
      type: "checkbox",
      defaultValue: false,
      saveToJWT: true,
      admin: {
        position: "sidebar",
        description:
          "Set this to true after a user successfully purchases a collection.",
      },
      access: {
        update: isAdminFieldLevel,
      },
    },
    {
      name: "stripeCustomerID",
      label: "Stripe Customer ID",
      type: "text",
      access: {
        update: isAdminFieldLevel,
        read: isAdminFieldLevel,
      },
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "Stripe Customer ID for this user.",
      },
    },
    {
      name: "subscriptionStatus",
      label: "Stripe Subscription Status",
      type: "select",
      options: [
        { label: "Active", value: "active" },
        { label: "Canceled", value: "canceled" },
        { label: "None", value: "none" },
        { label: "Incomplete", value: "incomplete" },
      ],
      defaultValue: "none",
      access: {
        update: isAdminFieldLevel,
      },
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "Current status of the All Access Subscription.",
      },
    },
  ],
  timestamps: true,
};

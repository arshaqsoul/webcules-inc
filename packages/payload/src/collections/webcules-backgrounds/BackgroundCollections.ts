import type { CollectionConfig } from "payload";
import { authenticated } from "@webcules/payload/access/authenticated";
import { authenticatedOrPublished } from "@webcules/payload/access/authenticatedOrPublished";
import { slugField } from "@webcules/payload/fields/slug";
import { populatePublishedAt } from "@webcules/payload/hooks/populatePublishedAt";
import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from "@payloadcms/plugin-seo/fields";

export const BackgroundCollections: CollectionConfig = {
  slug: "backgroundCollections",
  access: {
    read: authenticatedOrPublished,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  admin: {
    group: "Webcules-Backgrounds",
    useAsTitle: "title",
    defaultColumns: ["title", "slug", "updatedAt", "status"],
    description:
      "A container for a set of secure AI-generated background images. It links to public previews (media) and secure high-res files (backgroundMedia).",
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "description",
      type: "textarea",
      label: "Short Collection Description",
      maxLength: 160,
    },
    {
      name: "midjourneyPrompt",
      type: "textarea",
      label: "Midjourney Prompt (Secure Content)",
      access: {
        read: ({ req, doc }) => {
          return (
            Boolean(req.user && req.user.isPaid) ||
            Boolean(req.user && req.user.role === "admin") ||
            Boolean(doc?.purchasers?.includes(req.user?.id))
          );
        },
      },
      admin: {
        description:
          "The original prompt used to generate the collection images. Only visible to paid users via API.",
      },
    },
    {
      name: "collectionPrice",
      label: "Whole Collection Price (USD)",
      type: "number",
      min: 0,
      required: true,
    },
    {
      name: "status",
      type: "select",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
      ],
      defaultValue: "draft",
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "publishedAt",
      type: "date",
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "isTrending",
      label: "Mark as Trending Collection",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
      },
    },
    {
      type: "tabs",
      tabs: [
        {
          fields: [
            {
              name: "backgrounds",
              type: "group",
              label: "Background Images in Collection",
              admin: {
                description:
                  "Select all low-res previews and corresponding 4K secure files for this collection.",
              },
              fields: [
                {
                  name: "lowResPreview",
                  type: "relationship",
                  relationTo: "media",
                  label: "Public Low-Res Preview (Media)",
                  required: true,
                  hasMany: true,
                  minRows: 1,
                  maxRows: 3,
                  admin: {
                    description:
                      'Select the files uploaded to the public "media" collection to use as the low-resolution thumbnail/preview (up to 3 covers). Per-image thumbnails come from each BackgroundMedia doc\'s own preview field.',
                  },
                },
                {
                  name: "highResFile",
                  type: "relationship",
                  relationTo: "backgroundMedia",
                  label: "4K Secure File (BackgroundMedia)",
                  hasMany: true,
                  required: true,
                  admin: {
                    description:
                      'Select the corresponding 4K high-resolution file uploaded to the secure "backgroundMedia" collection.',
                  },
                },
              ],
            },
          ],
          label: "Background",
        },
        {
          name: "meta",
          label: "SEO",
          fields: [
            OverviewField({
              titlePath: "meta.title",
              descriptionPath: "meta.description",
              imagePath: "meta.image",
            }),
            MetaTitleField({
              hasGenerateFn: true,
            }),
            MetaImageField({
              relationTo: "media",
            }),

            MetaDescriptionField({}),
            PreviewField({
              // if the `generateUrl` function is configured
              hasGenerateFn: true,

              // field paths to match the target field for data
              titlePath: "meta.title",
              descriptionPath: "meta.description",
            }),
          ],
        },
      ],
    },
    ...slugField(),
  ],

  hooks: {
    beforeChange: [populatePublishedAt],
  },

  versions: {
    drafts: {
      autosave: true,
      schedulePublish: true,
    },
  },
};

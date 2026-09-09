import type { CollectionConfig } from "payload";

import {
  FixedToolbarFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from "@payloadcms/richtext-lexical";

import { anyone } from "@webcules/payload/access/anyone";
import { authenticated } from "@webcules/payload/access/authenticated";

export const Media: CollectionConfig = {
  slug: "media",
  folders: true,
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  fields: [
    {
      name: "alt",
      type: "text",
      //required: true,
    },
    {
      name: "caption",
      type: "richText",
      editor: lexicalEditor({
        features: ({ rootFeatures }) => {
          return [
            ...rootFeatures,
            FixedToolbarFeature(),
            InlineToolbarFeature(),
          ];
        },
      }),
    },
    {
      name: "blurhash",
      type: "text",
      admin: {
        readOnly: true,
        disableListColumn: true,
        disableListFilter: true,
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
};

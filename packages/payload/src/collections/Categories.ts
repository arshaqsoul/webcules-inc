import type { CollectionConfig } from "payload";

import { anyone } from "@webcules/payload/access/anyone";
import { authenticated } from "@webcules/payload/access/authenticated";
import { slugField } from "@webcules/payload/fields/slug/index";

export const Categories: CollectionConfig = {
  slug: "categories",
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    useAsTitle: "title",
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    ...slugField(),
  ],
};

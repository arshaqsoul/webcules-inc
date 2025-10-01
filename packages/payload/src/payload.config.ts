import { postgresAdapter } from "@payloadcms/db-postgres";

import sharp from "sharp"; // sharp-import
import path from "path";
import { buildConfig, PayloadRequest } from "payload";
import "dotenv/config";

import { Categories } from "@webcules/payload/collections/Categories";
import { Media } from "@webcules/payload/collections/Media";
import { Pages } from "@webcules/payload/collections/Pages";
import { Posts } from "@webcules/payload/collections/Posts";
import { Users } from "@webcules/payload/collections/Users";
import { Footer } from "@webcules/payload/Footer/config";
import { Header } from "@webcules/payload/Header/config";
import { plugins } from "@webcules/payload/plugins";
import { defaultLexical } from "@webcules/payload/fields/defaultLexical";
import { getServerSideURL } from "@webcules/payload/utilities/getURL";
import { fileURLToPath } from "url";
import { migrations } from "./migrations";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  admin: {
    importMap: {
      baseDir: dirname,
    },
    user: Users.slug,
    livePreview: {
      breakpoints: [
        {
          label: "Mobile",
          name: "mobile",
          width: 375,
          height: 667,
        },
        {
          label: "Tablet",
          name: "tablet",
          width: 768,
          height: 1024,
        },
        {
          label: "Desktop",
          name: "desktop",
          width: 1440,
          height: 900,
        },
      ],
    },
  },
  folders: {
    slug: "folders",
  },
  // This config helps us configure global or default features that the other editors can inherit
  editor: defaultLexical,
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || "",
    },
    migrationDir: path.resolve(dirname, "migrations"),
    prodMigrations: migrations,
  }),
  collections: [Pages, Posts, Media, Categories, Users],
  cors: [getServerSideURL()].filter(Boolean),
  globals: [Header, Footer],
  plugins: [...plugins],
  secret: process.env.PAYLOAD_SECRET || "secret",
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  jobs: {
    access: {
      run: ({ req }: { req: PayloadRequest }): boolean => {
        // Allow logged in users to execute this endpoint (default)
        if (req.user) return true;

        // If there is no logged in user, then check
        // for the Vercel Cron secret to be present as an
        // Authorization header:
        const authHeader = req.headers.get("authorization");
        return authHeader === `Bearer ${process.env.CRON_SECRET}`;
      },
    },
    tasks: [],
  },
});

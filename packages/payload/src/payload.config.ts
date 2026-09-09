import { sqliteD1Adapter } from "@payloadcms/db-d1-sqlite";
import { r2Storage } from "@payloadcms/storage-r2";
import { CloudflareContext, getCloudflareContext } from "@opennextjs/cloudflare";
import { GetPlatformProxyOptions } from "wrangler";

import fs from "fs";
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
import { noStoreOnMissingFiles } from "@webcules/payload/plugins/noStoreOnMissingFiles";
import { defaultLexical } from "@webcules/payload/fields/defaultLexical";
import { getServerSideURL } from "@webcules/payload/utilities/getURL";
import { fileURLToPath } from "url";
import { BackgroundMedia } from "@webcules/payload/collections/webcules-backgrounds/BackgroundMedia";
import { BackgroundCollections } from "@webcules/payload/collections/webcules-backgrounds/BackgroundCollections";
import { Purchases } from "./collections/webcules-backgrounds/Purchases";
import { DownloadHistory } from "./collections/webcules-backgrounds/DownloadHistory";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const realpath = (value: string) =>
  typeof value === "string" && path.isAbsolute(value)
    ? (fs.realpathSync(value) as string)
    : value;

const isCLI = process.argv.some((value) =>
  realpath(value)?.endsWith(path.join("payload", "bin.js")),
);
const isProduction = process.env.NODE_ENV === "production";

/**
 * Cloudflare Workers cannot run pino-pretty (it relies on fs.write), so
 * production logs are routed through console.* as JSON lines.
 */
/**
 * JSON.stringify(Error) produces {} (message/stack are non-enumerable), so
 * errors nested in pino-style fields are explicitly unwrapped.
 */
const serializeLogValue = (value: unknown): unknown => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: typeof value.stack === "string" ? value.stack.split("\n").slice(0, 6) : undefined,
      cause: value.cause ? serializeLogValue(value.cause) : undefined,
    };
  }
  if (Array.isArray(value)) return value.map(serializeLogValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, serializeLogValue(v)]),
    );
  }
  return value;
};

const createLog =
  (level: string, fn: typeof console.log) =>
  (objOrMsg: object | string, msg?: string) => {
    if (typeof objOrMsg === "string") {
      fn(JSON.stringify({ level, msg: objOrMsg }));
    } else {
      const rest = serializeLogValue(objOrMsg) as Record<string, unknown>;
      fn(
        JSON.stringify({
          level,
          ...rest,
          msg: (rest.msg as string) ?? msg,
        }),
      );
    }
  };

const cloudflareLogger = {
  level: process.env.PAYLOAD_LOG_LEVEL || "info",
  trace: createLog("trace", console.debug),
  debug: createLog("debug", console.debug),
  info: createLog("info", console.log),
  warn: createLog("warn", console.warn),
  error: createLog("error", console.error),
  fatal: createLog("fatal", console.error),
  silent: () => {},
} as any;

const cloudflare = await resolveCloudflareContext();

/**
 * Resolves the Cloudflare context for Payload.
 *
 * - Production workers: from the OpenNext request context (set by the worker
 *   entrypoint on the global scope).
 * - CLI (`payload` commands) and local dev: from a wrangler platform proxy.
 * - During `next build` page-data collection the proxy is best-effort: a
 *   failure falls back to an empty binding stub because Payload never queries
 *   the database at build time. Explicit migrations
 *   (`PAYLOAD_REMOTE_MIGRATIONS=1 payload migrate`) always require a real
 *   binding and will throw instead of degrading.
 */
async function resolveCloudflareContext(): Promise<CloudflareContext> {
  if (!isCLI && isProduction) {
    // Inside the deployed worker the entrypoint puts the context on the
    // global scope, so this resolves immediately with real bindings.
    try {
      return await getCloudflareContext({ async: true });
    } catch {
      // Not inside the worker (next build page-data collection, tests, ...).
      // Payload never queries the database at build time, so degrade to a
      // best-effort local proxy and finally to an empty stub - a failed
      // binding resolution must never break a build.
      try {
        return await getCloudflareContextFromWrangler(false);
      } catch {
        return emptyCloudflareContext();
      }
    }
  }

  const wantRemote = process.env.PAYLOAD_REMOTE_MIGRATIONS === "1";
  try {
    return await getCloudflareContextFromWrangler(wantRemote);
  } catch (error) {
    if (isCLI) {
      // Migrations need a real database binding - fail loudly.
      throw error;
    }
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: `Cloudflare bindings unavailable, using empty stub: ${(error as Error)?.message}`,
      }),
    );
    return emptyCloudflareContext();
  }
}

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
  db: sqliteD1Adapter({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    binding: (cloudflare.env as any).D1,
    migrationDir: path.resolve(dirname, "migrations-d1"),
  }),
  collections: [
    Pages,
    Posts,
    Media,
    Categories,
    Users,
    BackgroundMedia,
    BackgroundCollections,
    Purchases,
    DownloadHistory,
  ],
  cors: [
    getServerSideURL(),
    "https://webcules.com",
    "https://www.webcules.com",
    "https://backgrounds.webcules.com",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
  ].filter(Boolean),
  globals: [Header, Footer],
  plugins: [
    ...plugins,
    r2Storage({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bucket: (cloudflare.env as any).R2,
      // NOTE: no per-collection `prefix` — in @payloadcms/storage-r2 3.58.x the
      // static file handler ignores it (files would be written under the
      // prefix but served/deleted from the bucket root). Bucket root keys are
      // the upstream-default, consistent behavior.
      collections: {
        media: true,
        backgroundMedia: true,
      },
    }),
    // Must come after r2Storage so the handlers it installs are wrapped.
    noStoreOnMissingFiles,
  ],
  secret: process.env.PAYLOAD_SECRET || "secret",
  logger: isProduction ? cloudflareLogger : undefined,
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

// Adapted from https://github.com/opennextjs/opennextjs-cloudflare/blob/d00b3a13e42e65aad76fba41774815726422cc39/packages/cloudflare/src/api/cloudflare-context.ts#L328C36-L328C46
function emptyCloudflareContext(): CloudflareContext {
  return {
    env: {},
    cf: {},
    ctx: { waitUntil: () => {}, passThroughOnException: () => {} },
  } as unknown as CloudflareContext;
}

async function getCloudflareContextFromWrangler(
  wantRemote = false,
): Promise<CloudflareContext> {
  const { getPlatformProxy } = await import(
    /* webpackIgnore: true */ `${"__wrangler".replaceAll("_", "")}`
  );
  return getPlatformProxy({
    environment: process.env.CLOUDFLARE_ENV,
    // Remote (real) D1/R2 bindings are only needed for explicit database
    // migrations (`PAYLOAD_REMOTE_MIGRATIONS=1 payload migrate`). Regular
    // builds and dev use local bindings so builds never touch production data.
    remoteBindings: wantRemote,
  } satisfies GetPlatformProxyOptions);
}

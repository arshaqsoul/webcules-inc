/* D1 access for the landing worker.
 *
 * Follows the same philosophy as packages/payload/src/payload.config.ts:
 *  - deployed worker: the real `D1` binding from the OpenNext request context
 *  - local dev: getCloudflareContext is wired to wrangler's platform proxy via
 *    initOpenNextCloudflareForDev() in next.config.mjs (.dev.vars supplies secrets)
 *  - outside a request context (scripts, stray build-time calls): fall back to
 *    `wrangler getPlatformProxy`, cached module-level so miniflare boots once
 *
 * NEVER call getDb()/getEnv() at module top-level — bindings only exist per
 * request and builds must not depend on them.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle, type AnyD1Database } from "drizzle-orm/d1";
import type { GetPlatformProxyOptions } from "wrangler";

import * as schema from "./db-schema";

/** The subset of the worker env the landing app reads. */
export interface AppEnv {
  D1?: AnyD1Database;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

type GetPlatformProxy = (options?: GetPlatformProxyOptions) => Promise<{ env: Record<string, unknown> }>;

// Cached so the miniflare instance behind getPlatformProxy boots at most once
// per process (same pattern as the payload config's wrangler fallback).
let platformProxyPromise: Promise<{ env: Record<string, unknown> }> | null = null;

async function getEnvFromPlatformProxy(): Promise<{ env: Record<string, unknown> }> {
  if (!platformProxyPromise) {
    platformProxyPromise = (async () => {
      // Dynamic import behind a runtime-computed specifier so bundlers
      // (webpack during `next build`, turbopack during `next dev`) don't try
      // to trace wrangler into the server bundle — same trick as the payload
      // config. `wrangler` is a devDependency and never ships to the worker;
      // this path is only reachable outside a deployed worker anyway.
      const wrangler = (await import(
        /* webpackIgnore: true */
        /* turbopackIgnore: true */
        `${"__wrangler".replaceAll("_", "")}`
      )) as { getPlatformProxy?: GetPlatformProxy };
      if (!wrangler.getPlatformProxy) {
        throw new Error("wrangler getPlatformProxy is unavailable in this environment");
      }
      return wrangler.getPlatformProxy({});
    })();
  }
  return platformProxyPromise;
}

/** Resolve the worker env: real bindings in the deployed worker / dev proxy,
 * wrangler platform proxy as a last resort (scripts, out-of-request contexts). */
export async function getEnv(): Promise<AppEnv> {
  let env: Record<string, unknown>;
  try {
    env = (await getCloudflareContext({ async: true })).env as unknown as Record<string, unknown>;
  } catch {
    // Not inside a request context — e.g. a plain node process. Falls back to
    // a local miniflare instance seeded from wrangler.jsonc + .dev.vars.
    env = (await getEnvFromPlatformProxy()).env;
  }
  return env as AppEnv;
}

/** Drizzle client over the shared `webcules-cms` D1 database. Per-call, cheap. */
export async function getDb() {
  const env = await getEnv();
  if (!env.D1) {
    throw new Error(
      "D1 binding not available: getCloudflareContext() returned no D1 binding. " +
        "API routes must never be called at build time.",
    );
  }
  return drizzle(env.D1, { schema });
}

export { schema };

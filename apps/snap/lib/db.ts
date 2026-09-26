/* D1 access for the Snap worker.
 *
 * Bindings come from `cloudflare:workers` env — the recommended vinext
 * pattern (server components, route handlers, server actions). In dev,
 * vinext runs in workerd with the same bindings via the Cloudflare Vite
 * plugin, so no platform-proxy fallback is needed.
 *
 * Tenant discipline: every query goes through lib/repos/* with an org
 * context — never issue ad-hoc drizzle calls from route handlers.
 */
import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./db-schema";

export type Db = ReturnType<typeof getDb>;

/** Drizzle client over the dedicated `webcules-snap` D1 database. Cheap — call per use. */
export function getDb() {
  return drizzle(env.D1, { schema });
}

/** Raw D1 binding (migrations tooling, batch statements outside drizzle). */
export function getD1() {
  return env.D1;
}

export { schema };

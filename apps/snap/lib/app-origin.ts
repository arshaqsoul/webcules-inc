/* The deployed app's own origin (WEB-330), read from the worker vars so
 * production, staging and a future snaphq.app cutover need no code change.
 * Server-only (reads cloudflare:workers). Client-safe constants live in
 * lib/hosts.ts. */
import { PUBLIC_ORIGIN } from "@/lib/hosts";

/** https origin of this deployment, no trailing slash. */
export async function appOrigin(): Promise<string> {
  const { env } = await import("cloudflare:workers");
  return (env.NEXT_PUBLIC_APP_URL || PUBLIC_ORIGIN).replace(/\/+$/, "");
}

/** Absolute URL on this deployment's main origin (studio-facing links). */
export async function appUrl(path: string): Promise<string> {
  return `${await appOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}

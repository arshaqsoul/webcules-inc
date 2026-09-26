/* Runtime-only secrets (wrangler secret put) are not part of the generated
 * worker-configuration.d.ts Env — merge them into both Env declarations
 * (the `cloudflare:workers` env binding is typed as Cloudflare.Env). */
declare namespace Cloudflare {
  interface Env {
    BETTER_AUTH_SECRET?: string;
    SNAP_INBOUND_WEBHOOK_SECRET?: string;
  }
}

interface Env {
  BETTER_AUTH_SECRET?: string;
  SNAP_INBOUND_WEBHOOK_SECRET?: string;
}

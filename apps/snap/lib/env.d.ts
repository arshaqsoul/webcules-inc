/* Runtime-only secrets (wrangler secret put) and public vars not present in
 * the generated worker-configuration.d.ts Env — merged into both Env
 * declarations (the `cloudflare:workers` env binding is typed as
 * Cloudflare.Env). Regenerate worker-configuration.d.ts after wrangler.jsonc
 * changes: `wrangler types`. */
declare namespace Cloudflare {
  interface Env {
    BETTER_AUTH_SECRET?: string;
    SNAP_INBOUND_WEBHOOK_SECRET?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    STRIPE_SECRET_KEY?: string;
    TURNSTILE_SECRET_KEY?: string;
    R2_S3_ACCESS_KEY_ID?: string;
    R2_S3_SECRET_ACCESS_KEY?: string;
    /** Cloudflare account id — hosts the S3 endpoint ({id}.r2.cloudflarestorage.com). */
    R2_S3_ACCOUNT_ID?: string;
    /** "otp" (default) | "off" — email-shock contingency for gallery OTPs. */
    GALLERY_OTP_MODE?: string;
    /** Comma-separated founder emails — gates the margin report + alerts. */
    FOUNDER_EMAILS?: string;
  }
}

interface Env {
  BETTER_AUTH_SECRET?: string;
  SNAP_INBOUND_WEBHOOK_SECRET?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  R2_S3_ACCESS_KEY_ID?: string;
  R2_S3_SECRET_ACCESS_KEY?: string;
  R2_S3_ACCOUNT_ID?: string;
  GALLERY_OTP_MODE?: string;
  FOUNDER_EMAILS?: string;
}

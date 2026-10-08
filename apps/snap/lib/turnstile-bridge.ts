/* Turnstile bridge (WEB-333) - pure, client-safe helpers.
 *
 * A Turnstile widget only renders on hostnames listed on the widget, and a
 * Free-plan widget holds at most 10. Studios' custom domains would each need
 * adding by hand and the list would cap out at a handful of customers. So
 * pages on a studio's custom hostname never render Turnstile themselves: they
 * embed a tiny page served from OUR main origin (GET /ts) that renders the
 * widget there (hostname = ours, always allowed) and hands the token back with
 * postMessage. Our own hosts keep the native widget.
 *
 * Security shape: /ts only frames for hosts it can vouch for (an app host, or
 * an ACTIVE custom domain row), pins both `frame-ancestors` and the
 * postMessage target to that single host, and the parent only trusts messages
 * whose origin is the main origin AND whose source is its own iframe. */
import { APP_HOSTS, PUBLIC_ORIGIN } from "@/lib/hosts";

export const TS_BRIDGE_PATH = "/ts";
export const TS_MESSAGE_TYPE = "snap:turnstile";
export const TS_RESET_TYPE = "snap:turnstile:reset";

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/** True when a page on `hostname` must use the bridge (it is not one of our
 * own hosts and not local dev). */
export function needsBridge(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return !APP_HOSTS.includes(h) && !LOCAL.test(h) && !h.endsWith(".workers.dev") && !h.endsWith(".localhost");
}

/** A plausible bare hostname (no scheme, port, path or wildcard). */
export function isPlainHostname(value: string): boolean {
  return value.length <= 253 && /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value);
}

/** The iframe URL a custom-host page embeds. */
export function bridgeUrl(hostname: string, appOrigin: string = PUBLIC_ORIGIN): string {
  return `${appOrigin}${TS_BRIDGE_PATH}?o=${encodeURIComponent(hostname.toLowerCase())}`;
}

/** The CSP header /ts sends so only the vouched host can frame it. */
export function frameAncestorsFor(hostname: string): string {
  return `frame-ancestors https://${hostname.toLowerCase()}`;
}

export type BridgeMessage = { kind: "token"; token: string } | { kind: "expired" } | { kind: "error" };

/** Parse what /ts posts to its parent; null for anything else. */
export function parseBridgeMessage(data: unknown): BridgeMessage | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { type?: unknown; token?: unknown; state?: unknown };
  if (d.type !== TS_MESSAGE_TYPE) return null;
  if (d.state === "expired") return { kind: "expired" };
  if (d.state === "error") return { kind: "error" };
  if (typeof d.token === "string" && d.token.length > 0 && d.token.length <= 4096) return { kind: "token", token: d.token };
  return null;
}

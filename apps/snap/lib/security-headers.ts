/* WEB-202 baseline response headers, applied to every response by proxy.ts.
 *
 * The widget surfaces (/embed/*, /ts) are framed cross-origin on purpose and set
 * their own per-studio CSP `frame-ancestors`. Middleware headers overwrite
 * route headers (vinext mergeMiddlewareResponseHeaders -> set), so a global
 * CSP there would silently replace the studio's origin allow-list. Those paths
 * therefore get everything except the CSP. */

const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()";

/** Framed cross-origin by design; they own their frame-ancestors. */
export function ownsFrameAncestors(pathname: string): boolean {
  return pathname.startsWith("/embed/") || pathname === "/ts" || pathname.startsWith("/ts/");
}

export function baseSecurityHeaders(pathname: string, isHttps: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": PERMISSIONS_POLICY,
  };
  if (isHttps) headers["Strict-Transport-Security"] = "max-age=31536000";
  if (!ownsFrameAncestors(pathname)) {
    headers["Content-Security-Policy"] = "frame-ancestors 'self'; base-uri 'self'; object-src 'none'";
    headers["X-Frame-Options"] = "SAMEORIGIN";
  }
  return headers;
}

export function withSecurityHeaders<T extends Response>(res: T, pathname: string, isHttps: boolean): T {
  for (const [k, v] of Object.entries(baseSecurityHeaders(pathname, isHttps))) res.headers.set(k, v);
  return res;
}

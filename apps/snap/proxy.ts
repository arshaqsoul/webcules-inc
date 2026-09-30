/* WEB-227 serving guard — non-client-facing paths (dashboard, auth, admin,
 * embed widget routes, docs) must never serve on a studio's custom hostname:
 * a request for one on any non-default host is 302'd to the same path on the
 * main origin. Client-facing surfaces (/g/[token], /b/[slug], /inv, /c,
 * /portal, /api/assets, /api/embed/logo|ics) are token/slug-scoped and serve
 * on any host unchanged. */
import { NextResponse, type NextRequest } from "next/server";

import { nonClientPathRedirect } from "@/lib/domains";

export const proxy = (req: NextRequest) => {
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host") || new URL(req.url).host;
  const target = nonClientPathRedirect(host, new URL(req.url).pathname);
  if (!target) return NextResponse.next();
  const url = new URL(target);
  url.search = new URL(req.url).search;
  return NextResponse.redirect(url, 307);
};

export const config = {
  // Everything except the framework's static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

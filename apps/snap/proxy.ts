/* WEB-227 serving guard — non-client-facing paths (dashboard, auth, admin,
 * embed widget routes, docs) must never serve on a studio's custom hostname:
 * a request for one on any non-default host is 302'd to the same path on the
 * main origin. Client-facing surfaces (/g/[token], /b/[slug], /inv, /c,
 * /portal, /api/assets, /api/embed/logo|ics) are token/slug-scoped and serve
 * on any host unchanged. */
import { NextResponse, type NextRequest } from "next/server";

import { appOrigin } from "@/lib/app-origin";
import { nonClientPathRedirect } from "@/lib/domains";

export const proxy = async (req: NextRequest) => {
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host") || new URL(req.url).host;
  const { pathname } = new URL(req.url);
  const target = nonClientPathRedirect(host, pathname, await appOrigin());
  if (target) {
    const url = new URL(target);
    url.search = new URL(req.url).search;
    return NextResponse.redirect(url, 307);
  }
  /* LLM-friendly docs (Linear convention): /docs/<slug>.md serves the same
   * Markdown the Copy-page button produces, keeping the pretty URL. */
  const mdMatch = /^\/docs\/([a-z0-9-]+)\.md$/.exec(pathname);
  if (mdMatch && req.method === "GET") {
    return NextResponse.rewrite(new URL(`/api/docs/markdown?slug=${mdMatch[1]}`, req.url));
  }
  return NextResponse.next();
};

export const config = {
  // Everything except the framework's static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

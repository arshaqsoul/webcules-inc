/* Store preview session (WEB-277, Commerce C1 6/7) — mints the server-side
 * preview flag for "Preview the store as a client": an HttpOnly, signed
 * cookie bound to this org (lib/store-preview.ts). Cart and checkout
 * mutations refuse sessions carrying a valid flag, so preview can never
 * create a real order. The route also returns the preview URL so the
 * dashboard's "preparing" state resolves to a real page. */
import { env } from "cloudflare:workers";

import { signStorePreviewToken, STORE_PREVIEW_COOKIE } from "@/lib/store-preview";
import { permissionDenied } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function POST() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  const ent = await getPlanEntitlements(ctx.organizationId);
  if (!ent?.storeEnabled) return Response.json({ error: "store_disabled" }, { status: 403 });

  const secret = env.BETTER_AUTH_SECRET;
  if (!secret) return Response.json({ error: "not_configured" }, { status: 500 });
  const token = await signStorePreviewToken(ctx.organizationId, secret);
  const res = Response.json({ url: "/dashboard/store/preview" });
  res.headers.append(
    "Set-Cookie",
    `${STORE_PREVIEW_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800`,
  );
  return res;
}

/* Public welcome-collage image (the picture heading the gallery email and the
 * gallery). Mail clients and their image proxies send no cookies, so access
 * is an HMAC over the image id AND a live check that a still-active gallery
 * references it - revoking or expiring the gallery stops it loading. Short
 * cache so that propagates within minutes. */
import { verifyWelcomeSig } from "@/lib/welcome-link";
import { liveWelcomeImage } from "@/lib/repos/welcome-image";
import { getObject } from "@/lib/storage/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sig = new URL(req.url).searchParams.get("s") ?? "";
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9]{32}$/.test(sig) || !(await verifyWelcomeSig(id, sig))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const image = await liveWelcomeImage(id);
  if (!image) return Response.json({ error: "not_found" }, { status: 404 });
  const object = await getObject(image.organizationId, image.r2Key);
  if (!object) return Response.json({ error: "not_found" }, { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

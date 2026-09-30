/* EmbedHub copy-button beacon (WEB-269 item 7) — "the snippet left the
 * building". Cheap audit write; the checklist derives item 7 from it. */
import { markEmbedSnippetCopied } from "@/lib/repos/setup";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  await markEmbedSnippetCopied(ctx.organizationId, ctx.user.id);
  return Response.json({ ok: true });
}

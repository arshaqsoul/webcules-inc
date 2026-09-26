/* Portal login step 2 (WEB-131): verify the code → mint the portal-scoped
 * session cookie. Codes only ever exist for emails with client records, so
 * verification can't be used to enumerate portals. (No Turnstile here — the
 * send route is the bot-gated surface, same as gallery OTP.) */
import { z } from "zod";

import { getClientRows, linkClientUser } from "@/lib/portal";
import { mintPortalCookie, verifyPortalOtp } from "@/lib/portal-auth";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().trim().email().max(200),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
  const email = parsed.data.email.toLowerCase();

  const clientRows = await getClientRows(email);
  if (clientRows.length === 0) return Response.json({ ok: false }); // no portal → no code exists

  if (!(await verifyPortalOtp(email, parsed.data.code))) {
    return Response.json({ ok: false });
  }

  // First login links client rows to a better-auth user if one exists.
  const db = getDb();
  const user = (await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email)).limit(1))[0];
  if (user) await linkClientUser(email, user.id);

  return Response.json({ ok: true }, { headers: { "Set-Cookie": await mintPortalCookie(email) } });
}

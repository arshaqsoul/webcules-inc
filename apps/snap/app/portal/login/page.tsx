/* /portal/login (WEB-131) — already signed in goes straight to the portal. */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";

import { PortalLogin } from "@/components/portal-login";
import { resolvePortalSession } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client portal — sign in", robots: { index: false } };

export default async function PortalLoginPage() {
  if (await resolvePortalSession(await headers())) redirect("/portal");
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <PortalLogin turnstileSiteKey={env.TURNSTILE_SITE_KEY ?? ""} />
    </main>
  );
}

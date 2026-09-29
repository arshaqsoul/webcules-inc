import { redirect } from "next/navigation";

/* Legacy entry (WEB-235): /dashboard/settings and its Stripe/Connect return
 * links fan out to the section routes. Legacy param mapping:
 *   ?plan=return        → /billing?return=1   (checkout success return)
 *   ?plan=<other>       → /billing            (checkout cancel)
 *   ?payouts=return     → /payouts?return=1   (Connect onboarding return)
 *   ?payouts=refresh    → /payouts?refresh=1  (Connect refresh)
 *   ?payouts=<other>    → /payouts
 * Call sites that built these links (lib/billing.ts, lib/connect.ts) were
 * updated to the new paths in the same change; this redirect keeps every
 * already-sent email and bookmark working. */
export const metadata = { title: "Settings" };

export default async function SettingsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; payouts?: string }>;
}) {
  const { plan, payouts } = await searchParams;
  if (plan === "return") redirect("/dashboard/settings/billing?return=1");
  if (plan !== undefined) redirect("/dashboard/settings/billing");
  if (payouts === "return") redirect("/dashboard/settings/payouts?return=1");
  if (payouts === "refresh") redirect("/dashboard/settings/payouts?refresh=1");
  if (payouts !== undefined) redirect("/dashboard/settings/payouts");
  redirect("/dashboard/settings/general");
}

import { redirect } from "next/navigation";

import { getOrgContext } from "@/lib/session";

export const metadata = { title: "Settings · Domains" };

export default async function SettingsDomainsPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");

  return (
    <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <h2 className="text-[15px] font-medium text-ink">Custom domains</h2>
      <p className="mt-2 text-sm text-ink-subtle">
        Put your client galleries, booking page, and client portal on your own domain —
        gallery.yourstudio.com. Included with Pro.
      </p>
      <p className="mt-3 text-xs text-ink-tertiary">
        Domain setup is rolling out — you&apos;ll find it here as soon as it&apos;s live for your studio.
      </p>
    </section>
  );
}

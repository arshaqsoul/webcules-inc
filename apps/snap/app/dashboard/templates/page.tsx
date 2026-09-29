/* /dashboard/templates (WEB-248/251) — index of the designers shipped so
 * far; the 9/10 template-manager hub replaces this with the unified
 * library. */
import Link from "next/link";

import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = { title: { absolute: "Templates · Snap" } };

export default async function TemplatesIndex() {
  await getOrgContext();
  const links = [
    { href: "/dashboard/templates/contracts", label: "Contract templates", desc: "Your agreement library with clauses, merge fields and live signing-page preview." },
    { href: "/dashboard/templates/forms", label: "Forms", desc: "Contact-widget and questionnaire schemas — one builder, every surface." },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">Templates</h1>
        <p className="mt-0.5 text-sm text-ink-subtle">Everything reusable in one place — more designers land here as the epic ships.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-[12px] border border-hairline bg-surface-1 p-5 transition-colors hover:border-primary/50">
            <p className="text-sm font-medium text-ink">{l.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-subtle">{l.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

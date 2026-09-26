import Link from "next/link";
import { redirect } from "next/navigation";

import { LEAD_STATUSES, listLeads, type LeadStatus } from "@/lib/repos/leads";
import { getOrgContext } from "@/lib/session";

export const metadata = { title: "Leads" };

const STATUS_STYLES: Record<string, string> = {
  new: "bg-primary/10 text-primary",
  replied: "bg-surface-2 text-ink-muted",
  converted: "bg-success/10 text-success-text",
  archived: "bg-surface-2 text-ink-tertiary",
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const { status = "all", q } = await searchParams;

  const activeStatus = (LEAD_STATUSES as readonly string[]).includes(status)
    ? (status as LeadStatus)
    : "all";
  const leads = await listLeads({ organizationId: ctx.organizationId, status: activeStatus, search: q });

  const tabs = [{ key: "all", label: "All" }, ...LEAD_STATUSES.map((s) => ({ key: s, label: s[0].toUpperCase() + s.slice(1) }))];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">Leads</h1>
          <p className="mt-1 text-sm text-ink-subtle">Inquiries from your embedded contact form.</p>
        </div>
        <form action="/dashboard/leads" method="get" className="flex gap-2">
          <input type="hidden" name="status" value={activeStatus} />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name or email…"
            className="w-56 rounded-md border border-input bg-background px-3 py-2 text-sm text-ink placeholder:text-ink-tertiary"
          />
          <button type="submit" className="rounded-md border border-hairline bg-surface-1 px-3 py-2 text-sm font-medium text-ink hover:bg-surface-2">
            Search
          </button>
        </form>
      </div>

      <div className="flex gap-1.5">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/dashboard/leads?status=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              activeStatus === t.key
                ? "bg-surface-2 text-ink"
                : "text-ink-subtle hover:bg-surface-1 hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-[12px] border border-hairline bg-surface-1">
        {leads.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-subtle">
            No leads yet — embed your contact form (Settings → Embed widget) and they'll land here.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-tertiary">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Shoot</th>
                <th className="px-4 py-3 font-medium">Event date</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Received</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-hairline last:border-0 hover:bg-surface-2/60">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/leads/${lead.id}`} className="font-medium text-ink hover:text-primary">
                      {lead.name}
                    </Link>
                    <div className="text-xs text-ink-subtle">{lead.email}</div>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{lead.eventType ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {lead.eventDate ? lead.eventDate.toISOString().slice(0, 10) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[lead.status] ?? ""}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-subtle">{lead.createdAt.toISOString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

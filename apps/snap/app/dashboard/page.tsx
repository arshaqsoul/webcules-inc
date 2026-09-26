/* Dashboard overview — placeholder until leads/booking epics land. */
import { getOrgContext } from "@/lib/session";
import { getStudioProfile } from "@/lib/repos/studios";

export default async function DashboardPage() {
  const ctx = (await getOrgContext())!;
  const profile = await getStudioProfile(ctx.organizationId);

  const cards = [
    { label: "Leads", value: "—", hint: "Embeddable contact form arrives next" },
    { label: "Bookings", value: "—", hint: "Calendar widget epic in progress" },
    { label: "Projects", value: "—", hint: "Kanban pipeline epic in progress" },
    { label: "Galleries", value: "—", hint: "Secure sharing epic in progress" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">
          Welcome, {ctx.user.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-ink-subtle">
          {profile?.studioName} · timezone {profile?.timezone}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-[12px] border border-hairline bg-surface-1 p-5">
            <p className="text-xs text-ink-subtle">{c.label}</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{c.value}</p>
            <p className="mt-2 text-xs text-ink-tertiary">{c.hint}</p>
          </div>
        ))}
      </div>
      <div className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <p className="text-sm font-medium text-ink">Embed key</p>
        <p className="mt-1 text-xs text-ink-tertiary">
          Used by the widget loader once the embed platform ships (Epic 3).
        </p>
        <code className="mt-3 block rounded-md bg-canvas px-3 py-2 font-mono text-xs text-ink-muted">
          {profile?.embedKey}
        </code>
      </div>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";

import { listStudioGrants } from "@/lib/shares/grants";
import { getOrgContext } from "@/lib/session";

export const metadata = { title: "Galleries" };

const STATE_TONE: Record<string, string> = {
  active: "bg-primary/10 text-primary",
  expiring_soon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  expired: "bg-surface-2 text-ink-tertiary",
  revoked: "bg-destructive/10 text-destructive",
  regenerated: "bg-surface-2 text-ink-tertiary",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function GalleriesPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const grants = await listStudioGrants(ctx.organizationId);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">Galleries</h1>
        <p className="mt-1 text-sm text-ink-subtle">
          Every client gallery link across your projects — manage them from each project's page.
        </p>
      </div>

      <section className="overflow-hidden rounded-[12px] border border-hairline bg-surface-1">
        {grants.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-subtle">
            No galleries shared yet — open a project and share its approved files.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-tertiary">
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {grants.map((g) => (
                <tr key={g.id}>
                  <td className="max-w-56 truncate px-4 py-3">
                    <Link href={`/dashboard/projects/${g.projectId}`} className="text-ink hover:underline">
                      {g.projectTitle}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{g.clientEmail}</td>
                  <td className="px-4 py-3 text-ink-muted">{fmtDate(g.createdAt)}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {g.expiresAt ? fmtDate(g.expiresAt) : "No expiry"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_TONE[g.state] ?? ""}`}>
                      {g.state.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

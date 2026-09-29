/* WEB-265: the Activity panel — server-rendered from the same tables the
 * budget counters write (one source of truth). Counts views and actions
 * per client email; zero trackers, no time-on-photo theater. */

import { NudgeButton } from "@/components/nudge-button";
import type { GalleryAnalytics } from "@/lib/repos/gallery-analytics";

function fmt(when: string | null): string {
  if (!when) return "never";
  const d = new Date(when);
  const days = Math.floor((Date.now() - d.getTime()) / 86400_000);
  const time = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
  return days === 0 ? `today ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d)}` : `${time}`;
}

const EVENT_LABEL: Record<string, string> = {
  view: "opened the gallery",
  otp_success: "verified their email",
  download: "downloaded a photo",
  zip_download: "downloaded the ZIP",
  share_view: "viewed via a shared link",
  share_create: "shared a photo",
};

export function GalleryActivity({ analytics, grants, canNudge, canView = true }: {
  analytics: GalleryAnalytics;
  grants: { id: string; clientEmail: string; state: string }[];
  canNudge: boolean;
  /** WEB-267: views-basics is Lite+ (per-photo heat is Studio, gated at its API). */
  canView?: boolean;
}) {
  if (!canView) {
    return (
      <div className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <h3 className="text-[15px] font-medium text-ink">Activity</h3>
        <p className="mt-1 text-sm text-ink-subtle">See who viewed your gallery, what they favorited, and which photos they lingered on.</p>
        <a href="/dashboard/billing" className="mt-2 inline-block text-sm font-medium text-primary underline underline-offset-2">
          Upgrade to Lite — $15/mo
        </a>
      </div>
    );
  }
  const t = analytics.totals;
  if (!analytics.clients.length) return null;

  return (
    <div className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-medium text-ink">Activity</h3>
        <p className="text-xs text-ink-tertiary">
          {t.views} view{t.views === 1 ? "" : "s"} · {t.uniqueClients} client{t.uniqueClients === 1 ? "" : "s"}
          {t.shareViews > 0 ? ` · your photos were seen ${t.shareViews} time${t.shareViews === 1 ? "" : "s"} beyond your client` : ""}
          {t.downloads > 0 ? ` · ${t.downloads} download${t.downloads === 1 ? "" : "s"}` : ""}
        </p>
      </div>

      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-ink-tertiary">
            <th className="py-1 pr-3 font-medium">Client</th>
            <th className="py-1 pr-3 font-medium">Views</th>
            <th className="py-1 pr-3 font-medium">Favorites</th>
            <th className="py-1 pr-3 font-medium">Downloads</th>
            <th className="py-1 pr-3 font-medium">Selection</th>
            <th className="py-1 pr-3 font-medium">Last seen</th>
            {canNudge ? <th className="py-1 font-medium" /> : null}
          </tr>
        </thead>
        <tbody>
          {analytics.clients.map((c) => {
            const grant = grants.find((g) => g.clientEmail === c.clientEmail && g.state === "active") ?? grants.find((g) => g.clientEmail === c.clientEmail);
            return (
              <tr key={c.clientEmail} className="border-t border-hairline">
                <td className="py-1.5 pr-3 text-ink">{c.clientEmail}</td>
                <td className="py-1.5 pr-3 text-ink-subtle">{c.views}</td>
                <td className="py-1.5 pr-3 text-ink-subtle">{c.favorites}</td>
                <td className="py-1.5 pr-3 text-ink-subtle">{c.downloads + c.zipDownloads}</td>
                <td className="py-1.5 pr-3 text-ink-subtle">
                  {c.selection ? (
                    c.selection.seen ? (
                      `${c.selection.count} picked · seen ✓`
                    ) : (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{c.selection.count} picked</span>
                    )
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-1.5 pr-3 text-ink-subtle">{fmt(c.lastViewedAt)}</td>
                {canNudge ? (
                  <td className="py-1.5">{grant ? <NudgeButton grantId={grant.id} clientEmail={c.clientEmail} /> : null}</td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>

      {analytics.events.length > 0 && (
        <div className="mt-4 border-t border-hairline pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Recent</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {analytics.events.slice(0, 8).map((e) => (
              <li key={e.id} className="text-xs text-ink-subtle">
                <span className="text-ink-tertiary">{fmt(e.createdAt)}</span> · {e.clientEmail} {EVENT_LABEL[e.event] ?? e.event}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

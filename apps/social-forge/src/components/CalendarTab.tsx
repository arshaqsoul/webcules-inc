import { useMemo, useState } from "react";
import { api, patch, post as apiPost, PlatformChip, Section, StatusChip, fmtWhen } from "./lib.tsx";
import type { WorkspaceData } from "./Workspace.tsx";

/** Content-calendar dashboard: every post per platform, schedule, approve/edit gates. */
export default function CalendarTab({ slug, data, refresh }: { slug: string; data: WorkspaceData; refresh: () => void }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [busy, setBusy] = useState(false);

  const base = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  const grid = useMemo(() => {
    const first = new Date(base);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [base]);

  const byDay = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const p of data.posts) {
      if (!p.scheduledFor) continue;
      const k = new Date(p.scheduledFor).toDateString();
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return map;
  }, [data.posts]);

  const unscheduled = data.posts.filter((p) => !p.scheduledFor && p.status === "approved");
  const scheduled = data.posts.filter((p) => p.scheduledFor).sort((a, b) => (a.scheduledFor < b.scheduledFor ? -1 : 1));
  const needsReview = data.posts.filter((p) => p.status === "draft" || p.status === "changes_requested");

  const act = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      await fn();
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const monthLabel = base.toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="grid gap-5">
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-4"><div className="text-xs text-zinc-500 uppercase tracking-wide font-bold">Needs review</div><div className="text-2xl font-black mt-1">{needsReview.length}</div><div className="text-xs text-zinc-600 mt-1">drafts + change requests</div></div>
        <div className="card p-4"><div className="text-xs text-zinc-500 uppercase tracking-wide font-bold">Approved, unscheduled</div><div className="text-2xl font-black mt-1">{unscheduled.length}</div><div className="text-xs text-zinc-600 mt-1">ready for a slot</div></div>
        <div className="card p-4"><div className="text-xs text-zinc-500 uppercase tracking-wide font-bold">On the calendar</div><div className="text-2xl font-black mt-1">{scheduled.length}</div><div className="text-xs text-zinc-600 mt-1">scheduled slots</div></div>
      </div>

      <Section
        title="Posting calendar"
        right={
          <div className="flex items-center gap-2">
            <button className="btn" onClick={() => setMonthOffset((m) => m - 1)}>←</button>
            <span className="text-sm font-bold min-w-36 text-center">{monthLabel}</span>
            <button className="btn" onClick={() => setMonthOffset((m) => m + 1)}>→</button>
            <button className="btn btn-primary" disabled={busy || unscheduled.length === 0} onClick={() => act(() => apiPost(`/api/export`, { slug, action: "auto-schedule" }))}>
              🗓 Auto-schedule approved ({unscheduled.length})
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold text-zinc-500 mb-1.5">
          {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {grid.map((d) => {
            const inMonth = d.getMonth() === base.getMonth();
            const items = byDay.get(d.toDateString()) ?? [];
            const today = d.toDateString() === new Date().toDateString();
            return (
              <div key={d.toISOString()} className={`min-h-24 rounded-lg border p-1.5 ${inMonth ? "bg-[#0e0e18] border-[#23233a]" : "bg-transparent border-transparent"} ${today ? "ring-1 ring-[#6C5CE7]" : ""}`}>
                <div className={`text-xs mb-1 ${inMonth ? "text-zinc-400" : "text-zinc-700"}`}>{d.getDate()}</div>
                <div className="flex flex-col gap-1">
                  {items.map((p) => (
                    <div key={p.id} title={p.hook} className={`text-[10px] px-1.5 py-0.5 rounded truncate font-semibold ${statusBg(p.status)}`}>
                      {p.platform.slice(0, 2)} {new Date(p.scheduledFor).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Upcoming queue">
        {scheduled.length === 0 ? (
          <div className="text-sm text-zinc-500 border border-dashed border-zinc-800 rounded-xl p-6 text-center">
            nothing scheduled — approve posts (Posts tab) then auto-schedule or drag-slot via the ⏰ button
          </div>
        ) : (
          <div className="grid gap-2">
            {scheduled.map((p) => (
              <div key={p.id} className="card p-3 flex items-center gap-3 flex-wrap">
                <span className="text-xs text-sky-300 font-bold min-w-36">🕒 {fmtWhen(p.scheduledFor)}</span>
                <PlatformChip platform={p.platform} />
                <span className="text-sm flex-1 min-w-40 truncate">{p.hook}</span>
                <StatusChip status={p.status} />
                <input
                  type="datetime-local"
                  className="input !w-52"
                  defaultValue={new Date(p.scheduledFor).toLocaleString("sv").slice(0, 16)}
                  onChange={(e) => e.target.value && act(() => apiPost(`/api/export`, { slug, action: "set-schedule", id: p.id, when: new Date(e.target.value).toISOString() }))}
                />
              </div>
            ))}
          </div>
        )}
      </Section>

      {needsReview.length > 0 && (
        <Section title="Review queue — approve or request edits">
          <div className="grid gap-2">
            {needsReview.map((p) => (
              <div key={p.id} className="card p-3 flex items-center gap-3 flex-wrap">
                <PlatformChip platform={p.platform} />
                <span className="text-sm flex-1 min-w-40 truncate">{p.hook}</span>
                <StatusChip status={p.status} />
                <div className="flex gap-2">
                  <button className="btn" onClick={() => act(() => patch(`/api/posts`, { slug, id: p.id, action: "status", status: "approved" }))}>✅ approve</button>
                  <button className="btn" onClick={() => act(() => patch(`/api/posts`, { slug, id: p.id, action: "status", status: "changes_requested", note: "see notes" }))}>✏️ request edits</button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function statusBg(status: string) {
  return {
    draft: "bg-zinc-700/70 text-zinc-200",
    in_review: "bg-amber-500/25 text-amber-200",
    changes_requested: "bg-rose-500/25 text-rose-200",
    approved: "bg-emerald-500/25 text-emerald-200",
    scheduled: "bg-sky-500/25 text-sky-200",
    exported: "bg-violet-500/25 text-violet-200",
  }[status] ?? "bg-zinc-700/70";
}

import type { ReactNode } from "react";

// ---------- api client ----------

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j as T;
}

export const post = <T = any,>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
export const patch = <T = any,>(path: string, body?: unknown) => api<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) });
export const del = <T = any,>(path: string) => api<T>(path, { method: "DELETE" });

export const fileUrl = (slug: string, rel: string) => `/api/projects/${slug}/file?p=${encodeURIComponent(rel)}`;

// ---------- shared atoms ----------

export const PLATFORM_LABEL: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", whatsapp: "WhatsApp" };
export const PLATFORM_ICON: Record<string, string> = { facebook: "📘", instagram: "📸", tiktok: "🎵", linkedin: "💼", whatsapp: "💬", visual: "🎨" };

export const STATUS_STYLE: Record<string, string> = {
  draft: "bg-zinc-700/60 text-zinc-200",
  in_review: "bg-amber-500/20 text-amber-300",
  changes_requested: "bg-rose-500/20 text-rose-300",
  approved: "bg-emerald-500/20 text-emerald-300",
  scheduled: "bg-sky-500/20 text-sky-300",
  exported: "bg-violet-500/20 text-violet-300",
};

export function StatusChip({ status }: { status: string }) {
  return <span className={`chip ${STATUS_STYLE[status] ?? STATUS_STYLE.draft}`}>{status.replace(/_/g, " ")}</span>;
}

export function PlatformChip({ platform }: { platform: string }) {
  return (
    <span className="chip bg-zinc-800 text-zinc-300">
      {PLATFORM_ICON[platform]} {PLATFORM_LABEL[platform] ?? platform}
    </span>
  );
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold tracking-wide text-zinc-300 uppercase">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="text-sm text-zinc-500 border border-dashed border-zinc-800 rounded-xl p-6 text-center">{children}</div>;
}

export function fmtBytes(n?: number) {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function fmtWhen(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

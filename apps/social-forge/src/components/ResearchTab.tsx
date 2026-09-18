import { useEffect, useState } from "react";
import { api, del, post as apiPost, PLATFORM_ICON, Section } from "./lib.tsx";

const KEYS = ["facebook", "instagram", "tiktok", "linkedin", "whatsapp", "visual"] as const;
type Key = (typeof KEYS)[number];

/**
 * Phase 1 — research workspace: source links per platform + the swipe file itself.
 * Browse the ad libraries in the browser, capture what wins, add it here; everything
 * is committed to the project repo and reused across future campaigns.
 */
export default function ResearchTab({ slug, refresh }: { slug: string; refresh: () => void }) {
  const [sources, setSources] = useState<any[]>([]);
  const [swipe, setSwipe] = useState<Record<string, any[]>>({});
  const [key, setKey] = useState<Key>("facebook");
  const [form, setForm] = useState({ title: "", url: "", kind: "ad", hook: "", format: "", why: "", tags: "" });
  const [busy, setBusy] = useState(false);

  const load = () => {
    api<{ sources: any[] }>("/api/sources").then((r) => setSources(r.sources));
    api<{ swipe: Record<string, any[]> }>(`/api/projects/${slug}/swipe`).then((r) => setSwipe(r.swipe));
  };
  useEffect(load, [slug]);

  const add = async () => {
    if (!form.title && !form.url) return;
    setBusy(true);
    try {
      await apiPost(`/api/projects/${slug}/swipe`, {
        key,
        ...form,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setForm({ title: "", url: "", kind: "ad", hook: "", format: "", why: "", tags: "" });
      load();
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await del(`/api/projects/${slug}/swipe?id=${id}`);
    load();
    refresh();
  };

  const entries = swipe[key] ?? [];

  return (
    <div className="grid gap-5">
      <Section title="Where to research (opens externally)">
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {sources
            .filter((s) => s.key !== "workflow")
            .map((s) => (
              <a key={s.url + s.label} href={s.url} target="_blank" className="card p-4 hover:border-[#6C5CE7] transition-colors block">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <span>{PLATFORM_ICON[s.key] ?? "🔗"}</span>
                  <span className="truncate">{s.label}</span>
                </div>
                <div className="text-xs text-zinc-400 mt-2 leading-relaxed">{s.what}</div>
                {s.note && <div className="text-[11px] text-amber-400/80 mt-1.5">⚠ {s.note}</div>}
              </a>
            ))}
        </div>
      </Section>

      <Section
        title="Swipe file — what actually performs"
        right={
          <div className="flex gap-1">
            {KEYS.map((k) => (
              <button key={k} onClick={() => setKey(k)} className={`chip cursor-pointer ${(swipe[k]?.length ?? 0) > 0 ? "bg-[#6C5CE7]/20 text-[#b4a9ff]" : "bg-zinc-800 text-zinc-500"} ${key === k ? "outline outline-1 outline-[#6C5CE7]" : ""}`}>
                {PLATFORM_ICON[k]} {k} {swipe[k]?.length ?? 0}
              </button>
            ))}
          </div>
        }
      >
        <div className="grid gap-3 mb-5 p-4 rounded-xl bg-[#0e0e18] border border-[#23233a]">
          <div className="text-xs text-zinc-500">capture a reference into <code>swipe/{key}.json</code> — title auto-fills from the URL when possible</div>
          <div className="grid md:grid-cols-2 gap-3">
            <input className="input" placeholder="URL (ad library link, TikTok top ad, case study…)" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            <input className="input" placeholder="Title (auto if empty)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <input className="input" placeholder="The hook, if you captured one (what the ad actually says)" value={form.hook} onChange={(e) => setForm({ ...form, hook: e.target.value })} />
            <input className="input" placeholder="Format (e.g. 6-page PDF carousel, 9:16 UGC)" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} />
            <input className="input" placeholder="Kind: ad | post | carousel | reel | case-study | layout | sound" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} />
            <input className="input" placeholder="Tags, comma separated (offer, retargeting, founder-story…)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          </div>
          <textarea className="input min-h-16" placeholder="Why it works / what to steal" value={form.why} onChange={(e) => setForm({ ...form, why: e.target.value })} />
          <div>
            <button className="btn btn-primary" onClick={add} disabled={busy}>{busy ? "Saving…" : `+ Add to ${key} swipe file`}</button>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="text-sm text-zinc-500 border border-dashed border-zinc-800 rounded-xl p-6 text-center">
            No {key} references yet — research first, generate second. Future campaigns start from this file.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {entries.map((e) => (
              <div key={e.id} className="card p-4 flex gap-3">
                {e.thumb ? <img src={`/api/projects/${slug}/file?p=${encodeURIComponent(e.thumb)}`} className="w-24 h-24 rounded-lg object-cover border border-[#23233a] shrink-0" /> : <div className="w-24 h-24 rounded-lg bg-[#181826] border border-[#23233a] shrink-0 flex items-center justify-center text-2xl">{PLATFORM_ICON[key]}</div>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold text-sm truncate">{e.title}</div>
                    <button onClick={() => remove(e.id)} className="text-zinc-600 hover:text-rose-400 text-xs">✕</button>
                  </div>
                  {e.url && <a href={e.url} target="_blank" className="text-[11px] text-sky-400 hover:underline truncate block">{e.url}</a>}
                  {e.hook && <div className="text-xs text-[#b4a9ff] italic mt-1.5">“{e.hook}”</div>}
                  {e.format && <div className="text-[11px] text-zinc-500 mt-1">{e.format}</div>}
                  {e.why && <div className="text-xs text-zinc-400 mt-1.5 leading-relaxed">{e.why}</div>}
                  {e.tags?.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{e.tags.map((t: string) => <span key={t} className="chip bg-zinc-800 text-zinc-500">#{t}</span>)}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { api, patch, PlatformChip, Section, StatusChip, fileUrl, fmtBytes, fmtWhen } from "./lib.tsx";
import ResearchTab from "./ResearchTab.tsx";
import GenerateTab from "./GenerateTab.tsx";
import PostsTab from "./PostsTab.tsx";
import CalendarTab from "./CalendarTab.tsx";
import ExportTab from "./ExportTab.tsx";

export type WorkspaceData = {
  project: any;
  posts: any[];
  swipe: Record<string, number>;
  runs: any[];
  tree: any[];
};

const TABS = ["Brief", "Research", "Generate", "Assets", "Posts", "Calendar", "Export"] as const;
type Tab = (typeof TABS)[number];

export default function Workspace({ slug }: { slug: string }) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [tab, setTab] = useState<Tab>("Brief");
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    api<WorkspaceData>(`/api/projects/${slug}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [slug]);
  useEffect(refresh, [refresh]);

  if (error) return <div className="max-w-6xl mx-auto px-6 py-16 text-rose-400">{error}</div>;
  if (!data) return <div className="max-w-6xl mx-auto px-6 py-16 text-zinc-500">loading…</div>;

  const p = data.project;
  const counts = {
    posts: data.posts.length,
    approved: data.posts.filter((x) => ["approved", "scheduled", "exported"].includes(x.status)).length,
    swipe: Object.values(data.swipe).reduce((a, b) => a + b, 0),
    assets: countFiles(data.tree),
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <header className="flex flex-wrap items-center gap-4 mb-6">
        <a href="/" className="btn">←</a>
        <div className="flex-1 min-w-[240px]">
          <h1 className="text-xl font-black tracking-tight">{p.name}</h1>
          <div className="text-xs text-zinc-500 mt-0.5">
            webcules/projects/{p.slug} · {p.platforms.map((x: string) => x).join(" · ")} · updated {fmtWhen(p.updatedAt)}
          </div>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="chip bg-zinc-800 text-zinc-300">{counts.posts} posts</span>
          <span className="chip bg-emerald-500/15 text-emerald-300">{counts.approved} approved+</span>
          <span className="chip bg-amber-500/15 text-amber-300">{counts.swipe} swipe refs</span>
          <span className="chip bg-sky-500/15 text-sky-300">{counts.assets} files</span>
        </div>
      </header>

      <nav className="flex gap-1 mb-6 border-b border-[#23233a] flex-wrap">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 -mb-px transition-colors ${
              tab === t ? "text-white border-[#6C5CE7] bg-[#6C5CE7]/10" : "text-zinc-500 border-transparent hover:text-zinc-300"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "Brief" && <BriefTab data={data} refresh={refresh} />}
      {tab === "Research" && <ResearchTab slug={slug} refresh={refresh} />}
      {tab === "Generate" && <GenerateTab slug={slug} data={data} refresh={refresh} />}
      {tab === "Assets" && <AssetsTab slug={slug} tree={data.tree} />}
      {tab === "Posts" && <PostsTab slug={slug} data={data} refresh={refresh} />}
      {tab === "Calendar" && <CalendarTab slug={slug} data={data} refresh={refresh} />}
      {tab === "Export" && <ExportTab slug={slug} data={data} refresh={refresh} />}
    </div>
  );
}

function countFiles(nodes: any[]): number {
  return nodes.reduce((n, x) => n + (x.type === "file" ? 1 : countFiles(x.children ?? [])), 0);
}

// ---------------------------------------------------------------- Brief

function BriefTab({ data, refresh }: { data: WorkspaceData; refresh: () => void }) {
  const p = data.project;
  const [form, setForm] = useState(() => ({
    name: p.name,
    brief: p.brief,
    tone: p.tone,
    product: p.offer.product,
    promise: p.offer.promise,
    audience: p.offer.audience,
    pains: p.offer.pains.join("\n"),
    proofs: p.offer.proofs.join("\n"),
    promo: p.offer.promo ?? "",
    ctaLabel: p.offer.ctaLabel,
    ctaUrl: p.offer.ctaUrl ?? "",
    whatsapp: p.offer.whatsapp ?? "",
    accent: p.brand.accent,
    accent2: p.brand.accent2,
    fontDisplay: p.brand.fontDisplay,
  }));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await patch(`/api/projects/${p.slug}`, {
        name: form.name,
        brief: form.brief,
        tone: form.tone,
        brand: { ...p.brand, accent: form.accent, accent2: form.accent2, fontDisplay: form.fontDisplay },
        offer: {
          ...p.offer,
          product: form.product,
          promise: form.promise,
          audience: form.audience,
          pains: form.pains.split("\n").map((s: string) => s.trim()).filter(Boolean),
          proofs: form.proofs.split("\n").map((s: string) => s.trim()).filter(Boolean),
          promo: form.promo || undefined,
          ctaLabel: form.ctaLabel,
          ctaUrl: form.ctaUrl || undefined,
          whatsapp: form.whatsapp || undefined,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Section title="Brief & positioning">
        <div className="grid gap-3">
          <textarea className="input min-h-40" value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase">Tone</span>
              <input className="input" value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} /></label>
            <label className="block"><span className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase">CTA label</span>
              <input className="input" value={form.ctaLabel} onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })} /></label>
          </div>
        </div>
      </Section>

      <Section title="Offer — what every post sells">
        <div className="grid gap-3">
          <label className="block"><span className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase">Product</span>
            <input className="input" value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} /></label>
          <label className="block"><span className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase">Promise</span>
            <textarea className="input min-h-16" value={form.promise} onChange={(e) => setForm({ ...form, promise: e.target.value })} /></label>
          <label className="block"><span className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase">Audience</span>
            <input className="input" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase">Pains (one per line)</span>
              <textarea className="input min-h-24" value={form.pains} onChange={(e) => setForm({ ...form, pains: e.target.value })} /></label>
            <label className="block"><span className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase">Proofs (one per line)</span>
              <textarea className="input min-h-24" value={form.proofs} onChange={(e) => setForm({ ...form, proofs: e.target.value })} /></label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><span className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase">Promo (optional)</span>
              <input className="input" value={form.promo} onChange={(e) => setForm({ ...form, promo: e.target.value })} /></label>
            <label className="block"><span className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase">CTA URL</span>
              <input className="input" value={form.ctaUrl} onChange={(e) => setForm({ ...form, ctaUrl: e.target.value })} /></label>
            <label className="block"><span className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase">WhatsApp number</span>
              <input className="input" placeholder="919999999999" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></label>
          </div>
        </div>
      </Section>

      <Section title="Brand (used by the creative renderer)">
        <div className="grid grid-cols-4 gap-3">
          <label className="block"><span className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase">Accent</span>
            <input type="color" className="input h-10 p-1" value={form.accent} onChange={(e) => setForm({ ...form, accent: e.target.value })} /></label>
          <label className="block"><span className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase">Accent 2</span>
            <input type="color" className="input h-10 p-1" value={form.accent2} onChange={(e) => setForm({ ...form, accent2: e.target.value })} /></label>
          <label className="block col-span-2"><span className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase">Display font (canvas)</span>
            <input className="input" value={form.fontDisplay} onChange={(e) => setForm({ ...form, fontDisplay: e.target.value })} /></label>
        </div>
      </Section>

      <Section title="Save">
        <div className="flex items-center gap-3">
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save brief"}</button>
          {saved && <span className="text-emerald-400 text-sm">saved & committed to project repo</span>}
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- Assets (file browser)

function AssetsTab({ slug, tree }: { slug: string; tree: any[] }) {
  const [selected, setSelected] = useState<any | null>(null);

  const renderNode = (n: any, depth = 0) =>
    n.type === "dir" ? (
      <details key={n.path} open={depth < 1}>
        <summary className="cursor-pointer py-1 text-sm text-zinc-300 hover:text-white select-none">📂 {n.name}</summary>
        <div className="pl-4 border-l border-[#23233a] ml-1.5">{(n.children ?? []).map((c: any) => renderNode(c, depth + 1))}</div>
      </details>
    ) : (
      <button
        key={n.path}
        onClick={() => setSelected(n)}
        className={`block w-full text-left py-1 px-2 rounded text-sm hover:bg-zinc-800/70 ${selected?.path === n.path ? "bg-zinc-800 text-white" : "text-zinc-400"}`}
      >
        📄 {n.name} <span className="text-zinc-600 text-xs">{fmtBytes(n.size)}</span>
      </button>
    );

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-5">
      <Section title="Project file system">
        <div className="max-h-[70vh] overflow-auto pr-1">{tree.length ? tree.map(renderNode) : <div className="text-sm text-zinc-500">empty</div>}</div>
      </Section>
      <Section title={selected ? selected.name : "Preview"}>
        {!selected ? (
          <div className="text-sm text-zinc-500">select a file to preview — every asset, workflow run, post pack and export lives in this tree</div>
        ) : /\.(png|jpe?g|webp|gif)$/i.test(selected.name) ? (
          <img src={fileUrl(slug, selected.path)} className="max-h-[70vh] mx-auto rounded-lg" />
        ) : /\.(mp4|webm|mov)$/i.test(selected.name) ? (
          <video src={fileUrl(slug, selected.path)} controls className="max-h-[70vh] mx-auto rounded-lg" />
        ) : /\.pdf$/i.test(selected.name) ? (
          <iframe src={fileUrl(slug, selected.path)} className="w-full h-[70vh] rounded-lg bg-white" />
        ) : (
          <pre className="text-xs text-zinc-400 overflow-auto max-h-[70vh] whitespace-pre-wrap">
            <TextFile slug={slug} path={selected.path} />
          </pre>
        )}
        <div className="mt-3 flex items-center gap-3">
          <a className="btn" href={fileUrl(slug, selected.path)} download>Download</a>
          <span className="text-xs text-zinc-600">{selected.path}</span>
        </div>
      </Section>
    </div>
  );
}

function TextFile({ slug, path }: { slug: string; path: string }) {
  const [txt, setTxt] = useState("loading…");
  useEffect(() => {
    fetch(fileUrl(slug, path))
      .then((r) => r.text())
      .then(setTxt)
      .catch(() => setTxt("(binary or unreadable)"));
  }, [slug, path]);
  return <>{txt}</>;
}

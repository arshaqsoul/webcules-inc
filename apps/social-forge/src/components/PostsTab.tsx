import { useMemo, useState } from "react";
import { api, patch, post as apiPost, del, PLATFORM_LABEL, PlatformChip, Section, StatusChip, fileUrl, fmtWhen } from "./lib.tsx";
import type { WorkspaceData } from "./Workspace.tsx";

/**
 * Phase 3 — post packs: copywriting + assembled creatives per platform, with the
 * review gate (approve / request changes) before anything is scheduled or exported.
 */
export default function PostsTab({ slug, data, refresh }: { slug: string; data: WorkspaceData; refresh: () => void }) {
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const posts = useMemo(
    () => data.posts.filter((p) => platformFilter === "all" || p.platform === platformFilter),
    [data.posts, platformFilter],
  );
  const selected = data.posts.find((p) => p.id === selectedId) ?? null;

  const act = async (label: string, fn: () => Promise<any>) => {
    setBusy(label);
    setError("");
    try {
      await fn();
      refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const generate = (platform?: string) =>
    act("generate", () => apiPost(`/api/posts`, { slug, platform, format: undefined }));

  return (
    <div className="grid xl:grid-cols-[420px_1fr] gap-5">
      <div className="grid gap-5 self-start">
        <Section
          title="Post packs"
          right={
            <div className="flex gap-1.5">
              <button className="btn" onClick={() => generate()} disabled={busy !== ""}>⚡ Full pack (all platforms)</button>
            </div>
          }
        >
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {["all", ...data.project.platforms].map((pf) => (
              <button key={pf} onClick={() => setPlatformFilter(pf)} className={`chip cursor-pointer ${platformFilter === pf ? "bg-[#6C5CE7] text-white" : "bg-zinc-800 text-zinc-400"}`}>
                {pf === "all" ? `all (${data.posts.length})` : `${pf} (${data.posts.filter((p) => p.platform === pf).length})`}
              </button>
            ))}
            {data.project.platforms.map((pf: string) => (
              <button key={`+${pf}`} className="chip bg-emerald-500/15 text-emerald-300 cursor-pointer" onClick={() => generate(pf)} disabled={busy !== ""} title={`generate a new ${pf} post`}>
                + {pf}
              </button>
            ))}
          </div>
          {posts.length === 0 ? (
            <div className="text-sm text-zinc-500 border border-dashed border-zinc-800 rounded-xl p-6 text-center">
              no posts yet — hit “Full pack” to generate platform drafts from the brief
            </div>
          ) : (
            <div className="grid gap-2 max-h-[62vh] overflow-auto pr-1">
              {posts.map((p) => (
                <button key={p.id} onClick={() => setSelectedId(p.id)} className={`card p-3.5 text-left hover:border-[#6C5CE7] transition-colors ${selectedId === p.id ? "border-[#6C5CE7]" : ""}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <PlatformChip platform={p.platform} />
                    <span className="chip bg-zinc-800 text-zinc-400">{p.format}</span>
                    <StatusChip status={p.status} />
                    {p.scheduledFor && <span className="text-[11px] text-sky-300 ml-auto">🕒 {fmtWhen(p.scheduledFor)}</span>}
                  </div>
                  <div className="text-sm font-semibold mt-2 line-clamp-2">{p.hook}</div>
                  {p.assets.length > 0 && <div className="text-[11px] text-zinc-600 mt-1">{p.assets.length} rendered file{p.assets.length === 1 ? "" : "s"}</div>}
                </button>
              ))}
            </div>
          )}
        </Section>
      </div>

      {selected ? (
        <PostEditor key={selected.id} slug={slug} post={selected} data={data} refresh={refresh} onDelete={() => setSelectedId(null)} busy={busy} setBusy={setBusy} error={error} setError={setError} />
      ) : (
        <Section title="Post editor">
          <div className="text-sm text-zinc-500 border border-dashed border-zinc-800 rounded-xl p-10 text-center">
            select a post to preview it per-platform, edit copy, render creatives and send it through review
          </div>
        </Section>
      )}
    </div>
  );
}

function PostEditor({ slug, post, data, refresh, onDelete, busy, setBusy, error, setError }: any) {
  const [hook, setHook] = useState(post.hook);
  const [copy, setCopy] = useState(JSON.stringify(post.copy, null, 2));
  const [note, setNote] = useState("");
  const [alts, setAlts] = useState<string[]>([]);
  const [bg, setBg] = useState("");
  const dirty = hook !== post.hook || copy !== JSON.stringify(post.copy, null, 2);

  const assetImages = useMemo(() => {
    const out: string[] = [];
    const walk = (nodes: any[]) => {
      for (const n of nodes) {
        if (n.type === "dir") walk(n.children ?? []);
        else if (/^assets\/(images|videos)\//.test(n.path)) out.push(n.path);
      }
    };
    walk(data.tree);
    return out.reverse();
  }, [data.tree]);

  const act = async (label: string, fn: () => Promise<any>) => {
    setBusy(label);
    setError("");
    try {
      const r = await fn();
      if (label === "save" || label === "regen") {
        setCopy(JSON.stringify(r.post.copy, null, 2));
        setHook(r.post.hook);
      }
      refresh();
      return r;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const previewImg = post.assets.find((a: any) => /\.(png|jpe?g|webp)$/i.test(a.path));
  const previewPdf = post.assets.find((a: any) => /\.pdf$/i.test(a.path));

  return (
    <div className="grid gap-5 self-start">
      <Section
        title={`${post.id} · ${post.format}`}
        right={<div className="flex gap-2 items-center"><StatusChip status={post.status} />{post.meta?.regen ? <span className="text-[11px] text-zinc-600">v{post.meta.regen + 1}</span> : null}</div>}
      >
        <div className="grid gap-3">
          <div>
            <span className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase">Hook (the line that stops the scroll)</span>
            <textarea className="input min-h-16 font-semibold" value={hook} onChange={(e) => setHook(e.target.value)} />
          </div>
          {alts.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {alts.map((h, i) => (
                <button key={i} className="text-left text-xs text-[#b4a9ff] bg-[#6C5CE7]/10 border border-[#6C5CE7]/30 rounded-lg px-3 py-2 hover:bg-[#6C5CE7]/20" onClick={() => setHook(h)}>
                  use: “{h}”
                </button>
              ))}
            </div>
          )}
          <div>
            <span className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase">Copy pack (JSON — caption, script, slides, hashtags…)</span>
            <textarea className="input min-h-64 font-mono text-xs" spellCheck={false} value={copy} onChange={(e) => setCopy(e.target.value)} />
          </div>
          {error && <div className="text-rose-400 text-sm whitespace-pre-wrap">{error}</div>}

          <div className="flex flex-wrap gap-2">
            {alts.length > 0 && (
              <button className="btn" disabled={busy !== ""} onClick={() => setAlts([])}>hide alts</button>
            )}
            <button
              className="btn"
              disabled={busy !== ""}
              onClick={async () => {
                const r = await act("alts", () => apiPost(`/api/posts`, { slug, action: "alt-hooks", platform: post.platform, regen: post.meta?.regen ?? 0 }));
                if (r) setAlts(r.hooks);
              }}
            >
              ✨ alt hooks
            </button>
            <button className="btn" disabled={busy !== "" || !dirty} onClick={() => act("save", () => patch(`/api/posts`, { slug, id: post.id, patch: { hook, copy: safeJson(copy) } }))}>
              {busy === "save" ? "saving…" : "💾 Save edits"}
            </button>
            <button className="btn" disabled={busy !== ""} onClick={() => act("regen", () => patch(`/api/posts`, { slug, id: post.id, action: "regen" }))}>
              🔄 Regenerate copy
            </button>
            <button className="btn" disabled={busy !== ""} onClick={() => act("delete", () => del(`/api/posts?slug=${slug}&id=${post.id}`)).then(onDelete)}>
              🗑 Delete
            </button>
          </div>

          <div className="border-t border-[#23233a] pt-3 grid gap-3">
            <div>
              <span className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase">Background asset for rendering</span>
              <select className="input" value={bg} onChange={(e) => setBg(e.target.value)}>
                <option value="">newest generated image (default)</option>
                {assetImages.map((p: string) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" disabled={busy !== ""} onClick={() => act("render", () => apiPost(`/api/posts/render`, { slug, id: post.id, bg: bg || undefined }))}>
                {busy === "render" ? "rendering…" : "🎨 Render platform creatives"}
              </button>
              <button className="btn" disabled={busy !== "" || post.status === "approved" || post.status === "scheduled" || post.status === "exported"} onClick={() => act("approve", () => patch(`/api/posts`, { slug, id: post.id, action: "status", status: "approved" }))}>
                ✅ Approve
              </button>
              <button className="btn" disabled={busy !== ""} onClick={() => act("changes", () => patch(`/api/posts`, { slug, id: post.id, action: "status", status: "changes_requested", note }))}>
                ✏️ Request changes
              </button>
              <input className="input !w-56" placeholder="change note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            {post.review?.note && <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">review note: {post.review.note}</div>}
          </div>
        </div>
      </Section>

      {(previewImg || previewPdf) && (
        <Section title="Platform preview">
          <PlatformPreview platform={post.platform} format={post.format} post={post} slug={slug} img={previewImg?.path} pdf={previewPdf?.path} />
          <div className="flex flex-wrap gap-2 mt-4">
            {post.assets.map((a: any) => (
              <a key={a.path} className="chip bg-zinc-800 text-zinc-300 hover:border-[#6C5CE7] cursor-pointer" href={fileUrl(slug, a.path)} target="_blank">
                {a.path.split("/").pop()}
              </a>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

// ---------- platform preview mocks ----------

function PlatformPreview({ platform, format, post, slug, img, pdf }: { platform: string; format: string; post: any; slug: string; img?: string; pdf?: string }) {
  const imgEl = img ? <img src={fileUrl(slug, img)} className="w-full object-cover" /> : null;
  const caption = (post.copy.caption ?? post.copy.primaryText ?? post.copy.postText ?? post.copy.body ?? post.copy.message ?? []) as string[];
  const hashtags = (post.copy.hashtags ?? []) as string[];

  if (platform === "instagram") {
    return (
      <div className="max-w-sm mx-auto rounded-2xl overflow-hidden border border-[#23233a] bg-[#0e0e18]">
        <div className="flex items-center gap-2 p-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6C5CE7] to-[#00CEC9]" />
          <div className="text-sm font-semibold">webcules</div>
          <div className="ml-auto text-zinc-500">···</div>
        </div>
        {format === "reel" ? <div className="relative aspect-[9/16] bg-black">{img && <img src={fileUrl(slug, img)} className="w-full h-full object-cover" />}</div> : imgEl}
        <div className="px-3 py-2 text-lg">❤️ 💬 ✈️</div>
        <div className="px-3 pb-4 text-sm">
          <div className="font-semibold mb-1">{post.hook}</div>
          {caption.slice(0, 6).map((l: string, i: number) => <div key={i} className={l === "" ? "h-2" : "text-zinc-300"}>{l}</div>)}
          {hashtags.length > 0 && <div className="text-sky-400 text-xs mt-2 leading-relaxed">{hashtags.join(" ")}</div>}
        </div>
      </div>
    );
  }

  if (platform === "facebook") {
    return (
      <div className="max-w-md mx-auto rounded-2xl overflow-hidden border border-[#23233a] bg-[#0e0e18]">
        <div className="flex items-center gap-2 p-3">
          <div className="w-9 h-9 rounded-full bg-[#1877F2]/30 flex items-center justify-center">⚡</div>
          <div><div className="text-sm font-semibold">Webcules</div><div className="text-[11px] text-zinc-500">Sponsored · 🌐</div></div>
        </div>
        <div className="px-3 pb-2 text-sm">{post.hook}</div>
        {imgEl}
        <div className="px-3 py-3 text-sm text-zinc-400">
          <div className="text-[11px] uppercase tracking-wide text-zinc-600">{post.copy.ctaButton ?? "Learn more"} ›</div>
          <div className="font-semibold text-zinc-300">{post.copy.headline ?? "webcules.com"}</div>
          {caption.slice(1, 3).map((l: string, i: number) => <div key={i}>{l}</div>)}
        </div>
      </div>
    );
  }

  if (platform === "tiktok") {
    const overlays = (post.copy.overlays ?? []) as string[];
    return (
      <div className="max-w-xs mx-auto relative rounded-3xl overflow-hidden border-4 border-zinc-800 aspect-[9/16] bg-black">
        {img && <img src={fileUrl(slug, img)} className="absolute inset-0 w-full h-full object-cover opacity-90" />}
        {overlays.slice(0, 2).map((o: string, i: number) => (
          <div key={i} className={`absolute left-3 right-12 text-white font-black text-lg drop-shadow-lg ${i === 0 ? "top-16" : "top-32"}`}>{o}</div>
        ))}
        <div className="absolute bottom-16 left-3 right-3 text-white text-sm drop-shadow">🎵 {post.copy.sound}</div>
        <div className="absolute bottom-3 left-3 right-16 text-white text-xs drop-shadow font-semibold">@webcules</div>
        <div className="absolute right-3 bottom-24 flex flex-col gap-4 text-white text-center text-xs">
          <div>❤️<div className="text-[10px]">12.4K</div></div>
          <div>💬<div className="text-[10px]">842</div></div>
          <div>↗<div className="text-[10px]">share</div></div>
        </div>
      </div>
    );
  }

  if (platform === "linkedin") {
    return (
      <div className="max-w-md mx-auto rounded-2xl overflow-hidden border border-[#23233a] bg-[#0e0e18]">
        <div className="flex items-center gap-2 p-3">
          <div className="w-10 h-10 rounded-full bg-[#0A66C2]/30 flex items-center justify-center">💼</div>
          <div><div className="text-sm font-semibold">Webcules — Custom Apps & Sites</div><div className="text-[11px] text-zinc-500">Software Development · Promoted</div></div>
        </div>
        <div className="px-3 pb-3 text-sm whitespace-pre-wrap">{post.hook}
          {caption.slice(1, 4).map((l: string, i: number) => <div key={i}>{l}</div>)}
        </div>
        {format === "document" ? (
          pdf ? (
            <iframe src={fileUrl(slug, pdf)} className="w-full h-96 bg-white" />
          ) : (
            <div className="border-t border-b border-[#23233a] bg-zinc-900 aspect-[4/5] flex flex-col items-center justify-center text-zinc-600 gap-2">
              <div className="text-4xl">📄</div>
              <div className="text-xs">render to preview the document carousel</div>
            </div>
          )
        ) : (
          img && <img src={fileUrl(slug, img)} className="w-full" />
        )}
        <div className="px-3 py-2 text-xs text-sky-400">{hashtags.join(" ")}</div>
      </div>
    );
  }

  if (platform === "whatsapp") {
    const msg = (post.copy.message ?? []) as string[];
    return (
      <div className="max-w-xs mx-auto rounded-2xl overflow-hidden border border-[#23233a] bg-[#0b141a]">
        <div className="bg-[#1f2c34] px-3 py-2 text-sm font-semibold text-white flex items-center gap-2">💬 Webcules <span className="text-[10px] text-emerald-400">business account</span></div>
        <div className="p-3 flex flex-col gap-2 min-h-40" style={{ background: "#0b141a" }}>
          {format === "status" ? (
            img ? <img src={fileUrl(slug, img)} className="rounded-lg" /> : <div className="text-xs text-zinc-500">render to preview status graphic</div>
          ) : (
            <div className="self-start max-w-[85%] rounded-xl rounded-tl-sm bg-[#005c4b] px-3 py-2 text-sm text-white whitespace-pre-wrap">
              {msg.join("\n")}
            </div>
          )}
        </div>
        <div className="text-[10px] text-zinc-600 px-3 pb-2">{post.copy.sendWindow ?? "business hours only"}</div>
      </div>
    );
  }
  return null;
}

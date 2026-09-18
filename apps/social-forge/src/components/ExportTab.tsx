import { useEffect, useState } from "react";
import { api, post as apiPost, Section, fileUrl } from "./lib.tsx";
import type { WorkspaceData } from "./Workspace.tsx";

/** Export & publish: platform-ready packs + schedule files; publishers stay dormant until keys arrive. */
export default function ExportTab({ slug, data, refresh }: { slug: string; data: WorkspaceData; refresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [git, setGit] = useState<any>(null);

  const load = () => {
    api("/api/health").then(setHealth).catch(() => {});
    api(`/api/projects/${slug}/git`).then(setGit).catch(() => {});
  };
  useEffect(load, [slug]);

  const exportPack = async () => {
    setBusy(true);
    try {
      setResult(await apiPost(`/api/export`, { slug }));
      refresh();
      load();
    } finally {
      setBusy(false);
    }
  };

  const ready = data.posts.filter((p) => ["approved", "scheduled"].includes(p.status));

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="grid gap-5 self-start">
        <Section title="Export the publish pack">
          <div className="text-sm text-zinc-400 mb-4 leading-relaxed">
            Renders final creatives for every <b>approved/scheduled</b> post ({ready.length} ready), writes each post's copy bundle, and drops <code>schedule.csv</code> + <code>schedule.ics</code> into the project root — everything a human (or a future API connector) needs to publish.
          </div>
          <div className="flex gap-2 flex-wrap mb-4">
            <button className="btn btn-primary" onClick={exportPack} disabled={busy || ready.length === 0}>
              {busy ? "exporting…" : `📦 Export ${ready.length} post pack${ready.length === 1 ? "" : "s"}`}
            </button>
            {result && (
              <>
                <a className="btn" href={fileUrl(slug, "schedule.csv")} download>⬇ schedule.csv</a>
                <a className="btn" href={fileUrl(slug, "schedule.ics")} download>⬇ schedule.ics</a>
              </>
            )}
          </div>
          {result && (
            <div className="grid gap-2">
              <div className="text-xs font-bold text-emerald-400">exported:</div>
              {Object.entries(result.exported).map(([id, files]: any) => (
                <div key={id} className="card p-3">
                  <div className="font-bold text-sm mb-1.5">{id}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {files.map((f: string) => (
                      <a key={f} className="chip bg-zinc-800 text-zinc-300" href={fileUrl(slug, f)} target="_blank">{f.split("/").pop()}</a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={`Project git repo — webcules/projects/${slug}`}>
          {git?.repo === false ? (
            <div className="text-sm text-zinc-500">no repo yet</div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-3">
                <span className="chip bg-emerald-500/15 text-emerald-300">{git.count} commits</span>
                {git.dirty && <span className="chip bg-amber-500/15 text-amber-300">uncommitted changes</span>}
                <button className="btn" onClick={async () => { await apiPost(`/api/projects/${slug}/git`, { message: "manual checkpoint" }); load(); }}>commit now</button>
              </div>
              <pre className="text-xs text-zinc-500 max-h-60 overflow-auto leading-relaxed">{git.log.join("\n")}</pre>
            </>
          )}
        </Section>
      </div>

      <div className="grid gap-5 self-start">
        <Section title="Publishing connectors — awaiting your API keys">
          <div className="text-sm text-zinc-400 mb-4 leading-relaxed">
            Direct scheduling/publishing wires up the moment keys exist. Add them to <code>.env.local</code> in <code>apps/social-forge</code> (or <code>app-config/publishers.json</code>) and restart — connectors flip to ready automatically. Nothing posts until you schedule through them explicitly.
          </div>
          <div className="grid gap-2.5">
            {(health?.publishers ?? []).map((p: any) => (
              <div key={p.key} className={`card p-3.5 ${p.configured ? "border-emerald-500/40" : ""}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${p.configured ? "bg-emerald-400" : "bg-zinc-600"}`} />
                  <span className="font-bold text-sm">{p.label}</span>
                  <span className={`chip ml-auto ${p.configured ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-800 text-zinc-500"}`}>{p.configured ? "ready" : "not configured"}</span>
                </div>
                {!p.configured && (
                  <>
                    <div className="text-xs text-zinc-500 mt-2">missing: <code>{p.missing.join(", ")}</code></div>
                    <div className="text-xs text-zinc-600 mt-1">{p.howTo}</div>
                    <div className="text-[11px] text-zinc-700 mt-1">scopes: {p.scopes}</div>
                  </>
                )}
              </div>
            ))}
          </div>
        </Section>

        <Section title="How the pack maps to platforms">
          <ul className="text-sm text-zinc-400 grid gap-2 leading-relaxed">
            <li>📸 <b>Instagram</b> — 1080×1350 feed PNG, carousel frames, reel cover 1080×1920 + script/overlays/sound</li>
            <li>📘 <b>Facebook</b> — 1080×1080 + 1200×627 link card, primary text, CTA button, targeting note</li>
            <li>🎵 <b>TikTok</b> — 9:16 script with 0–3s hook, overlay lines, caption, trending-sound suggestion</li>
            <li>💼 <b>LinkedIn</b> — text post + document carousel PDF (540×675pt)</li>
            <li>💬 <b>WhatsApp</b> — broadcast message, status graphic 1080×1920, wa.me link</li>
            <li>🎬 <b>Reels/video files</b> — generate in the Generate tab: render the vertical creative → animate with <code>wan22-ti2v-vertical</code></li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

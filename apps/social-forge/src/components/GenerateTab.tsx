import { useEffect, useMemo, useRef, useState } from "react";
import { api, post as apiPost, Section, fileUrl, fmtWhen } from "./lib.tsx";
import type { WorkspaceData } from "./Workspace.tsx";

/**
 * Phase 2 — local asset generation through ComfyUI. Workflows are the reusable
 * library (workflows/*.json + manifest); every run is logged with its vars, so any
 * asset can be reproduced or re-rolled later. Outputs land in assets/images|videos.
 */
export default function GenerateTab({ slug, data, refresh }: { slug: string; data: WorkspaceData; refresh: () => void }) {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<any[]>(data.runs);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api<{ workflows: any[] }>("/api/workflows").then((r) => setWorkflows(r.workflows));
  }, []);

  const wf = workflows.find((w) => w.name === selected);

  useEffect(() => {
    if (wf) {
      const init: Record<string, string> = {};
      for (const k of ["width", "height", "steps", "cfg", "length", "fps"]) if (wf.defaults?.[k] !== undefined) init[k] = String(wf.defaults[k]);
      setVars(init);
    }
  }, [selected]);

  // poll while any job is live
  useEffect(() => {
    const live = () => runs.some((r) => r.status === "queued" || r.status === "running");
    if (pollRef.current) clearInterval(pollRef.current);
    if (live()) {
      pollRef.current = setInterval(async () => {
        try {
          const r = await api<{ runs: any[] }>(`/api/workflows/run?slug=${slug}`);
          setRuns(r.runs);
          if (!r.runs.some((x) => x.status === "queued" || x.status === "running")) {
            refresh();
          }
        } catch {}
      }, 2500);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [runs, slug, refresh]);

  const assetImages = useMemo(() => {
    const out: string[] = [];
    const walk = (nodes: any[]) => {
      for (const n of nodes) {
        if (n.type === "dir") walk(n.children ?? []);
        else if (/^assets\/images\//.test(n.path) && /\.(png|jpe?g|webp)$/i.test(n.name)) out.push(n.path);
      }
    };
    walk(data.tree);
    return out.reverse();
  }, [data.tree]);

  const queue = async () => {
    if (!wf || !prompt.trim()) return;
    setError("");
    try {
      const numeric = new Set(["width", "height", "steps", "cfg", "length", "fps", "seed", "shift"]);
      const cleanVars: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(vars)) if (v !== "" && v !== undefined) cleanVars[k] = numeric.has(k) ? Number(v) : v;
      if (vars.image) cleanVars.image = vars.image;
      const r = await apiPost<{ job: any }>(`/api/workflows/run`, { slug, workflow: wf.name, vars: { prompt, ...cleanVars } });
      setRuns((prev) => [r.job, ...prev.filter((x) => x.id !== r.job.id)]);
      refresh();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const live = runs.filter((r) => r.status === "queued" || r.status === "running");
  const history = runs.slice(0, 12);

  return (
    <div className="grid xl:grid-cols-[1fr_420px] gap-5">
      <div className="grid gap-5">
        <Section title="Workflow library (reusable, per-project)">
          <div className="grid md:grid-cols-2 gap-3">
            {workflows.map((w) => (
              <button
                key={w.name}
                onClick={() => setSelected(w.name)}
                className={`card p-4 text-left transition-colors ${selected === w.name ? "border-[#6C5CE7] bg-[#6C5CE7]/5" : "hover:border-zinc-600"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-sm">{w.title}</div>
                  <span className={`chip ${w.produces === "video" ? "bg-sky-500/15 text-sky-300" : "bg-emerald-500/15 text-emerald-300"}`}>{w.produces}</span>
                </div>
                <div className="text-xs text-zinc-400 mt-1.5 leading-relaxed">{w.use_for}</div>
                {w.modelsOk === false && <div className="text-[11px] text-rose-400 mt-1.5">⚠ missing models: {w.missingModels.join(", ")}</div>}
              </button>
            ))}
          </div>
        </Section>

        {wf && (
          <Section title={`Run — ${wf.title}`}>
            <div className="grid gap-3">
              <textarea
                className="input min-h-24"
                placeholder={wf.produces === "video" ? "Motion description — camera + subject motion, keep text areas stable…" : "Full art direction: palette, subject, lighting, camera, mood…"}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              <div className="grid grid-cols-6 gap-2">
                {Object.entries(vars).map(([k, v]) => (
                  <label key={k} className="block">
                    <span className="block text-[10px] font-semibold text-zinc-500 mb-1 uppercase">{k}</span>
                    <input className="input !px-2 !py-1.5" value={v} onChange={(e) => setVars({ ...vars, [k]: e.target.value })} />
                  </label>
                ))}
              </div>
              {wf.name.includes("ti2v") && (
                <div>
                  <span className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase">Source image (composed creative or background)</span>
                  <select className="input" value={vars.image ?? ""} onChange={(e) => setVars({ ...vars, image: e.target.value })}>
                    <option value="">— pick an image from assets —</option>
                    {assetImages.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <div className="text-[11px] text-zinc-600 mt-1">reel pipeline: render the post creative first (Posts tab), then animate it here</div>
                </div>
              )}
              {error && <div className="text-rose-400 text-sm whitespace-pre-wrap">{error}</div>}
              <div className="flex items-center gap-3">
                <button className="btn btn-primary" onClick={queue} disabled={!prompt.trim()}>⚡ Queue generation</button>
                <span className="text-xs text-zinc-600">runs on your GPU via ComfyUI :8188 — no external APIs</span>
              </div>
            </div>
          </Section>
        )}

        <Section title={`Runs ${live.length ? `· ${live.length} live` : ""}`}>
          {history.length === 0 ? (
            <div className="text-sm text-zinc-500 border border-dashed border-zinc-800 rounded-xl p-6 text-center">no runs yet</div>
          ) : (
            <div className="grid gap-3">
              {history.map((r) => (
                <div key={r.id} className="card p-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`chip ${r.status === "done" ? "bg-emerald-500/15 text-emerald-300" : r.status === "error" ? "bg-rose-500/15 text-rose-300" : "bg-amber-500/15 text-amber-300 animate-pulse"}`}>{r.status}</span>
                    <span className="font-bold text-sm">{r.workflow}</span>
                    <span className="text-xs text-zinc-600">{fmtWhen(r.startedAt)}{r.finishedAt ? ` → ${fmtWhen(r.finishedAt)}` : ""}</span>
                    <span className="text-[11px] text-zinc-600 ml-auto truncate max-w-52" title={r.vars?.prompt}>{String(r.vars?.prompt ?? "").slice(0, 80)}</span>
                  </div>
                  {r.error && <pre className="text-xs text-rose-400 mt-2 whitespace-pre-wrap">{r.error}</pre>}
                  {r.outputs?.length > 0 && (
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {r.outputs.map((o: any) => (
                        <a key={o.path} href={fileUrl(slug, o.path)} target="_blank" className="block group relative">
                          {o.kind === "video" ? (
                            <video src={fileUrl(slug, o.path)} className="h-28 rounded-lg border border-[#23233a]" muted />
                          ) : (
                            <img src={fileUrl(slug, o.path)} className="h-28 rounded-lg border border-[#23233a] group-hover:border-[#6C5CE7]" />
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      <div className="grid gap-5 self-start">
        <Section title="Generated assets">
          <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-auto">
            {assetImages.length === 0 && <div className="text-sm text-zinc-500 col-span-2">nothing yet — queue a workflow</div>}
            {assetImages.slice(0, 24).map((p) => (
              <a key={p} href={fileUrl(slug, p)} target="_blank">
                <img src={fileUrl(slug, p)} className="w-full rounded-lg border border-[#23233a] hover:border-[#6C5CE7]" />
              </a>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { api, post, Field, Section } from "./lib.tsx";

type Health = {
  comfy: { online: boolean; version?: string; device?: string; vramFreeGb?: number; vramTotalGb?: number; error?: string };
  publishers: { key: string; label: string; configured: boolean; missing: string[] }[];
  projects: number;
};

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", brief: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    api("/api/health").then(setHealth).catch(() => setHealth(null));
    api<{ projects: any[] }>("/api/projects").then((r) => setProjects(r.projects)).catch(() => {});
  };
  useEffect(load, []);

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      await post("/api/projects", form);
      setForm({ name: "", brief: "" });
      setCreating(false);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <header className="flex flex-wrap items-center gap-4 mb-10">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#6C5CE7] to-[#00CEC9] flex items-center justify-center text-2xl">⚡</div>
        <div className="flex-1 min-w-[260px]">
          <h1 className="text-2xl font-black tracking-tight">
            social-forge <span className="text-zinc-500 font-semibold text-lg">— the 10,000 posts machine</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">Webcules marketing system · swipe research → local ComfyUI assets → platform post packs → calendar → export</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating((v) => !v)}>
          {creating ? "Close" : "+ New campaign"}
        </button>
      </header>

      {/* system bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card p-4 flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full ${health?.comfy.online ? "bg-emerald-400" : "bg-rose-400"} animate-pulse`} />
          <div className="text-sm">
            <div className="font-semibold">{health?.comfy.online ? "ComfyUI online" : "ComfyUI offline"}</div>
            <div className="text-xs text-zinc-500">
              {health?.comfy.online ? `${health.comfy.device} · ${health.comfy.vramFreeGb ?? "?"}GB free VRAM · v${health.comfy.version}` : "start ComfyUI on :8188 to generate assets"}
            </div>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <span className="text-xl">📁</span>
          <div className="text-sm">
            <div className="font-semibold">{projects.length} campaign{projects.length === 1 ? "" : "s"}</div>
            <div className="text-xs text-zinc-500">each is its own git repo under webcules/projects/</div>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <span className="text-xl">🔌</span>
          <div className="text-sm">
            <div className="font-semibold">Publishing: {health?.publishers.filter((p) => p.configured).length ?? 0}/5 connected</div>
            <div className="text-xs text-zinc-500">direct posting unlocks when API keys are added</div>
          </div>
        </div>
      </div>

      {creating && (
        <Section title="New campaign">
          <div className="grid gap-4">
            <Field label="Campaign name">
              <input className="input" placeholder="e.g. Webcules Custom Apps — October Push" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="The brief — what are we selling, to whom, with what angle?">
              <textarea className="input min-h-28" placeholder="Paste your prompt/brief. The offer fields below are pre-filled with the Webcules defaults — edit them in the project after creating." value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} />
            </Field>
            {error && <div className="text-rose-400 text-sm">{error}</div>}
            <div className="flex gap-2">
              <button className="btn btn-primary" disabled={busy || !form.name || !form.brief} onClick={create}>
                {busy ? "Creating…" : "Create campaign workspace"}
              </button>
            </div>
          </div>
        </Section>
      )}

      <Section title="Campaigns">
        {projects.length === 0 ? (
          <div className="text-sm text-zinc-500 border border-dashed border-zinc-800 rounded-xl p-8 text-center">
            No campaigns yet. Create one — it scaffolds <code className="text-zinc-300">webcules/projects/&lt;name&gt;/</code> with swipe/, assets/, workflows/, posts/ and inits the git repo.
          </div>
        ) : (
          <div className="grid gap-3">
            {projects.map((p) => (
              <a key={p.slug} href={`/projects/${p.slug}`} className="card p-4 flex items-center gap-4 hover:border-[#6C5CE7] transition-colors group">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6C5CE7]/60 to-[#00CEC9]/40 flex items-center justify-center font-black">{p.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold group-hover:text-[#9d8fff]">{p.name}</div>
                  <div className="text-xs text-zinc-500 truncate">{p.brief}</div>
                </div>
                <div className="flex gap-1.5">
                  {p.platforms.map((pl: string) => (
                    <span key={pl} className="chip bg-zinc-800 text-zinc-400">{pl}</span>
                  ))}
                </div>
              </a>
            ))}
          </div>
        )}
      </Section>

      <footer className="mt-10 text-xs text-zinc-600 text-center">100% local generation — no external AI APIs · webcules-inc/apps/social-forge</footer>
    </div>
  );
}

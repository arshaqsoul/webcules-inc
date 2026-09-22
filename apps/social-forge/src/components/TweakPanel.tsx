"use client";
import React from "react";

export type TweakItem =
  | { key: string; label: string; type: "range"; min: number; max: number; step: number; group?: string }
  | { key: string; label: string; type: "color"; group?: string }
  | { key: string; label: string; type: "toggle"; group?: string }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[]; group?: string };

export type TweakValues = Record<string, number | boolean | string>;

const accent = { accentColor: "#6c5ce7" } as const;

function Row({ item, value, onChange }: { item: TweakItem; value: TweakValues[string]; onChange: (v: TweakValues[string]) => void }) {
  if (item.type === "range") {
    return (
      <label className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-white/60">{item.label}</span>
        <input
          type="range"
          min={item.min}
          max={item.max}
          step={item.step}
          value={Number(value)}
          onChange={(e) => onChange(Number(e.target.value))}
          style={accent}
          className="h-1 flex-1 cursor-pointer appearance-none rounded bg-white/20"
        />
        <span className="w-10 shrink-0 text-right font-mono text-white/80">{Number(value).toFixed(item.step < 0.1 ? 2 : item.step < 1 ? 1 : 0)}</span>
      </label>
    );
  }
  if (item.type === "color") {
    return (
      <label className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-white/60">{item.label}</span>
        <input type="color" value={String(value)} onChange={(e) => onChange(e.target.value)} className="h-6 w-12 cursor-pointer rounded border border-white/20 bg-transparent" />
        <span className="font-mono text-white/60">{String(value)}</span>
      </label>
    );
  }
  if (item.type === "toggle") {
    return (
      <label className="flex cursor-pointer items-center gap-2">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} style={accent} />
        <span className="text-white/60">{item.label}</span>
      </label>
    );
  }
  return (
    <label className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-white/60">{item.label}</span>
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded border border-white/20 bg-black/50 px-2 py-1 text-white"
      >
        {item.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Live-tuning panel for demo pages: schema-driven sliders/colors/toggles bound to a state object. */
export function TweakPanel({
  title = "tweak",
  items,
  value,
  onChange,
  extra,
}: {
  title?: string;
  items: TweakItem[];
  value: TweakValues;
  onChange: (key: string, v: TweakValues[string]) => void;
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(true);
  const [copied, setCopied] = React.useState(false);
  const groups = [...new Set(items.map((i) => i.group ?? ""))];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed right-3 top-3 z-50 rounded-full border border-white/20 bg-black/60 px-4 py-2 font-mono text-xs text-white/80 backdrop-blur hover:bg-black/80"
      >
        ⚙ {title}
      </button>
    );
  }
  return (
    <aside className="fixed bottom-3 right-3 top-3 z-50 flex w-72 flex-col overflow-y-auto rounded-xl border border-white/15 bg-black/70 p-4 font-sans text-xs text-white backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono font-bold tracking-widest text-white/90">{title.toUpperCase()}</span>
        <button onClick={() => setOpen(false)} className="text-white/50 hover:text-white">
          ✕
        </button>
      </div>
      {extra}
      {groups.map((g) => (
        <div key={g} className="mb-4">
          {g && <div className="mb-2 mt-1 font-mono uppercase tracking-wider text-white/40">{g}</div>}
          <div className="space-y-2">
            {items
              .filter((i) => (i.group ?? "") === g)
              .map((item) => (
                <Row key={item.key} item={item} value={value[item.key]} onChange={(v) => onChange(item.key, v)} />
              ))}
          </div>
        </div>
      ))}
      <div className="mt-auto space-y-2 pt-2">
        <button
          onClick={() => {
            navigator.clipboard?.writeText(JSON.stringify(value, null, 2)).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              () => {},
            );
          }}
          className="w-full rounded border border-white/20 bg-white/10 px-3 py-2 font-mono hover:bg-white/20"
        >
          {copied ? "copied ✓" : "copy config JSON"}
        </button>
        <button onClick={() => setOpen(false)} className="w-full rounded px-3 py-1 text-center text-white/40 hover:text-white/80">
          collapse
        </button>
      </div>
    </aside>
  );
}

export default TweakPanel;

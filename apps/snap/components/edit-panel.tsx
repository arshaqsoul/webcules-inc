"use client";

/* Develop panel (WEB-402) — the Lightroom-style edit surface inside the
 * manage pane: eight adjustment sliders, Auto (deterministic, from the
 * upload analysis), presets (built-in + the studio's saved edit_preset
 * templates), copy/paste, and a live canvas preview rendered by the SAME
 * pixel pipeline that produces the stored edit.jpg deliverable. Non-
 * destructive by construction: the stored edit set is JSON, originals are
 * never touched, clearing edits restores the clean render everywhere. */
import { useEffect, useMemo, useRef, useState } from "react";

import { Wand2 } from "lucide-react";

import type { AssetItem } from "@/components/project-files";
import { renderEditedBlob } from "@/components/edit-canvas";
import {
  BUILTIN_EDIT_PRESETS,
  EDIT_KEYS,
  EDIT_RANGES,
  autoEdits,
  isEmptyEdits,
  mergeEdits,
  type EditKey,
  type PartialEdits,
} from "@/lib/edits";

type PresetRow = { name: string; edits: PartialEdits; builtin?: boolean; id?: string };

export function EditPanel({
  item,
  clipboard,
  onCopy,
  onSave,
  onLivePreview,
  saving,
}: {
  item: AssetItem;
  /** Current copied edit set (parent holds it across assets). */
  clipboard: PartialEdits | null;
  onCopy: (edits: PartialEdits) => void;
  /** Persist + render: the parent PATCHes, renders edit.jpg (2560px, with
   * the studio watermark when configured) and uploads the derivative. */
  onSave: (id: string, edits: PartialEdits | null) => Promise<boolean>;
  /** Live-preview hook: the panel renders a 720px canvas preview and hands
   * the parent the object URL (null restores the stored preview). */
  onLivePreview: (url: string | null) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<PartialEdits>(item.edits ?? {});
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [studioPresets, setStudioPresets] = useState<PresetRow[]>([]);
  const [saveName, setSaveName] = useState("");
  const [notice, setNotice] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef(0);

  const hasEdits = !isEmptyEdits(draft);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(item.edits ?? {}), [draft, item.edits]);

  // Studio presets load lazily (kind edit_preset via the template store).
  useEffect(() => {
    if (!presetsOpen || studioPresets.length) return;
    fetch("/api/studio/templates?kind=edit_preset")
      .then((r) => (r.ok ? (r.json() as Promise<{ templates: { id: string; name: string; body: string }[] }>) : { templates: [] }))
      .then((b) => {
        const rows: PresetRow[] = [];
        for (const t of b.templates ?? []) {
          try {
            rows.push({ id: t.id, name: t.name, edits: JSON.parse(t.body) as PartialEdits });
          } catch {
            /* malformed body — skip the row, keep the rest */
          }
        }
        setStudioPresets(rows);
      })
      .catch(() => setStudioPresets([]));
  }, [presetsOpen, studioPresets.length]);

  // Live preview: debounce slider moves, render through the real pipeline at
  // 720px (no watermark — clarity while grading), swap into the main image.
  useEffect(() => {
    if (!dirty) {
      onLivePreview(null);
      return;
    }
    if (!hasEdits) {
      // Clearing everything previews the clean original (preview derivative).
      onLivePreview(null);
      return;
    }
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setPreviewing(true);
      void renderEditedBlob(item.id, draft, { maxDim: 720, signal: ctrl.signal }).then((blob) => {
        setPreviewing(false);
        if (!blob || ctrl.signal.aborted) return;
        onLivePreview(URL.createObjectURL(blob));
      });
    }, 160);
    return () => window.clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draft identity is the trigger
  }, [draft]);

  useEffect(() => {
    onLivePreview(null);
    abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- per-asset reset
  }, [item.id]);

  function setOne(key: EditKey, value: number) {
    setDraft((d) => mergeEdits(d, { [key]: value }));
  }

  async function save() {
    const ok = await onSave(item.id, hasEdits ? draft : null);
    setNotice(ok ? "" : "Couldn't save — try again.");
    if (ok) onLivePreview(null);
  }

  async function savePreset() {
    const name = saveName.trim();
    if (!name || !hasEdits) return;
    try {
      const res = await fetch("/api/studio/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "edit_preset", name, body: JSON.stringify(draft) }),
      });
      if (!res.ok) throw new Error();
      setStudioPresets((p) => [...p, { name, edits: draft }]);
      setSaveName("");
      setNotice(`Saved “${name}” to your presets.`);
    } catch {
      setNotice("Couldn't save the preset — try again.");
    }
  }

  return (
    <section aria-label="Edit">
      <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
        Edit
        {item.edits && !isEmptyEdits(item.edits) && <span className="rounded-full bg-primary/15 px-1.5 text-[9px] font-medium normal-case text-primary">edited</span>}
        {previewing && <span className="text-[9px] font-normal normal-case text-ink-tertiary">rendering…</span>}
      </h3>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={!item.analysis || saving}
          title={item.analysis ? "Auto-correct exposure, clipping and flat range from the upload analysis" : "Auto needs the upload analysis (re-upload this file to analyze it)"}
          onClick={() => setDraft(item.analysis ? autoEdits(item.analysis) : {})}
          className="flex items-center gap-1 rounded-md border border-hairline bg-canvas px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-surface-2 disabled:opacity-50"
        >
          <Wand2 className="h-3.5 w-3.5" aria-hidden /> Auto
        </button>

        {/* Presets */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setPresetsOpen((o) => !o)}
            className="rounded-md border border-hairline bg-canvas px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-surface-2"
          >
            Presets
          </button>
          {presetsOpen && (
            <div className="absolute right-0 top-full z-40 mt-1.5 w-60 rounded-[10px] border border-hairline bg-surface-1 p-1 shadow-lg" role="menu">
              <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">Snap looks</p>
              {BUILTIN_EDIT_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  role="menuitem"
                  onClick={() => { setDraft(p.edits); setPresetsOpen(false); }}
                  className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-[13px] text-ink-muted transition-colors hover:bg-surface-2"
                >
                  {p.name}
                </button>
              ))}
              {studioPresets.length > 0 && (
                <>
                  <p className="mt-1 border-t border-hairline px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">Your presets</p>
                  {studioPresets.map((p) => (
                    <button
                      key={p.id ?? p.name}
                      type="button"
                      role="menuitem"
                      onClick={() => { setDraft(p.edits); setPresetsOpen(false); }}
                      className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-[13px] text-ink-muted transition-colors hover:bg-surface-2"
                    >
                      {p.name}
                    </button>
                  ))}
                </>
              )}
              <div className="mt-1 flex gap-1 border-t border-hairline p-1">
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value.slice(0, 60))}
                  onKeyDown={(e) => e.key === "Enter" && void savePreset()}
                  placeholder={hasEdits ? "Save this look as…" : "Adjust first, then save"}
                  disabled={!hasEdits}
                  aria-label="Preset name"
                  className="min-w-0 flex-1 rounded-md border border-hairline bg-canvas px-2 py-1 text-xs text-ink outline-none focus:border-primary disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => void savePreset()}
                  disabled={!hasEdits || !saveName.trim()}
                  className="rounded-md border border-hairline px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-surface-2 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Copy / paste */}
        <button
          type="button"
          disabled={!hasEdits}
          onClick={() => onCopy(draft)}
          title="Copy this look (paste onto other photos from the grid or here)"
          className="rounded-md border border-hairline bg-canvas px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-surface-2 disabled:opacity-50"
        >
          Copy
        </button>
        <button
          type="button"
          disabled={!clipboard}
          onClick={() => clipboard && setDraft(clipboard)}
          title={clipboard ? "Paste the copied look onto this photo" : "Copy a look first"}
          className="rounded-md border border-hairline bg-canvas px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-surface-2 disabled:opacity-50"
        >
          Paste
        </button>
        {(hasEdits || item.edits) && (
          <button
            type="button"
            onClick={() => setDraft({})}
            className="rounded-md border border-hairline bg-canvas px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-surface-2"
          >
            Reset
          </button>
        )}
      </div>

      {/* Sliders */}
      <div className="flex flex-col gap-2">
        {EDIT_KEYS.map((key) => {
          const value = draft[key] ?? 0;
          const set = value !== 0;
          return (
            <label key={key} className="flex items-center gap-2 text-xs" title={EDIT_RANGES[key].hint}>
              <span className={`w-16 shrink-0 ${set ? "text-ink" : "text-ink-tertiary"}`}>{EDIT_RANGES[key].label}</span>
              <input
                type="range"
                min={-100}
                max={100}
                step={1}
                value={value}
                onChange={(e) => setOne(key, Number(e.target.value))}
                aria-label={EDIT_RANGES[key].label}
                className="h-1 min-w-0 flex-1 accent-[var(--primary)]"
              />
              <span className="w-7 shrink-0 text-right tabular-nums text-ink-muted">{value > 0 ? `+${value}` : value}</span>
              <button
                type="button"
                onClick={() => setOne(key, 0)}
                disabled={!set}
                aria-label={`Reset ${EDIT_RANGES[key].label}`}
                className="w-4 shrink-0 text-center text-[11px] text-ink-tertiary transition-colors hover:text-ink disabled:opacity-0"
              >
                ×
              </button>
            </label>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:brightness-110 disabled:opacity-50"
        >
          {saving ? "Saving…" : item.edits && !hasEdits ? "Remove edits" : hasEdits ? "Save look" : "Nothing to save"}
        </button>
      </div>
      {!dirty && item.edits && !isEmptyEdits(item.edits) && (
        <p className="mt-1.5 text-[11px] text-ink-tertiary">
          Saved{item.editedRendered ? " — clients see this look in the gallery." : " — rendering…"}
        </p>
      )}
      {notice && <p className="mt-1.5 text-[11px] text-ink-muted">{notice}</p>}
      <p className="mt-1.5 text-[10px] leading-snug text-ink-tertiary">
        Non-destructive: originals stay untouched, and clearing edits restores the clean photo everywhere.
      </p>
    </section>
  );
}

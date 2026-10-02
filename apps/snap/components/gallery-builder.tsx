"use client";

/* WEB-321/322 — the gallery page builder (Lite+; collage sections Studio+).
 * Three panes: section list (pointer drag-reorder) · live canvas (the REAL
 * sectioned renderer — same GalleryView the client gallery mounts, no
 * parallel truth) · schema-driven inspector + theme/typography editor.
 * Edits work on a draft (autosaved to localStorage every 10s idle); Save
 * writes gallery_design v2 with template:"custom"; undo/redo ≥50 steps;
 * stale-session detection compares the server design before overwriting.
 * Desktop-first: phone users get a notice pointing at seed templates. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { Button } from "@webcules/ui/components/button";
import { GalleryView, type GalleryAsset } from "@/components/gallery-view";
import {
  designColorVars,
  fontVars,
  parseGalleryDesign,
  serializedEq,
  synthesizedSections,
  type ColumnCounts,
  type CollageItem,
  type CollageSection,
  type ContactSection,
  type DesignSection,
  type DesignNav,
  type FavoritesSection,
  type GalleryDesign,
  type GalleryLayout,
  type GallerySection,
  type HeroSection,
  type ImageBinding,
  type SectionBackground,
  type SlideshowSection,
  type TextSection,
} from "@/lib/gallery-design";
import { resolveDesignSections } from "@/lib/gallery-sections";
import { FONT_PACK, fontFamilyOf } from "@/lib/fonts";
import { sanitizeRichText } from "@/lib/sanitize";

export type BuilderAsset = {
  id: string;
  filename: string;
  kind: string;
  folder: string | null;
  stars: number;
  width: number | null;
  height: number | null;
};

type Viewport = "desktop" | "mobile";
const SECTION_LABEL: Record<string, string> = {
  hero: "Hero",
  gallery: "Gallery",
  slideshow: "Slideshow",
  favorites: "Favorites",
  collage: "Collage",
  text: "Text",
  contact: "Contact",
};
const SECTION_ICON: Record<string, string> = { hero: "★", gallery: "▦", slideshow: "▶", favorites: "♥", collage: "◈", text: "¶", contact: "✉" };
const PADDINGS = ["compact", "normal", "airy"] as const;
const BGS = ["inherit", "surface", "dark", "accent"] as const;
const BG_LABELS: Record<string, string> = { inherit: "Page", surface: "Surface", dark: "Dark", accent: "Accent tint" };

let idSeq = 0;
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;

function defaultSection(type: DesignSection["type"], photos: BuilderAsset[]): DesignSection {
  switch (type) {
    case "hero":
      return { type: "hero", id: newId("hero"), style: "static", title: "Your gallery", subtitle: "", images: photos.slice(0, 1).map((p) => ({ assetId: p.id, focal: { x: 0.5, y: 0.4 } })), interval: 0, kicker: true };
    case "gallery":
      return { type: "gallery", id: newId("gal"), binding: { kind: "all" }, layout: "masonry" };
    case "slideshow":
      return { type: "slideshow", id: newId("slide"), binding: { kind: "all" }, heading: "Slideshow", posters: 4 };
    case "favorites":
      return { type: "favorites", id: newId("fav"), heading: "Your favorites", emptyHint: "" };
    case "collage":
      return {
        type: "collage",
        id: newId("col"),
        aspect: "4/3",
        mobileStack: true,
        items: photos.slice(0, 5).map((p, i) => ({ assetId: p.id, x: (i % 3) * 30 + 4, y: Math.floor(i / 3) * 40 + 8, w: 30, rotation: i % 2 === 0 ? 0 : 3, z: i, focal: { x: 0.5, y: 0.5 } })),
      };
    case "text":
      return { type: "text", id: newId("txt"), html: "<p>Tell your clients something lovely.</p>", align: "left", width: "prose" };
    case "contact":
      return { type: "contact", id: newId("ct"), heading: "Get in touch", body: "" };
  }
}

/** v1/sectionless designs become editable via the v1→sections synthesis. */
function toEditable(design: GalleryDesign | null, inherited: GalleryDesign | null): GalleryDesign {
  const base = design ?? inherited;
  if (base?.sections?.length) return base;
  const synthetic: GalleryDesign = base
    ? { ...base, sections: synthesizedSections(base) }
    : { layout: "grid", sections: [defaultSection("hero", []), defaultSection("gallery", [])], theme: { background: "light", padding: "normal", radius: "16px", captions: "off" } };
  return synthetic;
}

export function GalleryBuilder({
  projectId,
  initialDesign,
  inherited,
  assets,
  folders,
  canCollage,
  canNav,
  studioName,
  accent,
  contactEmail,
  logoUrl,
}: {
  projectId: string;
  initialDesign: GalleryDesign | null;
  inherited: GalleryDesign | null;
  assets: BuilderAsset[];
  folders: { id: string; name: string }[];
  canCollage: boolean;
  canNav: boolean;
  studioName: string;
  accent: string;
  contactEmail: string | null;
  logoUrl: string | null;
}) {
  const base = useMemo(() => toEditable(initialDesign, inherited), [initialDesign, inherited]);
  const draftKey = `snap-builder-draft-${projectId}`;
  const [design, setDesign] = useState<GalleryDesign>(base);
  const [past, setPast] = useState<GalleryDesign[]>([]);
  const [future, setFuture] = useState<GalleryDesign[]>([]);
  const [selected, setSelected] = useState<string | null>(base.sections?.[0]?.id ?? null);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [pane, setPane] = useState<"section" | "theme">("section");
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<GalleryDesign | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [assetPicker, setAssetPicker] = useState<{ sectionId: string; forHero?: boolean } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const canvasRef = useRef<HTMLDivElement>(null);

  /* ---------- draft machinery ---------- */
  const commit = useCallback((next: GalleryDesign) => {
    setPast((p) => [...p.slice(-59), designRef.current]);
    setFuture([]);
    setDesign(next);
    setDirty(true);
  }, []);
  const designRef = useRef(design);
  designRef.current = design;

  const update = (fn: (d: GalleryDesign) => GalleryDesign) => commit(fn(designRef.current));
  type SectionPatch = Partial<DesignSection> | ((s: DesignSection) => DesignSection);
  const applyPatch = (s: DesignSection, patch: SectionPatch): DesignSection =>
    typeof patch === "function" ? patch(s) : ({ ...s, ...patch } as DesignSection);
  const updateSection = (id: string, patch: SectionPatch) =>
    update((d) => ({ ...d, sections: (d.sections ?? []).map((s) => (s.id === id ? applyPatch(s, patch) : s)) }));
  const addSection = (type: DesignSection["type"]) => {
    const s = defaultSection(type, assets);
    update((d) => ({ ...d, sections: [...(d.sections ?? []), s] }));
    setSelected(s.id);
    setPane("section");
    requestAnimationFrame(() => canvasRef.current?.querySelector(`[data-sec="${s.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  const duplicateSection = (id: string) =>
    update((d) => {
      const i = (d.sections ?? []).findIndex((s) => s.id === id);
      if (i < 0) return d;
      const copy = JSON.parse(JSON.stringify(d.sections![i])) as DesignSection;
      copy.id = newId(copy.type);
      const sections = [...d.sections!];
      sections.splice(i + 1, 0, copy);
      return { ...d, sections };
    });
  const removeSection = (id: string) => {
    update((d) => ({ ...d, sections: (d.sections ?? []).filter((s) => s.id !== id) }));
    setSelected((cur) => (cur === id ? null : cur));
  };
  const moveSection = (from: number, to: number) =>
    update((d) => {
      const sections = [...(d.sections ?? [])];
      const [moved] = sections.splice(from, 1);
      sections.splice(Math.max(0, Math.min(sections.length, to)), 0, moved);
      return { ...d, sections };
    });
  const undo = () => {
    setPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [designRef.current, ...f].slice(0, 60));
      setDesign(prev);
      setDirty(true);
      return p.slice(0, -1);
    });
  };
  const redo = () => {
    setFuture((f) => {
      if (!f.length) return f;
      setPast((p) => [...p.slice(-59), designRef.current]);
      setDesign(f[0]);
      setDirty(true);
      return f.slice(1);
    });
  };

  /* autosave draft: 10s idle + close prompt */
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(design));
      } catch {
        /* storage full — Save is the durable path */
      }
    }, 10_000);
    return () => clearTimeout(t);
  }, [design, dirty, draftKey]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(draftKey);
      if (stored && stored !== JSON.stringify(base)) {
        const restored = parseGalleryDesign(JSON.parse(stored));
        if (restored?.sections?.length) {
          setDesign(restored);
          setDirty(true);
        }
      }
    } catch {
      /* corrupt draft — start from base */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once on mount
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /* ---------- save / conflict ---------- */
  async function save(force = false) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      if (!force) {
        const cur = await fetch(`/api/projects/${projectId}/gallery-design`).then((r) => r.json()).catch(() => ({}));
        const server = parseGalleryDesign((cur as { design?: unknown }).design ?? null);
        if (server && !serializedEq(server, initialDesign ?? inherited)) {
          setConflict(server);
          setSaving(false);
          return;
        }
      }
      const canonical = parseGalleryDesign({ ...design, template: "custom" });
      if (!canonical) {
        setError("The design became invalid — check the text sections (only plain formatting is allowed).");
        setSaving(false);
        return;
      }
      const res = await fetch(`/api/projects/${projectId}/gallery-design`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ design: canonical }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(
          body.error === "too_large" ? "This design is too large — remove a few sections."
          : body.error === "design_requires_studio" ? "Collage sections need the Studio plan."
          : body.error === "design_requires_lite" ? "Custom designs start on Lite."
          : body.error === "cover_not_in_project" ? "One of the photos no longer belongs to this project."
          : "Couldn't save — try again.",
        );
      } else {
        setConflict(null);
        setDirty(false);
        setSavedFlash("Saved ✓");
        setTimeout(() => setSavedFlash(""), 3500);
        try {
          localStorage.removeItem(draftKey);
        } catch {}
      }
    } catch {
      setError("Network error — try again.");
    }
    setSaving(false);
  }

  /* ---------- canvas ---------- */
  const canvasAssets: GalleryAsset[] = useMemo(
    () => assets.map((a) => ({ id: a.id, filename: a.filename, kind: a.kind, mimeType: "image/jpeg", bytes: 0, folder: a.folder, width: a.width, height: a.height, stars: a.stars })),
    [assets],
  );
  const plan = useMemo(() => resolveDesignSections(design, canvasAssets), [design, canvasAssets]);
  const fontFamily = fontFamilyOf(design.theme.font);

  const onCanvasClick = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest("[data-sec]");
    if (el) {
      setSelected(el.getAttribute("data-sec"));
      setPane("section");
    }
  };

  /* ---------- pointer drag-reorder (left list) ---------- */
  const [drag, setDrag] = useState<{ id: string; overIndex: number | null } | null>(null);
  const rowH = 44;
  const listRef = useRef<HTMLDivElement>(null);
  const onListPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const rect = listRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top;
    setDrag((d) => (d ? { ...d, overIndex: Math.max(0, Math.min((design.sections ?? []).length, Math.round(y / rowH))) } : d));
  };
  const endDrag = () => {
    if (drag && drag.overIndex !== null) {
      const from = (design.sections ?? []).findIndex((s) => s.id === drag.id);
      if (from >= 0 && drag.overIndex !== from) moveSection(from, drag.overIndex > from ? drag.overIndex - 1 : drag.overIndex);
    }
    setDrag(null);
  };

  const selectedSection = (design.sections ?? []).find((s) => s.id === selected) ?? null;
  const collageBlocked = !canCollage;

  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col">
      {/* top bar */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-hairline bg-surface px-4 py-2.5">
        <Link href={`/dashboard/projects/${projectId}?tab=gallery`} className="text-sm font-semibold text-ink hover:underline">
          ← Gallery
        </Link>
        <span className="text-sm text-ink-subtle">Page builder</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${dirty ? "bg-surface-2 text-ink-muted" : "bg-surface-2 text-ink-tertiary"}`}>
          {dirty ? "Unsaved draft (autosaves locally)" : savedFlash || "All changes saved"}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex overflow-hidden rounded-lg border border-hairline">
            {(["desktop", "mobile"] as Viewport[]).map((v) => (
              <button key={v} type="button" onClick={() => setViewport(v)} className={`px-2.5 py-1.5 text-xs font-medium ${viewport === v ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink"}`}>
                {v === "desktop" ? "Desktop" : "Phone"}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" disabled={!past.length} onClick={undo} title="Undo (⌘Z)">↺</Button>
          <Button variant="secondary" size="sm" disabled={!future.length} onClick={redo} title="Redo (⇧⌘Z)">↻</Button>
          {base.template && base.template !== "custom" && (
            <Button variant="secondary" size="sm" onClick={() => setConfirmReset(true)}>
              Reset to template
            </Button>
          )}
          <a
            href={`/g/${projectId}/preview`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
          >
            Preview ↗
          </a>
          <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      {error && <p className="bg-destructive/10 px-4 py-2 text-xs text-destructive">{error}</p>}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* left: sections */}
        <aside className="w-full shrink-0 border-b border-hairline bg-surface p-3 md:w-64 md:border-b-0 md:border-r">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Sections</h3>
            <span className="text-[11px] text-ink-tertiary">{(design.sections ?? []).length}/24</span>
          </div>
          <div ref={listRef} className="relative select-none" onPointerMove={onListPointerMove} onPointerUp={endDrag} onPointerLeave={endDrag}>
            {(design.sections ?? []).map((s, i) => (
              <div
                key={s.id}
                className={`group flex h-11 items-center gap-2 rounded-lg px-2 text-sm ${selected === s.id ? "bg-surface-2 font-medium text-ink" : "text-ink-muted hover:bg-surface-1"}`}
                onClick={() => {
                  setSelected(s.id);
                  setPane("section");
                  canvasRef.current?.querySelector(`[data-sec="${s.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                style={{ cursor: drag?.id === s.id ? "grabbing" : undefined, opacity: drag?.id === s.id ? 0.6 : 1 }}
              >
                <span
                  role="button"
                  aria-label={`Reorder ${SECTION_LABEL[s.type]}`}
                  className="cursor-grab px-0.5 text-ink-tertiary hover:text-ink"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
                    setDrag({ id: s.id, overIndex: i });
                  }}
                >
                  ⠿
                </span>
                <span aria-hidden className="text-xs">{SECTION_ICON[s.type]}</span>
                <span className="min-w-0 flex-1 truncate">
                  {SECTION_LABEL[s.type]}
                  {s.type === "gallery" && s.heading ? ` · ${s.heading}` : ""}
                </span>
                <span className="hidden items-center gap-0.5 group-hover:flex">
                  <button type="button" aria-label="Duplicate" title="Duplicate" onClick={(e) => { e.stopPropagation(); duplicateSection(s.id); }} className="rounded p-1 text-ink-tertiary hover:text-ink">⧉</button>
                  <button type="button" aria-label="Remove" title="Remove" onClick={(e) => { e.stopPropagation(); removeSection(s.id); }} className="rounded p-1 text-ink-tertiary hover:text-destructive">✕</button>
                </span>
              </div>
            ))}
            {drag?.overIndex !== null && drag && (
              <div className="pointer-events-none absolute inset-x-0 h-0.5 bg-[var(--accent)]" style={{ top: drag.overIndex! * rowH - 2 }} />
            )}
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer rounded-lg bg-surface-1 px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink">+ Add section</summary>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {(["hero", "gallery", "slideshow", "favorites", "text", "contact", ...(collageBlocked ? [] : (["collage"] as const))] as DesignSection["type"][]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => addSection(t)}
                  className="rounded-lg border border-hairline bg-surface-1 px-2 py-2 text-xs font-medium text-ink-muted hover:border-hairline-strong hover:text-ink"
                >
                  {SECTION_ICON[t]} {SECTION_LABEL[t]}
                </button>
              ))}
            </div>
            {collageBlocked && (
              <p className="mt-2 text-[11px] leading-relaxed text-ink-tertiary">
                Collage sections (free photo positioning) are a <Link href="/dashboard/settings/billing" className="underline underline-offset-2">Studio plan</Link> feature.
              </p>
            )}
          </details>
        </aside>

        {/* center: canvas */}
        <div className="min-w-0 flex-1 overflow-y-auto bg-canvas/50 p-4" ref={canvasRef} onClick={onCanvasClick}>
          <div className={`mx-auto bg-canvas shadow-lg ring-1 ring-hairline transition-[width] ${viewport === "mobile" ? "w-[390px] rounded-[24px]" : "w-full max-w-5xl"}`}>
            <GalleryView
              studioName={studioName}
              accent={accent}
              logoUrl={logoUrl}
              contactEmail={contactEmail}
              assets={canvasAssets}
              allowDownload={false}
              expiresAt={null}
              selectionMode="off"
              selectionLimit={null}
              selectionDeadline={null}
              initialFavorites={[]}
              submittedSelection={null}
              clientToken="builder"
              design={design}
              plan={plan}
              fontFamily={fontFamily}
              builder
              onCollageEdit={(sectionId, index, patch) =>
                updateSection(sectionId, (s) =>
                  s.type === "collage" ? { ...s, items: s.items.map((it, j) => (j === index ? { ...it, ...patch } : it)) } : s,
                )
              }
              slideshow={null}
            />
          </div>
          <style>{`[data-sec]:hover { outline: 1px dashed color-mix(in srgb, var(--accent) 45%, transparent); outline-offset: 2px; cursor: pointer; } [data-sec="${selected ?? ""}"] { outline: 2px solid var(--accent) !important; outline-offset: 2px; }`}</style>
        </div>

        {/* right: inspector / theme */}
        <aside className="w-full shrink-0 border-t border-hairline bg-surface p-4 md:w-80 md:border-t-0 md:border-l">
          <div className="mb-3 flex overflow-hidden rounded-lg border border-hairline">
            <button type="button" onClick={() => setPane("section")} className={`flex-1 px-3 py-1.5 text-xs font-medium ${pane === "section" ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink"}`}>Section</button>
            <button type="button" onClick={() => setPane("theme")} className={`flex-1 px-3 py-1.5 text-xs font-medium ${pane === "theme" ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink"}`}>Theme</button>
          </div>

          {pane === "section" ? (
            selectedSection ? (
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-tertiary">{SECTION_LABEL[selectedSection.type]} section</p>
                <CommonControls section={selectedSection} onChange={(patch) => updateSection(selectedSection.id, patch)} />
                {selectedSection.type === "hero" && <HeroControls section={selectedSection} onChange={(patch) => updateSection(selectedSection.id, patch)} assets={assets} onPick={() => setAssetPicker({ sectionId: selectedSection.id, forHero: true })} />}
                {selectedSection.type === "gallery" && <GalleryControls section={selectedSection} onChange={(patch) => updateSection(selectedSection.id, patch)} folders={folders} onPickAssets={() => setAssetPicker({ sectionId: selectedSection.id })} />}
                {selectedSection.type === "slideshow" && <SlideshowControls section={selectedSection} onChange={(patch) => updateSection(selectedSection.id, patch)} folders={folders} onPickAssets={() => setAssetPicker({ sectionId: selectedSection.id })} />}
                {selectedSection.type === "favorites" && <FavoritesControls section={selectedSection} onChange={(patch) => updateSection(selectedSection.id, patch)} />}
                {selectedSection.type === "text" && <TextControls section={selectedSection} onChange={(patch) => updateSection(selectedSection.id, patch)} />}
                {selectedSection.type === "contact" && <ContactControls section={selectedSection} onChange={(patch) => updateSection(selectedSection.id, patch)} />}
                {selectedSection.type === "collage" && <CollageControls section={selectedSection} onChange={(patch) => updateSection(selectedSection.id, patch)} assets={assets} canCollage={canCollage} />}
                {canNav && selectedSection.type !== "collage" && <NavToggle nav={design.nav} onChange={(nav) => update((d) => ({ ...d, nav }))} hasInfo={(design.sections ?? []).some((s) => s.type === "text" || s.type === "contact")} />}
              </div>
            ) : (
              <p className="text-sm text-ink-tertiary">Select a section on the canvas (or add one) to edit it.</p>
            )
          ) : (
            <ThemeControls design={design} onChange={(patch) => update((d) => ({ ...d, theme: { ...d.theme, ...patch } }))} accent={accent} />
          )}
        </aside>
      </div>

      {/* asset picker modal (picks bindings) */}
      {assetPicker && (
        <AssetPickerModal
          assets={assets}
          initialIds={
            assetPicker.forHero
              ? ((design.sections ?? []).find((s) => s.id === assetPicker.sectionId && s.type === "hero") as HeroSection | undefined)?.images.map((i) => i.assetId) ?? []
              : undefined
          }
          onClose={() => setAssetPicker(null)}
          onConfirm={(ids) => {
            updateSection(assetPicker.sectionId, (s) => {
              if (assetPicker.forHero && s.type === "hero") {
                // hero images: chosen order, keep existing focals where the
                // photo survives, default focal for new picks (1–6 by parse cap)
                return { ...s, images: ids.slice(0, 6).map((assetId, i) => ({ assetId, focal: s.images[i]?.focal ?? { x: 0.5, y: 0.4 } })) };
              }
              return s.type === "gallery" || s.type === "slideshow" ? { ...s, binding: { kind: "picks", ids } } : s;
            });
            setAssetPicker(null);
          }}
        />
      )}

      {/* stale-session conflict */}
      {conflict && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-[16px] bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">This design changed elsewhere</h2>
            <p className="mt-2 text-xs leading-relaxed text-ink-subtle">
              Someone saved a different version of this gallery&apos;s design while you were editing (another tab or device). Overwrite theirs, or reload their version and lose your draft?
            </p>
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={() => void save(true)}>Overwrite</Button>
              <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>Reload theirs</Button>
              <Button size="sm" variant="secondary" onClick={() => setConflict(null)}>Keep editing</Button>
            </div>
          </div>
        </div>
      )}

      {/* reset to template */}
      {confirmReset && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-[16px] bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">Reset to the template?</h2>
            <p className="mt-2 text-xs leading-relaxed text-ink-subtle">Your customizations on this page are discarded; the original template look returns. Your photos are untouched.</p>
            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  commit({ ...base });
                  setSelected(base.sections?.[0]?.id ?? null);
                  setConfirmReset(false);
                }}
              >
                Reset
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setConfirmReset(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* phone notice */}
      <p className="border-t border-hairline bg-surface px-4 py-2 text-center text-[11px] text-ink-tertiary md:hidden">
        The page builder is a desktop tool — on your phone, pick a ready template from the gallery tab instead.
      </p>
    </div>
  );
}

/* ---------------- small controls ---------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-tertiary">{label}</span>
      {children}
    </label>
  );
}
const inputCls = "w-full rounded-lg border border-hairline-strong bg-canvas px-2.5 py-1.5 text-sm text-ink outline-none focus:border-[var(--accent)]";
const segCls = "flex overflow-hidden rounded-lg border border-hairline text-xs";

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className={segCls}>
      {options.map((o) => (
        <button key={String(o.v)} type="button" onClick={() => onChange(o.v)} className={`flex-1 px-2 py-1.5 font-medium ${value === o.v ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CommonControls({ section, onChange }: { section: DesignSection; onChange: (patch: Partial<DesignSection>) => void }) {
  return (
    <>
      <Field label="Padding">
        <Seg value={section.padding ?? "normal"} options={PADDINGS.map((p) => ({ v: p, label: p[0].toUpperCase() + p.slice(1) }))} onChange={(v) => onChange({ padding: v })} />
      </Field>
      <Field label="Background">
        <Seg value={section.bg ?? "inherit"} options={BGS.map((b) => ({ v: b, label: BG_LABELS[b] }))} onChange={(v) => onChange({ bg: v as SectionBackground })} />
      </Field>
    </>
  );
}

function BindingControls({ binding, folders, onChange, onPickAssets }: { binding: ImageBinding; folders: { id: string; name: string }[]; onChange: (b: ImageBinding) => void; onPickAssets: () => void }) {
  const kind = binding.kind === "folder" || binding.kind === "rating" || binding.kind === "picks" ? binding.kind : "all";
  return (
    <>
      <Field label="Photos">
        <Seg
          value={kind}
          options={[
            { v: "all", label: "All" },
            { v: "folder", label: "Folder" },
            { v: "rating", label: "Rated" },
            { v: "picks", label: "Picks" },
          ]}
          onChange={(v) => onChange(v === "folder" ? { kind: "folder", name: folders[0]?.name ?? "" } : v === "rating" ? { kind: "rating", min: 4 } : v === "picks" ? { kind: "picks", ids: [] } : { kind: "all" })}
        />
      </Field>
      {binding.kind === "folder" && folders.length > 0 && (
        <Field label="Which folder">
          <select className={inputCls} value={binding.name} onChange={(e) => onChange({ kind: "folder", name: e.target.value })}>
            {folders.map((f) => (
              <option key={f.id} value={f.name}>{f.name}</option>
            ))}
          </select>
        </Field>
      )}
      {binding.kind === "rating" && (
        <Field label="Minimum stars">
          <Seg value={binding.min} options={[3, 4, 5].map((n) => ({ v: n as 3 | 4 | 5, label: `${n}★+` }))} onChange={(v) => onChange({ kind: "rating", min: v })} />
        </Field>
      )}
      {binding.kind === "picks" && (
        <div className="rounded-lg border border-hairline bg-surface-1 p-2.5 text-xs">
          <p className="text-ink-subtle">{binding.ids.length} photo{binding.ids.length === 1 ? "" : "s"} hand-picked{binding.ids.length === 0 ? " — none yet" : ""}</p>
          <button type="button" onClick={onPickAssets} className="mt-1.5 font-semibold text-ink underline underline-offset-2">
            Choose photos…
          </button>
        </div>
      )}
    </>
  );
}

function HeroControls({ section, onChange, assets, onPick }: { section: HeroSection; onChange: (patch: Partial<HeroSection>) => void; assets: BuilderAsset[]; onPick: (images: HeroSection["images"]) => void }) {
  return (
    <>
      <Field label="Style">
        <Seg value={section.style} options={[{ v: "static", label: "Static" }, { v: "kenburns", label: "Ken Burns" }, { v: "split", label: "Split" }, { v: "fullbleed", label: "Full-bleed" }] as { v: HeroSection["style"]; label: string }[]} onChange={(v) => onChange({ style: v })} />
      </Field>
      <Field label="Title">
        <input className={inputCls} value={section.title} onChange={(e) => onChange({ title: e.target.value.slice(0, 80) })} placeholder="{{client_name}} works too" />
      </Field>
      <Field label="Subtitle">
        <input className={inputCls} value={section.subtitle} onChange={(e) => onChange({ subtitle: e.target.value.slice(0, 140) })} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={section.kicker} onChange={(e) => onChange({ kicker: e.target.checked })} /> Show studio name
      </label>
      <div className="rounded-lg border border-hairline bg-surface-1 p-2.5 text-xs">
        <p className="text-ink-subtle">{section.images.length === 0 ? "Text-only hero" : section.images.length === 1 ? "1 cover photo" : `${section.images.length} cover photos (slider)`}</p>
        <button type="button" onClick={() => onPick(section.images)} className="mt-1.5 font-semibold text-ink underline underline-offset-2">
          Choose cover photo{section.images.length >= 2 ? "s" : ""}…
        </button>
      </div>
      {section.images.length >= 2 && (
        <Field label="Auto-advance">
          <Seg value={section.interval} options={[{ v: 0, label: "Off" }, { v: 4, label: "4s" }, { v: 6, label: "6s" }, { v: 8, label: "8s" }] as { v: number; label: string }[]} onChange={(v) => onChange({ interval: v })} />
        </Field>
      )}
    </>
  );
}

function GalleryControls({ section, onChange, folders, onPickAssets }: { section: GallerySection; onChange: (patch: Partial<GallerySection>) => void; folders: { id: string; name: string }[]; onPickAssets: () => void }) {
  return (
    <>
      <Field label="Heading">
        <input className={inputCls} value={section.heading ?? ""} onChange={(e) => onChange({ heading: e.target.value.slice(0, 80) })} placeholder="(none)" />
      </Field>
      <Field label="Layout">
        <Seg value={section.layout} options={[{ v: "grid", label: "Grid" }, { v: "masonry", label: "Masonry" }, { v: "cascade", label: "Cascade" }] as { v: GalleryLayout; label: string }[]} onChange={(v) => onChange({ layout: v })} />
      </Field>
      <Field label="Columns (desktop)">
        <Seg value={section.columns?.md ?? 4} options={[2, 3, 4, 5].map((n) => ({ v: n, label: String(n) }))} onChange={(v) => onChange({ columns: { ...(section.columns ?? {}), md: v } as ColumnCounts })} />
      </Field>
      <BindingControls binding={section.binding} folders={folders} onChange={(binding) => onChange({ binding })} onPickAssets={onPickAssets} />
    </>
  );
}

function SlideshowControls({ section, onChange, folders, onPickAssets }: { section: SlideshowSection; onChange: (patch: Partial<SlideshowSection>) => void; folders: { id: string; name: string }[]; onPickAssets: () => void }) {
  return (
    <>
      <Field label="Heading">
        <input className={inputCls} value={section.heading ?? ""} onChange={(e) => onChange({ heading: e.target.value.slice(0, 80) })} placeholder="(none)" />
      </Field>
      <Field label="Poster strip">
        <Seg value={section.posters} options={[3, 4, 6, 8].map((n) => ({ v: n, label: `${n}` }))} onChange={(v) => onChange({ posters: v })} />
      </Field>
      <BindingControls binding={section.binding} folders={folders} onChange={(binding) => onChange({ binding })} onPickAssets={onPickAssets} />
    </>
  );
}

function FavoritesControls({ section, onChange }: { section: FavoritesSection; onChange: (patch: Partial<FavoritesSection>) => void }) {
  return (
    <>
      <Field label="Heading">
        <input className={inputCls} value={section.heading ?? ""} onChange={(e) => onChange({ heading: e.target.value.slice(0, 80) })} placeholder="Your favorites" />
      </Field>
      <Field label="Empty hint">
        <textarea className={`${inputCls} h-16`} value={section.emptyHint ?? ""} onChange={(e) => onChange({ emptyHint: e.target.value.slice(0, 160) })} placeholder="Heart the photos you love…" />
      </Field>
    </>
  );
}

function TextControls({ section, onChange }: { section: TextSection; onChange: (patch: Partial<TextSection>) => void }) {
  return (
    <>
      <Field label="Content (simple formatting)">
        <textarea
          className={`${inputCls} h-28 font-mono text-xs`}
          value={section.html}
          onChange={(e) => onChange({ html: sanitizeRichText(e.target.value.slice(0, 8000)) })}
        />
      </Field>
      <p className="text-[11px] leading-relaxed text-ink-tertiary">Allowed: paragraphs, bold, italics, links. Merge fields like {"{{client_name}}"} work.</p>
      <Field label="Align">
        <Seg value={section.align} options={[{ v: "left", label: "Left" }, { v: "center", label: "Center" }] as { v: TextSection["align"]; label: string }[]} onChange={(v) => onChange({ align: v })} />
      </Field>
    </>
  );
}

function ContactControls({ section, onChange }: { section: ContactSection; onChange: (patch: Partial<ContactSection>) => void }) {
  return (
    <>
      <Field label="Heading">
        <input className={inputCls} value={section.heading ?? ""} onChange={(e) => onChange({ heading: e.target.value.slice(0, 80) })} placeholder="Get in touch" />
      </Field>
      <Field label="Body">
        <textarea className={`${inputCls} h-16`} value={section.body ?? ""} onChange={(e) => onChange({ body: e.target.value.slice(0, 400) })} placeholder="Questions? We're one email away." />
      </Field>
      <Field label="Button label">
        <input className={inputCls} value={section.ctaLabel ?? ""} onChange={(e) => onChange({ ctaLabel: e.target.value.slice(0, 40) })} placeholder="(your studio email)" />
      </Field>
      <Field label="Button link">
        <input className={inputCls} value={section.ctaHref ?? ""} onChange={(e) => onChange({ ctaHref: e.target.value.slice(0, 300) })} placeholder="https://… or mailto:…" />
      </Field>
    </>
  );
}

/** WEB-322 — collage editor: position/size/rotation/z per item + add/remove.
 * Coordinates are the same percents the renderer draws — one schema, zero
 * drift. Free-positioning on the canvas section itself arrives with the
 * pointer-drag editor; these numeric controls are the schema-true base. */
function CollageControls({ section, onChange, assets, canCollage }: { section: CollageSection; onChange: (patch: Partial<CollageSection>) => void; assets: BuilderAsset[]; canCollage: boolean }) {
  const byId = new Map(assets.map((a) => [a.id, a]));
  return (
    <div className="space-y-3">
      <Field label="Section shape">
        <Seg value={section.aspect} options={(["3/2", "4/3", "1/1", "16/9"] as const).map((a) => ({ v: a, label: a }))} onChange={(v) => onChange({ aspect: v })} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={section.mobileStack} onChange={(e) => onChange({ mobileStack: e.target.checked })} /> Stack on phones (readable)
      </label>
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-tertiary">Photos ({section.items.length}/12)</p>
      <div className="space-y-2">
        {section.items.map((it, i) => (
          <div key={i} className="rounded-lg border border-hairline bg-surface-1 p-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-ink-subtle">{byId.get(it.assetId)?.filename ?? "photo"}</span>
              <span className="flex gap-1">
                <button type="button" aria-label="Move up in z-order" onClick={() => onChange({ items: section.items.map((x, j) => (j === i ? { ...x, z: Math.min(11, x.z + 1) } : x)) })} className="rounded p-1 text-ink-tertiary hover:text-ink" title="Bring forward">↑</button>
                <button type="button" aria-label="Move down in z-order" onClick={() => onChange({ items: section.items.map((x, j) => (j === i ? { ...x, z: Math.max(0, x.z - 1) } : x)) })} className="rounded p-1 text-ink-tertiary hover:text-ink" title="Send back">↓</button>
                <button type="button" aria-label="Remove" onClick={() => onChange({ items: section.items.filter((_, j) => j !== i) })} className="rounded p-1 text-ink-tertiary hover:text-destructive">✕</button>
              </span>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {(["x", "y", "w"] as const).map((k) => (
                <label key={k} className="text-[10px] text-ink-tertiary">
                  {k === "w" ? "width %" : `${k} %`}
                  <input type="number" className={`${inputCls} py-1`} value={it[k]} min={0} max={100} onChange={(e) => onChange({ items: section.items.map((x, j) => (j === i ? { ...x, [k]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } : x)) })} />
                </label>
              ))}
              <label className="text-[10px] text-ink-tertiary">
                rot ±15°
                <input type="number" className={`${inputCls} py-1`} value={it.rotation} min={-15} max={15} onChange={(e) => onChange({ items: section.items.map((x, j) => (j === i ? { ...x, rotation: Math.max(-15, Math.min(15, Number(e.target.value) || 0)) } : x)) })} />
              </label>
            </div>
          </div>
        ))}
      </div>
      {section.items.length < 12 && (
        <select
          className={inputCls}
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            onChange({ items: [...section.items, { assetId: id, x: (section.items.length % 3) * 30 + 4, y: 8, w: 30, rotation: 0, z: section.items.length, focal: { x: 0.5, y: 0.5 } }] });
          }}
        >
          <option value="">+ Add a photo…</option>
          {assets.slice(0, 60).map((a) => (
            <option key={a.id} value={a.id}>{a.filename}</option>
          ))}
        </select>
      )}
      {!canCollage && <p className="text-[11px] text-ink-tertiary">Saving a design with collage needs Studio.</p>}
    </div>
  );
}

function NavToggle({ nav, onChange, hasInfo }: { nav: DesignNav | undefined; onChange: (nav: DesignNav | undefined) => void; hasInfo: boolean }) {
  const enabled = nav?.enabled ?? false;
  return (
    <div className="rounded-lg border border-hairline bg-surface-1 p-2.5 text-xs">
      <label className="flex items-center gap-2 font-medium text-ink">
        <input type="checkbox" checked={enabled} onChange={(e) => onChange(e.target.checked ? { enabled: true, items: hasInfo ? ["gallery", "favorites", "info"] : ["gallery", "favorites"] } : undefined)} /> Menu bar (Gallery / Favorites{hasInfo ? " / Info" : ""})
      </label>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-tertiary">Tabs at the top of the client gallery; without it everything scrolls as one page.</p>
    </div>
  );
}

/** WEB-322 — typography + theme colors (the font selector renders each
 * family in its own face from the self-hosted pack). */
function ThemeControls({ design, onChange, accent }: { design: GalleryDesign; onChange: (patch: Partial<GalleryDesign["theme"]>) => void; accent: string }) {
  const t = design.theme;
  return (
    <div className="space-y-4">
      <Field label="Font">
        <select className={inputCls} value={t.font ?? "system"} onChange={(e) => onChange(e.target.value === "system" ? {} : { font: e.target.value })}>
          <option value="system">System (default)</option>
          {FONT_PACK.map((f) => (
            <option key={f.key} value={f.key} style={{ fontFamily: f.stack }}>
              {f.family}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`Type scale — ${t.fontScale ?? 1}×`}>
        <input type="range" min={0.8} max={1.4} step={0.05} value={t.fontScale ?? 1} onChange={(e) => onChange({ fontScale: Number(e.target.value) })} className="w-full" />
      </Field>
      <Field label="Letter spacing">
        <Seg value={t.tracking ?? "normal"} options={[{ v: "tight", label: "Tight" }, { v: "normal", label: "Normal" }, { v: "wide", label: "Wide" }] as { v: "tight" | "normal" | "wide"; label: string }[]} onChange={(v) => onChange(v === "normal" ? {} : { tracking: v })} />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        {(["bg", "text", "accent"] as const).map((k) => (
          <Field key={k} label={k === "bg" ? "Page" : k === "text" ? "Text" : "Accent"}>
            <input
              type="color"
              className="h-8 w-full cursor-pointer rounded-lg border border-hairline bg-canvas"
              value={t.colors?.[k] ?? (k === "accent" ? accent : k === "text" ? "#0f1011" : "#ffffff")}
              onChange={(e) => onChange({ colors: { ...t.colors, [k]: e.target.value } })}
            />
          </Field>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange({ colors: { accent } })}
        className="w-full rounded-lg border border-hairline px-3 py-2 text-xs font-medium text-ink-muted hover:text-ink"
      >
        Match my brand ({accent})
      </button>
      <Field label="Corner radius">
        <Seg value={t.radius} options={[{ v: "0px", label: "Sharp" }, { v: "8px", label: "Soft" }, { v: "16px", label: "Round" }] as { v: GalleryDesign["theme"]["radius"]; label: string }[]} onChange={(v) => onChange({ radius: v })} />
      </Field>
      <Field label="Photo captions">
        <Seg value={t.captions} options={[{ v: "off", label: "Off" }, { v: "hover", label: "Hover" }, { v: "always", label: "Always" }] as { v: GalleryDesign["theme"]["captions"]; label: string }[]} onChange={(v) => onChange({ captions: v })} />
      </Field>
    </div>
  );
}

/** Grid-of-thumbs picker for picks bindings (chosen ids, ordered). */
function AssetPickerModal({ assets, initialIds, onConfirm, onClose }: { assets: BuilderAsset[]; initialIds?: string[]; onConfirm: (ids: string[]) => void; onClose: () => void }) {
  const [ids, setIds] = useState<string[]>(initialIds ?? []);
  const toggle = (id: string) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 60 ? [...cur, id] : cur));
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-[16px] bg-surface p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Choose photos ({ids.length} selected)</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={() => onConfirm(ids)}>Use {ids.length || "none"}</Button>
          </div>
        </div>
        <div className="mt-3 grid flex-1 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
          {assets.slice(0, 60).map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => toggle(a.id)}
              className={`relative block aspect-square overflow-hidden rounded-lg border-2 ${ids.includes(a.id) ? "border-[var(--accent)]" : "border-transparent"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- authorized proxy */}
              <img src={`/api/assets/${a.id}?variant=thumb`} alt={a.filename} loading="lazy" className="h-full w-full object-cover" />
              {ids.includes(a.id) && <span className="absolute right-1 top-1 rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-bold text-white">{ids.indexOf(a.id) + 1}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";

/* Shared gallery preview (WEB-286) — ONE renderer used everywhere a gallery
 * design is shown: the project designer (real photo tiles), and the
 * Templates → Gallery styles editor (sample tiles), in BOTH desktop and
 * mobile frames so photographers see exactly what clients see. Same shape
 * rules as the public render: hero styles, three layouts, theme vars. */
import { focalPosition, themeVars, type GalleryDesign } from "@/lib/gallery-design";

export type PreviewTile = { url: string | null };

/** Deterministic placeholder art — a gallery STYLE controls cover/layout/
 * theme, not the photos, so tasteful gradients demo the style faithfully. */
const HUES = [212, 268, 322, 24, 42, 172, 190, 248];

function PlaceholderTile({ i }: { i: number }) {
  const h = HUES[i % HUES.length];
  return <div className="h-full w-full" style={{ background: `linear-gradient(135deg, hsl(${h} 52% 72%), hsl(${(h + 38) % 360} 46% 46%))` }} />;
}

export function GalleryPreview({ design, tiles = [], frame }: { design: GalleryDesign; tiles?: PreviewTile[]; frame: "mobile" | "desktop" }) {
  const c = design.cover;
  const radiusCls = ({ "0px": "rounded-none", "8px": "rounded-[8px]", "16px": "rounded-[16px]" } as const)[design.theme.radius];
  const desktop = frame === "desktop";
  const pad = desktop ? "p-5" : "p-3";
  const gap = desktop ? "gap-2.5" : "gap-1.5";
  const cols = desktop ? "grid-cols-4" : "grid-cols-3";
  const label = desktop ? "text-[9px]" : "text-[7px]";
  const title = desktop ? "text-2xl" : "text-base";

  const tile = (aspect: number | null, i: number) => {
    const t = tiles.length ? tiles[i % tiles.length] : null;
    return (
      <div key={i} className={`overflow-hidden bg-surface-2 ${radiusCls}${aspect === null ? " h-full w-full" : ""}`} style={aspect !== null ? { aspectRatio: String(aspect) } : undefined}>
        {t?.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- authorized proxy / sample art
          <img src={t.url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <PlaceholderTile i={i} />
        )}
      </div>
    );
  };

  const coverUrl = c?.assetId ? `/api/assets/${c.assetId}?variant=thumb` : null;
  const coverImg = (cls: string, kenburns: boolean) =>
    coverUrl ? (
      // eslint-disable-next-line @next/next/no-img-element -- authorized proxy
      <img src={coverUrl} alt="" className={`absolute inset-0 h-full w-full object-cover ${cls}${kenburns ? " snap-kenburns" : ""}`} style={{ objectPosition: focalPosition(c!.focal) }} />
    ) : (
      <div className="absolute inset-0 bg-gradient-to-br from-[#5e6ad2] to-[#22222b]" />
    );

  return (
    <div className="bg-canvas">
      {c && (c.title || c.subtitle || coverUrl) && (
        <div className="relative">
          {c.style === "split" ? (
            <div className={`grid ${desktop ? "grid-cols-[1.7fr_1fr]" : "grid-cols-[1.6fr_1fr]"}`}>
              <div className={`relative ${desktop ? "aspect-[16/8]" : "aspect-[4/3]"}`}>{coverImg("", false)}</div>
              <div className="flex flex-col justify-center bg-surface-2 p-3" style={{ color: "var(--ink)" }}>
                <span className={`${label} font-semibold uppercase tracking-[0.2em] opacity-70`}>Studio</span>
                <span className={`mt-1 ${desktop ? "text-lg" : "text-[13px]"} font-semibold leading-tight`}>{c.title || "Title"}</span>
                <span className={`mt-1 ${desktop ? "text-xs" : "text-[9px]"} leading-snug opacity-75`}>{c.subtitle || "Subtitle"}</span>
              </div>
            </div>
          ) : (
            <div className={`relative ${desktop ? "aspect-[21/9]" : "aspect-[16/10]"}`}>
              {coverImg("", c.style === "kenburns")}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className={`absolute inset-x-0 bottom-0 ${desktop ? "p-5" : "p-3"} text-white`}>
                <span className={`${label} font-semibold uppercase tracking-[0.2em] opacity-80`}>Studio</span>
                <div className={`mt-0.5 ${title} font-semibold leading-tight`}>{c.title || "Title"}</div>
                <div className={`${desktop ? "text-xs" : "text-[9px]"} opacity-85`}>{c.subtitle || "Subtitle"}</div>
              </div>
            </div>
          )}
        </div>
      )}
      <div className={pad}>
        <div className="mb-2 flex items-center justify-between">
          <span className={`${desktop ? "text-xs" : "text-[10px]"} font-medium`} style={{ color: "var(--ink)" }}>
            Favorites
          </span>
          <span className={`${desktop ? "text-[10px]" : "text-[8px]"}`} style={{ color: "var(--ink)" }}>
            24 items
          </span>
        </div>
        {design.layout === "grid" && (
          <div className={`grid ${cols} ${gap}`}>{(desktop ? [1, 1, 1, 1, 1, 1, 1, 1] : [1, 1, 1, 1, 1, 1]).map((a, i) => tile(a, i))}</div>
        )}
        {design.layout === "masonry" && (
          <div className={`${desktop ? "columns-4" : "columns-3"} ${gap}`}>
            {[4 / 5, 3 / 2, 1, 4 / 5, 1, 3 / 2, 4 / 5, 1].map((a, i) => (
              <div key={i} className="mb-1.5">
                {tile(a, i)}
              </div>
            ))}
          </div>
        )}
        {design.layout === "cascade" && (
          <div className={`flex flex-col ${gap}`}>
            <div className={`flex ${gap}`}>
              {[1.5, 1, 1.1].map((a, i) => (
                <div key={i} className={`${desktop ? "h-24" : "h-16"} flex-1 overflow-hidden`} style={{ flexGrow: a, flexBasis: 0 }}>
                  {tile(null, i)}
                </div>
              ))}
            </div>
            <div className={`flex ${gap}`}>
              {[1, 1.4].map((a, i) => (
                <div key={i} className={`${desktop ? "h-24" : "h-16"} flex-1 overflow-hidden`} style={{ flexGrow: a, flexBasis: 0 }}>
                  {tile(null, i + 3)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Both frames side by side — the style editor's live preview. */
export function GalleryDualPreview({ design, tiles }: { design: GalleryDesign; tiles?: PreviewTile[] }) {
  const vars = themeVars(design.theme.background);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-xs text-ink-tertiary">Desktop — what families open on a laptop</p>
        <div
          className="overflow-hidden rounded-xl border border-hairline shadow-lg"
          style={{ ["--accent" as string]: "#5e6ad2", ...vars } as React.CSSProperties}
        >
          <GalleryPreview design={design} tiles={tiles} frame="desktop" />
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs text-ink-tertiary">Mobile — what they share on WhatsApp</p>
        <div className="flex justify-center">
          <div
            className="w-[280px] overflow-hidden rounded-[32px] border-[6px] border-ink/80 shadow-xl"
            style={{ ["--accent" as string]: "#5e6ad2", ...vars } as React.CSSProperties}
          >
            <GalleryPreview design={design} tiles={tiles} frame="mobile" />
          </div>
        </div>
      </div>
    </div>
  );
}

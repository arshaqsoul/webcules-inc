"use client";

/* File-type icon (WEB-223): every non-previewable file gets a proper visual
 * instead of a bare "raw"/"video" word — app-specific icons for the studio
 * formats (Photoshop, Illustrator, After Effects, PDF, audio…) and category
 * icons for images/RAW/video. Renders the extension as a small badge so two
 * formats sharing an icon stay distinguishable. */
import { Aperture, Clapperboard, File, FileText, Film, Image, Layers, Music, PenTool, Shapes } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const EXT_ICON: Record<string, { icon: LucideIcon; tint: string; label: string }> = {
  psd: { icon: Layers, tint: "text-sky-500", label: "Photoshop" },
  psb: { icon: Layers, tint: "text-sky-500", label: "Photoshop" },
  ai: { icon: PenTool, tint: "text-orange-500", label: "Illustrator" },
  ait: { icon: PenTool, tint: "text-orange-500", label: "Illustrator" },
  eps: { icon: PenTool, tint: "text-orange-500", label: "EPS" },
  aep: { icon: Clapperboard, tint: "text-violet-500", label: "After Effects" },
  aepx: { icon: Clapperboard, tint: "text-violet-500", label: "After Effects" },
  prproj: { icon: Clapperboard, tint: "text-violet-500", label: "Premiere" },
  indd: { icon: FileText, tint: "text-rose-500", label: "InDesign" },
  pdf: { icon: FileText, tint: "text-red-500", label: "PDF" },
  svg: { icon: Shapes, tint: "text-amber-500", label: "SVG" },
  tif: { icon: Aperture, tint: "text-emerald-600", label: "TIFF" },
  tiff: { icon: Aperture, tint: "text-emerald-600", label: "TIFF" },
  mp3: { icon: Music, tint: "text-pink-500", label: "Audio" },
  wav: { icon: Music, tint: "text-pink-500", label: "Audio" },
  m4a: { icon: Music, tint: "text-pink-500", label: "Audio" },
  aif: { icon: Music, tint: "text-pink-500", label: "Audio" },
  aiff: { icon: Music, tint: "text-pink-500", label: "Audio" },
  flac: { icon: Music, tint: "text-pink-500", label: "Audio" },
};

const KIND_ICON: Record<string, { icon: LucideIcon; tint: string; label: string }> = {
  image: { icon: Image, tint: "text-ink-tertiary", label: "Image" },
  video: { icon: Film, tint: "text-indigo-500", label: "Video" },
  raw: { icon: Aperture, tint: "text-amber-600", label: "RAW" },
  other: { icon: File, tint: "text-ink-tertiary", label: "File" },
};

export function FileTypeIcon({
  kind,
  filename,
  className = "h-7 w-7",
  badge = true,
}: {
  kind: string;
  filename: string;
  /** Icon size class. */
  className?: string;
  /** Show the extension under the icon. */
  badge?: boolean;
}) {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  const def = EXT_ICON[ext] ?? KIND_ICON[kind] ?? KIND_ICON.other;
  const Icon = def.icon;
  return (
    <span className="pointer-events-none flex select-none flex-col items-center justify-center gap-1" aria-hidden>
      <Icon className={`${className} ${def.tint}`} />
      {badge && <span className="text-[9px] font-medium uppercase tracking-wide text-ink-tertiary">{ext || def.label}</span>}
    </span>
  );
}

import fs from "node:fs";
import path from "node:path";
import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";
import { ensureDir, projPath } from "./util.ts";
import type { Post, ProjectManifest } from "./types.ts";

/**
 * Creative compositor: takes a generated background (or a solid brand field) and lays
 * platform-spec typography over it — crisp vector text over AI art, the way real ad
 * tools do it. Outputs platform-ready PNG/JPEG (+ PDF for LinkedIn documents).
 */

export type RenderedFile = { path: string; kind: "image" | "pdf"; spec: string };

// ---------- primitives ----------

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function roundRect(c: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawCover(c: SKRSContext2D, img: any, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  c.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function wrap(c: SKRSContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (c.measureText(t).width > maxWidth && line) {
        out.push(line);
        line = w;
      } else line = t;
    }
    out.push(line);
  }
  return out;
}

/** Find the largest font size where text fits (maxLines × maxWidth × maxHeight). */
function fit(c: SKRSContext2D, text: string, opts: { maxWidth: number; maxLines: number; lineHeight: number; family: string; weight?: number; max: number; min: number }): { size: number; lines: string[] } {
  for (let size = opts.max; size >= opts.min; size -= 2) {
    c.font = `${opts.weight ?? ""} ${size}px "${opts.family}"`.trim();
    const lines = wrap(c, text, opts.maxWidth);
    if (lines.length <= opts.maxLines && lines.every((l) => c.measureText(l).width <= opts.maxWidth)) {
      return { size, lines };
    }
  }
  c.font = `${opts.weight ?? ""} ${opts.min}px "${opts.family}"`.trim();
  return { size: opts.min, lines: wrap(c, text, opts.maxWidth) };
}

function brandChip(c: SKRSContext2D, m: ProjectManifest, x: number, y: number, scale = 1) {
  const label = m.brand.business.toUpperCase();
  c.font = `700 ${26 * scale}px "${m.brand.fontBody}"`;
  const w = c.measureText(label).width + 44 * scale;
  c.fillStyle = m.brand.accent;
  roundRect(c, x, y, w, 52 * scale, 26 * scale);
  c.fill();
  c.fillStyle = "#FFFFFF";
  c.textBaseline = "middle";
  c.fillText(label, x + 22 * scale, y + 27 * scale);
}

function ctaPill(c: SKRSContext2D, m: ProjectManifest, label: string, w: number, y: number, scale = 1) {
  c.font = `700 ${32 * scale}px "${m.brand.fontBody}"`;
  const tw = c.measureText(label).width;
  const pw = Math.min(w - 120 * scale, tw + 72 * scale);
  const x = (w - pw) / 2;
  c.fillStyle = m.brand.accent;
  roundRect(c, x, y, pw, 76 * scale, 38 * scale);
  c.fill();
  // drop shadow-ish border
  c.strokeStyle = hexToRgba("#000000", 0.18);
  c.lineWidth = 2;
  roundRect(c, x, y, pw, 76 * scale, 38 * scale);
  c.stroke();
  c.fillStyle = "#FFFFFF";
  c.textBaseline = "middle";
  c.fillText(label, x + pw / 2 - tw / 2, y + 40 * scale);
  return y + 76 * scale;
}

function scrim(c: SKRSContext2D, w: number, h: number, dark: string, from = 0.32, to = 0.88) {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, hexToRgba(dark, from));
  g.addColorStop(1, hexToRgba(dark, to));
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

async function loadBg(m: ProjectManifest, bgPath: string | undefined, w: number, h: number): Promise<any | null> {
  if (bgPath && /\\.(png|jpe?g|webp)$/i.test(bgPath)) {
    const abs = path.isAbsolute(bgPath) ? bgPath : projPath(m.slug, bgPath);
    if (fs.existsSync(abs)) return await loadImage(abs);
  }
  return null;
}

// ---------- layouts ----------

export const SPECS = {
  igFeed: { w: 1080, h: 1350, spec: "Instagram feed 1080×1350 (4:5)" },
  square: { w: 1080, h: 1080, spec: "Square 1080×1080 (FB/IG)" },
  fbLink: { w: 1200, h: 627, spec: "Facebook link card 1200×627" },
  vertical: { w: 1080, h: 1920, spec: "9:16 1080×1920 (reels/TikTok/status)" },
  slide: { w: 1080, h: 1350, spec: "Carousel/document slide 1080×1350" },
};

/** Big-hook hero layout (feed, square, link card, vertical). */
async function renderHero(m: ProjectManifest, opts: { headline: string; sub?: string; cta?: string; bg?: string | null; w: number; h: number; vertical?: boolean }): Promise<Buffer> {
  const { w, h } = opts;
  const canvas = createCanvas(w, h);
  const c = canvas.getContext("2d");
  const bg = await loadBg(m, opts.bg ?? undefined, w, h);
  if (bg) {
    drawCover(c, bg, w, h);
    scrim(c, w, h, m.brand.dark, opts.vertical ? 0.22 : 0.3, 0.92);
  } else {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, m.brand.dark);
    g.addColorStop(1, hexToRgba(m.brand.accent, 0.85));
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }

  const M = Math.round(w * 0.075);
  brandChip(c, m, M, M, w / 1080);

  const ctaH = opts.cta ? 76 * (w / 1080) + 40 : 0;
  const maxTextH = h - M * 2 - 52 * (w / 1080) - ctaH - (opts.sub ? 90 : 0);
  const { size, lines } = fit(c, opts.headline, {
    maxWidth: w - M * 2,
    maxLines: opts.vertical ? 6 : 5,
    lineHeight: 1.12,
    family: m.brand.fontDisplay,
    max: Math.round(w * (opts.vertical ? 0.082 : 0.075)),
    min: Math.round(w * 0.034),
  });
  const lh = size * 1.14;
  const blockH = lines.length * lh + (opts.sub ? 74 * (w / 1080) : 0);
  let y = opts.vertical ? (h - blockH) / 2 - 40 : h - M - ctaH - blockH - 30;
  y = Math.max(y, M + 90);

  c.textBaseline = "top";
  c.fillStyle = "#FFFFFF";
  c.shadowColor = hexToRgba(m.brand.dark, 0.45);
  c.shadowBlur = 24;
  for (const line of lines) {
    c.fillText(line, M, y);
    y += lh;
  }
  c.shadowBlur = 0;

  if (opts.sub) {
    const subSize = Math.max(28, size * 0.36);
    c.font = `400 ${subSize}px "${m.brand.fontBody}"`;
    c.fillStyle = hexToRgba("#FFFFFF", 0.92);
    const subLines = wrap(c, opts.sub, w - M * 2).slice(0, 3);
    for (const line of subLines) {
      c.fillText(line, M, y + 14);
      y += subSize * 1.3;
    }
    y += 26;
  }

  if (opts.cta) ctaPill(c, m, opts.cta, w, h - M - 76 * (w / 1080), w / 1080);
  return canvas.encode("png");
}

/** Carousel / document slide. idx 0 = cover (image/brand bg), others = light content bg. */
async function renderSlide(m: ProjectManifest, opts: { title: string; text: string; idx: number; total: number; bg?: string | null }): Promise<Buffer> {
  const { w, h } = SPECS.slide;
  const canvas = createCanvas(w, h);
  const c = canvas.getContext("2d");

  if (opts.idx === 0) {
    const bg = await loadBg(m, opts.bg ?? undefined, w, h);
    if (bg) {
      drawCover(c, bg, w, h);
      scrim(c, w, h, m.brand.dark, 0.34, 0.9);
    } else {
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, m.brand.dark);
      g.addColorStop(1, hexToRgba(m.brand.accent, 0.85));
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
    const M = 84;
    brandChip(c, m, M, M, 1);

    const { size, lines } = fit(c, opts.title, { maxWidth: w - M * 2, maxLines: 5, lineHeight: 1.12, family: m.brand.fontDisplay, max: 84, min: 40 });
    const lh = size * 1.16;
    let y = h * 0.52;
    c.textBaseline = "top";
    c.fillStyle = "#FFFFFF";
    c.shadowColor = hexToRgba(m.brand.dark, 0.45);
    c.shadowBlur = 22;
    for (const line of lines) {
      c.fillText(line, M, y);
      y += lh;
    }
    c.shadowBlur = 0;
    c.font = `700 34px "${m.brand.fontBody}"`;
    c.fillStyle = m.brand.accent2;
    c.fillText("SWIPE →", M, Math.min(y + 40, h - 120));
  } else {
    c.fillStyle = "#FFFFFF";
    c.fillRect(0, 0, w, h);
    c.fillStyle = m.brand.dark;
    c.fillRect(0, 0, w, 18);
    const M = 96;
    c.font = `900 30px "${m.brand.fontBody}"`;
    c.fillStyle = m.brand.accent;
    c.fillText(`${String(opts.idx + 1).padStart(2, "0")} / ${opts.total}`, M, 110);

    const { size, lines } = fit(c, opts.title, { maxWidth: w - M * 2, maxLines: 4, lineHeight: 1.1, family: m.brand.fontDisplay, max: 72, min: 40 });
    let y = 190;
    c.textBaseline = "top";
    c.fillStyle = m.brand.dark;
    for (const line of lines) {
      c.fillText(line, M, y);
      y += size * 1.2;
    }
    y += 26;

    const bodySize = 40;
    c.font = `400 ${bodySize}px "${m.brand.fontBody}"`;
    c.fillStyle = hexToRgba(m.brand.dark, 0.86);
    const bodyLines = wrap(c, opts.text, w - M * 2);
    for (const line of bodyLines.slice(0, 14)) {
      c.fillText(line, M, y);
      y += bodySize * 1.42;
    }

    c.font = `700 28px "${m.brand.fontBody}"`;
    c.fillStyle = hexToRgba(m.brand.dark, 0.55);
    c.fillText(`${m.brand.business.toUpperCase()} · ${m.offer.ctaLabel.toUpperCase()}`, M, h - 96);
    // progress dots
    const dotR = 7;
    const gap = 26;
    const totalW = opts.total * gap;
    for (let i = 0; i < opts.total; i++) {
      c.beginPath();
      c.arc(w - M - totalW + i * gap + dotR, h - 82, dotR, 0, Math.PI * 2);
      c.fillStyle = i <= opts.idx ? m.brand.accent : hexToRgba(m.brand.dark, 0.15);
      c.fill();
    }
  }
  return canvas.encode("png");
}

// ---------- post assembly ----------

async function pickBackground(m: ProjectManifest, post: Post, explicit?: string): Promise<string | undefined> {
  if (explicit) return explicit;
  const role = post.assets.find((a) => a.role === "background");
  if (role) return role.path;
  // newest generated image in the project, matching orientation loosely
  const imgDir = projPath(m.slug, "assets", "images");
  if (!fs.existsSync(imgDir)) return undefined;
  const cands = fs.readdirSync(imgDir).filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f)).sort().reverse();
  return cands[0] ? `assets/images/${cands[0]}` : undefined;
}

/** Render every creative file a post needs into posts/<id>/exports/. */
export async function assemblePost(m: ProjectManifest, post: Post, opts: { bg?: string } = {}): Promise<RenderedFile[]> {
  const outDir = projPath(m.slug, "posts", post.id, "exports");
  ensureDir(outDir);
  const bg = await pickBackground(m, post, opts.bg);
  const files: RenderedFile[] = [];
  const write = (name: string, buf: Buffer, spec: string, kind: "image" | "pdf" = "image") => {
    fs.writeFileSync(path.join(outDir, name), buf);
    files.push({ path: `posts/${post.id}/exports/${name}`, kind, spec });
  };

  const hook = post.hook;
  const cta = post.cta.label;

  switch (`${post.platform}:${post.format}`) {
    case "instagram:feed":
      write(`${post.id}_feed_1080x1350.png`, await renderHero(m, { headline: hook, sub: m.offer.promise, cta, bg, ...SPECS.igFeed }), SPECS.igFeed.spec);
      break;
    case "instagram:carousel": {
      const slides = (post.copy.slides ?? []) as { title: string; text: string }[];
      for (let i = 0; i < slides.length; i++) {
        write(`${post.id}_slide${i + 1}_1080x1350.png`, await renderSlide(m, { ...slides[i]!, idx: i, total: slides.length, bg: i === 0 ? bg : undefined }), SPECS.slide.spec);
      }
      break;
    }
    case "instagram:reel":
      write(`${post.id}_cover_1080x1920.png`, await renderHero(m, { headline: post.copy.coverText ?? hook, sub: m.offer.promise, cta, bg, ...SPECS.vertical, vertical: true }), SPECS.vertical.spec);
      break;
    case "facebook:post":
      write(`${post.id}_feed_1080x1080.png`, await renderHero(m, { headline: hook, sub: post.copy.headline, cta, bg, ...SPECS.square }), SPECS.square.spec);
      write(`${post.id}_linkcard_1200x627.png`, await renderHero(m, { headline: post.copy.headline ?? hook, sub: post.copy.description, cta, bg, ...SPECS.fbLink }), SPECS.fbLink.spec);
      break;
    case "facebook:video":
      write(`${post.id}_thumb_1080x1080.png`, await renderHero(m, { headline: hook, cta, bg, ...SPECS.square }), SPECS.square.spec);
      break;
    case "tiktok:video":
      write(`${post.id}_cover_1080x1920.png`, await renderHero(m, { headline: hook, cta: "Link in bio", bg, ...SPECS.vertical, vertical: true }), SPECS.vertical.spec);
      break;
    case "linkedin:text":
      // text-only post — render an OG-style card for shares
      write(`${post.id}_og_1200x627.png`, await renderHero(m, { headline: hook, sub: m.offer.promise, cta, bg, ...SPECS.fbLink }), SPECS.fbLink.spec);
      break;
    case "linkedin:document": {
      const pages = (post.copy.pages ?? []) as { title: string; text: string }[];
      const pngs: Buffer[] = [];
      for (let i = 0; i < pages.length; i++) {
        const buf = await renderSlide(m, { ...pages[i]!, idx: i, total: pages.length, bg: i === 0 ? bg : undefined });
        pngs.push(buf);
        write(`${post.id}_page${i + 1}_1080x1350.png`, buf, SPECS.slide.spec);
      }
      const pdf = await PDFDocument.create();
      for (const png of pngs) {
        const img = await pdf.embedPng(png);
        const page = pdf.addPage([540, 675]);
        page.drawImage(img, { x: 0, y: 0, width: 540, height: 675 });
      }
      write(`${post.id}_document_540x675.pdf`, Buffer.from(await pdf.save()), "LinkedIn document PDF (1080×1350 ratio)", "pdf");
      break;
    }
    case "whatsapp:broadcast":
      write(`${post.id}_promo_1080x1350.png`, await renderHero(m, { headline: hook, sub: m.offer.promo ?? m.offer.promise, cta, bg, ...SPECS.igFeed }), SPECS.igFeed.spec);
      break;
    case "whatsapp:status":
      write(`${post.id}_status_1080x1920.png`, await renderHero(m, { headline: post.copy.statusText ?? hook, sub: post.copy.subline, cta, bg, ...SPECS.vertical, vertical: true }), SPECS.vertical.spec);
      break;
  }

  // copy bundle — everything the person posting needs in one txt
  const copyTxt = renderCopyBundle(m, post);
  fs.writeFileSync(path.join(outDir, `${post.id}_copy.txt`), copyTxt);
  files.push({ path: `posts/${post.id}/exports/${post.id}_copy.txt`, kind: "image", spec: "caption + hashtags + CTA bundle" });

  post.assets = files.map((f) => ({ path: f.path, role: f.kind === "pdf" ? "document" : "creative" }));
  return files;
}

export function renderCopyBundle(m: ProjectManifest, post: Post): string {
  const L: string[] = [];
  L.push(`# ${post.platform.toUpperCase()} — ${post.format} — ${post.id} (${post.status})`);
  if (post.scheduledFor) L.push(`# scheduled: ${post.scheduledFor}`);
  L.push("", "## HOOK", post.hook, "");
  const c = post.copy ?? {};
  const dump = (label: string, v: any) => {
    if (v === undefined) return;
    L.push("", `## ${label.toUpperCase()}`);
    if (Array.isArray(v)) v.forEach((x) => L.push(typeof x === "object" ? JSON.stringify(x, null, 2) : String(x)));
    else if (typeof v === "object") L.push(JSON.stringify(v, null, 2));
    else L.push(String(v));
  };
  dump("caption", c.caption);
  dump("primary text", c.primaryText);
  dump("post text", c.postText);
  dump("body", c.body);
  dump("message", c.message);
  dump("status", c.statusText ? `${c.statusText}\n${c.subline ?? ""}` : undefined);
  dump("headline", c.headline);
  dump("description", c.description);
  dump("cta button", c.ctaButton);
  dump("script", c.script);
  dump("overlays", c.overlays);
  dump("sound", c.sound);
  dump("shooting notes", c.shootingNotes);
  dump("slides", c.slides);
  dump("pages", c.pages);
  dump("hashtags", c.hashtags?.length ? c.hashtags.join(" ") : undefined);
  dump("targeting", c.targetingNote);
  L.push("", "## CTA", `${post.cta.label}${post.cta.url ? ` → ${post.cta.url}` : ""}${post.cta.note ? ` (${post.cta.note})` : ""}`);
  if (post.review?.note) L.push("", "## REVIEW NOTE", post.review.note);
  return L.join("\n") + "\n";
}

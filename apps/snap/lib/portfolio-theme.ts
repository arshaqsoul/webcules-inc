/* Portfolio site theme + home model (WEB-346, Feature A) — pure and
 * client-safe (no DB, no env), the WEB-258 gallery-design token vocabulary
 * applied to the public portfolio page. `portfolio_site.theme/home` store the
 * CANONICAL JSON these parsers emit; the write path (repos/portfolio.ts)
 * rejects a theme whose tokens exceed the org's plan via themeMinTier (the
 * designMinTier precedent), so a saved theme is always renderable as stored.
 *
 * Token ladder (WEB-302 §4 / WEB-304 §7):
 *   free   — the presets: background, padding, radius, captions
 *   lite   — + typography: font, fontScale, tracking
 *   studio — + explicit colors (white-label adjacent brand overrides)
 */
import { FONT_PACK } from "./fonts";

export const PORTFOLIO_BACKGROUNDS = ["light", "dark"] as const;
export const PORTFOLIO_PADDINGS = ["compact", "normal", "airy"] as const;
export const PORTFOLIO_RADII = ["0px", "8px", "16px"] as const;
export const PORTFOLIO_CAPTIONS = ["off", "hover", "always"] as const;
export const PORTFOLIO_TRACKING = ["tight", "normal", "wide"] as const;

export type PortfolioBackground = (typeof PORTFOLIO_BACKGROUNDS)[number];
export type PortfolioPadding = (typeof PORTFOLIO_PADDINGS)[number];
export type PortfolioRadius = (typeof PORTFOLIO_RADII)[number];
export type PortfolioCaptions = (typeof PORTFOLIO_CAPTIONS)[number];

export type PortfolioTheme = {
  /** Only the keys the stored payload carried — unset keys render as the
   * defaults (DEFAULT_PORTFOLIO_THEME) at the consumer. */
  background?: PortfolioBackground;
  padding?: PortfolioPadding;
  radius?: PortfolioRadius;
  captions?: PortfolioCaptions;
  font?: string;
  fontScale?: number;
  tracking?: (typeof PORTFOLIO_TRACKING)[number];
  colors?: { bg?: string; text?: string; accent?: string };
};

export const DEFAULT_PORTFOLIO_THEME: PortfolioTheme = {
  background: "light",
  padding: "normal",
  radius: "16px",
  captions: "hover",
};

const HEX = /^#[0-9a-f]{6}$/i;

function pick<T extends readonly string[]>(list: T, v: unknown): T[number] | null {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T[number]) : null;
}

function hex(v: unknown): string | undefined {
  return typeof v === "string" && HEX.test(v.trim()) ? v.trim().toLowerCase() : undefined;
}

/** Validate an arbitrary payload into a canonical theme. Unknown keys are
 * dropped; enum junk drops the key (the preset stays). Returns the canonical
 * theme with ONLY the keys the input carried (missing keys render as
 * defaults at the consumer), or null when the payload isn't an object. */
export function parsePortfolioTheme(input: unknown): PortfolioTheme | null {
  if (input === null || input === undefined) return {};
  if (typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const out: PortfolioTheme = {};
  const bg = pick(PORTFOLIO_BACKGROUNDS, raw.background);
  if (bg) out.background = bg;
  const pad = pick(PORTFOLIO_PADDINGS, raw.padding);
  if (pad) out.padding = pad;
  const rad = pick(PORTFOLIO_RADII, raw.radius);
  if (rad) out.radius = rad;
  const cap = pick(PORTFOLIO_CAPTIONS, raw.captions);
  if (cap) out.captions = cap;
  const track = pick(PORTFOLIO_TRACKING, raw.tracking);
  if (track) out.tracking = track;
  if (typeof raw.font === "string" && FONT_PACK.some((f) => f.key === raw.font)) {
    out.font = raw.font;
  }
  if (typeof raw.fontScale === "number" && Number.isFinite(raw.fontScale)) {
    out.fontScale = Math.round(Math.min(1.4, Math.max(0.8, raw.fontScale)) * 100) / 100;
  }
  if (raw.colors && typeof raw.colors === "object" && !Array.isArray(raw.colors)) {
    const c = raw.colors as Record<string, unknown>;
    const colors: { bg?: string; text?: string; accent?: string } = {};
    const b = hex(c.bg);
    if (b) colors.bg = b;
    const t = hex(c.text);
    if (t) colors.text = t;
    const a = hex(c.accent);
    if (a) colors.accent = a;
    if (Object.keys(colors).length) out.colors = colors;
  }
  return out;
}

export type PortfolioTier = "free" | "lite" | "studio";

const TIER_RANK: Record<PortfolioTier, number> = { free: 0, lite: 1, studio: 2 };

/** The minimum tier that may SAVE this theme (the designMinTier precedent):
 * presets are free, typography is Lite, explicit colors are Studio. */
export function themeMinTier(theme: PortfolioTheme): PortfolioTier {
  if (theme.colors) return "studio";
  if (theme.font || theme.fontScale !== undefined || theme.tracking) return "lite";
  return "free";
}

export function tierAllowsTheme(plan: string | null | undefined, theme: PortfolioTheme): boolean {
  const planTier: PortfolioTier = plan === "studio" || plan === "pro" ? "studio" : plan === "lite" ? "lite" : "free";
  return TIER_RANK[themeMinTier(theme)] <= TIER_RANK[planTier];
}

/* ------------------------------ home sections ------------------------------ */

/** v1 section types only (WEB-301 §5.7): hero / collections / about /
 * contact. The booking CTA rides the hero + contact sections. Anything else
 * is a follow-up issue, not a v1 section. */
export const PORTFOLIO_SECTION_TYPES = ["hero", "collections", "about", "contact"] as const;
export type PortfolioSectionType = (typeof PORTFOLIO_SECTION_TYPES)[number];

export type HeroSection = {
  type: "hero";
  title: string;
  subtitle: string;
  /** Curated asset shown as the hero image (must be portfolio-curated to
   * render; renderers fall back to the first collection cover). */
  assetId?: string;
  cta?: { label: string; href: string };
};

export type CollectionsSection = { type: "collections"; title?: string };

export type AboutSection = { type: "about"; title?: string; text: string };

export type ContactSection = {
  type: "contact";
  title?: string;
  blurb?: string;
  /** Show the "Book a session" CTA linking the studio's booking page. */
  booking?: boolean;
};

export type PortfolioSection = HeroSection | CollectionsSection | AboutSection | ContactSection;

export const MAX_PORTFOLIO_SECTIONS = 8;
const MAX_TEXT = 4_000;
const MAX_LINE = 200;

function line(v: unknown, max = MAX_LINE): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Validate an arbitrary home payload into canonical sections. An empty home
 * ({}) renders the DEFAULT sections — a published site always has a page.
 * Unknown section types are dropped (never crash the public page); an
 * all-unknown payload falls back to the default order. */
export function parsePortfolioHome(input: unknown): PortfolioSection[] {
  const rawSections =
    input && typeof input === "object" && !Array.isArray(input)
      ? Array.isArray((input as Record<string, unknown>).sections)
        ? ((input as Record<string, unknown>).sections as unknown[])
        : null
      : null;
  const sections: PortfolioSection[] = [];
  for (const raw of rawSections ?? []) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const r = raw as Record<string, unknown>;
    const type = pick(PORTFOLIO_SECTION_TYPES, r.type);
    if (!type) continue;
    if (type === "hero") {
      const section: HeroSection = { type: "hero", title: line(r.title), subtitle: line(r.subtitle, 300) };
      if (typeof r.assetId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(r.assetId)) section.assetId = r.assetId;
      const label = line((r.cta as Record<string, unknown> | undefined)?.label);
      const href = line((r.cta as Record<string, unknown> | undefined)?.href, 500);
      if (label && href && /^\/|https?:\/\//.test(href)) section.cta = { label, href };
      sections.push(section);
    } else if (type === "collections") {
      const section: CollectionsSection = { type: "collections" };
      const title = line(r.title);
      if (title) section.title = title;
      sections.push(section);
    } else if (type === "about") {
      const section: AboutSection = { type: "about", text: line(r.text, MAX_TEXT) };
      const title = line(r.title);
      if (title) section.title = title;
      sections.push(section);
    } else {
      const section: ContactSection = { type: "contact", booking: r.booking !== false };
      const title = line(r.title);
      if (title) section.title = title;
      const blurb = line(r.blurb, 300);
      if (blurb) section.blurb = blurb;
      sections.push(section);
    }
    if (sections.length >= MAX_PORTFOLIO_SECTIONS) break;
  }
  return sections.length ? sections : defaultPortfolioHome();
}

/** The home every site renders before the photographer customizes anything
 * (WEB-304 §A3: the draft IS the template). */
export function defaultPortfolioHome(): PortfolioSection[] {
  return [
    { type: "hero", title: "", subtitle: "" },
    { type: "collections" },
    { type: "about", text: "" },
    { type: "contact", booking: true },
  ];
}

/* ------------------------------- rendering ------------------------------- */

/** CSS custom properties for the page shell (consumed by
 * components/portfolio-view). Pure — unit-tested. Colors resolve through the
 * background preset unless Studio colors override. */
export function portfolioThemeCss(theme: PortfolioTheme): Record<string, string> {
  const t = { ...DEFAULT_PORTFOLIO_THEME, ...theme };
  const dark = t.background === "dark";
  const vars: Record<string, string> = {
    "--pf-bg": t.colors?.bg ?? (dark ? "#0b0c10" : "#fbfbfa"),
    "--pf-text": t.colors?.text ?? (dark ? "#f4f4f5" : "#1c1d21"),
    "--pf-muted": dark ? "rgba(244,244,245,.64)" : "rgba(28,29,33,.64)",
    "--pf-accent": t.colors?.accent ?? (dark ? "#e6e6ea" : "#111114"),
    "--pf-surface": dark ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.035)",
    "--pf-radius": t.radius ?? "16px",
    "--pf-pad": t.padding === "compact" ? "16px" : t.padding === "airy" ? "72px" : "36px",
    "--pf-tracking": t.tracking === "tight" ? "-0.02em" : t.tracking === "wide" ? "0.06em" : "0",
  };
  if (t.fontScale !== undefined) vars["--pf-type-scale"] = String(t.fontScale);
  return vars;
}

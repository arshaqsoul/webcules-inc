/* WEB-318/319: the self-hosted font registry. Every key ships as WOFF2 in
 * the Worker's static assets (public/fonts/, OFL-licensed — LICENSES.md next
 * to them) so galleries never request an external font service. The gallery
 * resolves theme.font → a CSS family stack at render; unknown keys fall
 * back to the system stack. Pure + client-safe. */

export type FontDef = {
  key: string;
  /** CSS family name (must match the @font-face in public/fonts/fonts.css). */
  family: string;
  /** Full CSS font-family value with graceful fallbacks. */
  stack: string;
  category: "sans" | "serif" | "display";
  weights: number[];
};

export const FONT_PACK: FontDef[] = [
  { key: "inter", family: "Inter", stack: '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif', category: "sans", weights: [400, 500, 600, 700] },
  { key: "work-sans", family: "Work Sans", stack: '"Work Sans", ui-sans-serif, system-ui, sans-serif', category: "sans", weights: [400, 500, 600, 700] },
  { key: "manrope", family: "Manrope", stack: '"Manrope", ui-sans-serif, system-ui, sans-serif', category: "sans", weights: [400, 500, 600, 700] },
  { key: "montserrat", family: "Montserrat", stack: '"Montserrat", ui-sans-serif, system-ui, sans-serif', category: "sans", weights: [400, 500, 600, 700] },
  { key: "space-grotesk", family: "Space Grotesk", stack: '"Space Grotesk", ui-monospace, ui-sans-serif, system-ui, sans-serif', category: "sans", weights: [400, 500, 600, 700] },
  { key: "bebas-neue", family: "Bebas Neue", stack: '"Bebas Neue", "Arial Narrow", ui-sans-serif, sans-serif', category: "display", weights: [400] },
  { key: "playfair-display", family: "Playfair Display", stack: '"Playfair Display", Georgia, "Times New Roman", serif', category: "serif", weights: [400, 500, 600, 700] },
  { key: "cormorant-garamond", family: "Cormorant Garamond", stack: '"Cormorant Garamond", Georgia, serif', category: "serif", weights: [400, 500, 600, 700] },
  { key: "lora", family: "Lora", stack: '"Lora", Georgia, serif', category: "serif", weights: [400, 500, 600, 700] },
  { key: "libre-baskerville", family: "Libre Baskerville", stack: '"Libre Baskerville", Georgia, serif', category: "serif", weights: [400, 700] },
  { key: "dm-serif-display", family: "DM Serif Display", stack: '"DM Serif Display", Georgia, serif', category: "display", weights: [400] },
  { key: "fraunces", family: "Fraunces", stack: '"Fraunces", Georgia, serif', category: "display", weights: [400, 600, 700] },
];

const BY_KEY = new Map(FONT_PACK.map((f) => [f.key, f]));

export function fontOf(key: string | undefined | null): FontDef | null {
  return key ? BY_KEY.get(key) ?? null : null;
}

/** CSS font-family value for a pack key (null → no override, system stack). */
export function fontFamilyOf(key: string | undefined | null): string | null {
  return fontOf(key)?.stack ?? null;
}

/** The stylesheet carrying every @font-face — linked by the gallery page ONLY
 * when the design selects a pack font (no idle font downloads). */
export const FONTS_CSS_HREF = "/fonts/fonts.css";

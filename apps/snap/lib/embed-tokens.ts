/* Embed theming tokens v2 (WEB-163) — the documented token set both widgets
 * consume. Layers (later wins): brand-profile defaults → snippet
 * data-snap-* / data-snap-config overrides → auto-inherit sampling from the
 * host page (forwarded by the loader as query params; re-sanitized here).
 *
 * Tokens map to --snap-* CSS variables inside the iframe; `theme` picks the
 * light/dark neutral pair. Nothing is ever injected as raw CSS — every value
 * passes a per-kind sanitizer. */
import { safeHexColor } from "./embed";

export type EmbedTheme = "light" | "dark" | "auto";

/** Documented token set (hex colors, a font stack, a radius, a theme). */
export const TOKEN_KEYS = ["accent", "fontFamily", "bg", "surface", "text", "muted", "border", "radius"] as const;
export type TokenKey = (typeof TOKEN_KEYS)[number];

export const LIGHT_DEFAULTS: Record<Exclude<TokenKey, "accent" | "fontFamily">, string> = {
  bg: "#ffffff",
  surface: "#f7f8f8",
  text: "#0f1011",
  muted: "#62666d",
  border: "#d0d3d8",
  radius: "8px",
};
export const DARK_DEFAULTS: Record<Exclude<TokenKey, "accent" | "fontFamily">, string> = {
  bg: "#0f1011",
  surface: "#16181c",
  text: "#f7f8f8",
  muted: "#8a8f98",
  border: "#2a2d33",
  radius: "8px",
};
export const DEFAULT_FONT = "Inter,-apple-system,system-ui,'Segoe UI',Roboto,sans-serif";

/** Font stacks: names/quotes/commas/spaces/hyphens only — no CSS injection. */
export function safeFontStack(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, 160);
  if (!s || !/^[A-Za-z0-9 ,'"+\-/()]+$/.test(s)) return null;
  if (/[{}<>;@]/.test(s)) return null;
  return s;
}

export function safeRadius(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^\d{1,3}px$|^(\d{1,2}(\.\d+)?)rem$|^50%$/.test(s) ? s : null;
}

export function safeTheme(v: unknown): EmbedTheme | null {
  return v === "light" || v === "dark" || v === "auto" ? v : null;
}

export type TokenBag = Partial<Record<TokenKey, string>> & { theme?: EmbedTheme };

/** Sanitize an untrusted bag (query params / snippet config). Invalid values
 * are dropped, never coerced. */
export function sanitizeTokenBag(input: Record<string, unknown>): TokenBag {
  const out: TokenBag = {};
  const hexKeys: TokenKey[] = ["accent", "bg", "surface", "text", "muted", "border"];
  for (const k of hexKeys) {
    const clean = safeHexColor(String(input[k] ?? ""));
    if (clean) out[k] = clean;
  }
  const font = safeFontStack(input.fontFamily);
  if (font) out.fontFamily = font;
  const radius = safeRadius(input.radius);
  if (radius) out.radius = radius;
  const theme = safeTheme(input.theme);
  if (theme) out.theme = theme;
  return out;
}

/** Resolve the final CSS custom-property block for a widget document.
 * Brand defaults (already trusted, re-sanitized defensively) are the base;
 * explicit query overrides win; the theme picks the neutral pair. Returns
 * the vars string and the resolved concrete theme ("auto" must already be
 * resolved by the loader — here auto falls back to light). */
export function resolveWidgetVars(brand: { accent?: string; fontFamily?: string; theme?: string }, overrides: TokenBag): { vars: string; theme: "light" | "dark" } {
  const theme: "light" | "dark" = overrides.theme === "dark" || (!overrides.theme && brand.theme === "dark") ? "dark" : "light";
  const neutrals = theme === "dark" ? DARK_DEFAULTS : LIGHT_DEFAULTS;

  const final: Record<string, string> = {
    "--snap-accent": safeHexColor(overrides.accent ?? brand.accent ?? "") ?? "#5e6ad2",
    "--snap-font": safeFontStack(overrides.fontFamily ?? brand.fontFamily) ?? DEFAULT_FONT,
    "--snap-bg": safeHexColor(overrides.bg ?? "") ?? neutrals.bg,
    "--snap-surface": safeHexColor(overrides.surface ?? "") ?? neutrals.surface,
    "--snap-text": safeHexColor(overrides.text ?? "") ?? neutrals.text,
    "--snap-muted": safeHexColor(overrides.muted ?? "") ?? neutrals.muted,
    "--snap-border": safeHexColor(overrides.border ?? "") ?? neutrals.border,
    "--snap-radius": safeRadius(overrides.radius) ?? neutrals.radius,
  };
  const vars = Object.entries(final)
    .map(([k, v]) => `${k}:${v};`)
    .join(" ");
  return { vars, theme };
}

/* Booking page config (WEB-254) — the studio's words and shape on /b/{slug}.
 * Validated JSON on studio_profiles (≤ 32 KB): hero, intro, FAQ (no-JS
 * details/summary), socials (https only), post-booking thanks copy, and the
 * session-type showcase behavior. Empty config renders today's page. */
export type BookingSocialKind = "instagram" | "facebook" | "tiktok" | "website" | "email";

export type BookingPageConfig = {
  hero: { title: string; subtitle: string };
  intro?: { heading: string; body: string };
  faq: Array<{ q: string; a: string }>;
  socials: Array<{ kind: BookingSocialKind; url: string }>;
  thanks: { title: string; body: string };
  showSessionTypes: "auto";
};

export const EMPTY_BOOKING_PAGE: BookingPageConfig = {
  hero: { title: "", subtitle: "" },
  faq: [],
  socials: [],
  thanks: { title: "", body: "" },
  showSessionTypes: "auto",
};

const SOCIAL_KINDS: BookingSocialKind[] = ["instagram", "facebook", "tiktok", "website", "email"];

function str(v: unknown, cap: number): string {
  return typeof v === "string" ? v.trim().slice(0, cap) : "";
}

/** Strict validation — returns a normalized config (empty sections dropped)
 * or null when the payload is malformed. */
export function validateBookingPageConfig(input: unknown): BookingPageConfig | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const hero = (raw.hero ?? {}) as Record<string, unknown>;
  const config: BookingPageConfig = {
    hero: { title: str(hero.title, 120), subtitle: str(hero.subtitle, 300) },
    faq: [],
    socials: [],
    thanks: { title: str((raw.thanks as Record<string, unknown> | undefined)?.title, 120), body: str((raw.thanks as Record<string, unknown> | undefined)?.body, 600) },
    showSessionTypes: raw.showSessionTypes === "auto" ? "auto" : "auto",
  };
  const intro = raw.intro as Record<string, unknown> | undefined;
  if (intro && (str(intro.heading, 120) || str(intro.body, 1000))) {
    config.intro = { heading: str(intro.heading, 120), body: str(intro.body, 1000) };
  }
  if (raw.faq !== undefined) {
    if (!Array.isArray(raw.faq)) return null;
    for (const item of raw.faq.slice(0, 8)) {
      const f = item as Record<string, unknown>;
      const q = str(f.q, 200);
      const a = str(f.a, 600);
      if (!q && !a) continue;
      if (!q || !a) return null;
      config.faq.push({ q, a });
    }
  }
  if (raw.socials !== undefined) {
    if (!Array.isArray(raw.socials)) return null;
    for (const item of raw.socials.slice(0, 5)) {
      const s = item as Record<string, unknown>;
      const kind = SOCIAL_KINDS.includes(s.kind as BookingSocialKind) ? (s.kind as BookingSocialKind) : null;
      const url = str(s.url, 300);
      if (!kind && !url) continue;
      if (!kind || !url) return null;
      // Outbound https links only (mailto for the email kind).
      const okUrl = kind === "email" ? /^mailto:[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(url) || /^https:\/\//i.test(url) : /^https:\/\//i.test(url);
      if (!okUrl) return null;
      config.socials.push({ kind, url });
    }
  }
  return config;
}

export function parseBookingPageConfig(json: string | null | undefined): BookingPageConfig {
  if (!json) return { ...EMPTY_BOOKING_PAGE };
  try {
    return validateBookingPageConfig(JSON.parse(json)) ?? { ...EMPTY_BOOKING_PAGE };
  } catch {
    return { ...EMPTY_BOOKING_PAGE };
  }
}

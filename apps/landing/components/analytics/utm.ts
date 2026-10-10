const KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid"] as const;
const STORE = "wc_utm";

export type Utm = Partial<Record<(typeof KEYS)[number], string>>;

/** Last-touch: a URL carrying UTMs overwrites what's stored; otherwise keep the previous ones. */
export function captureUtm(): Utm {
  try {
    const params = new URLSearchParams(window.location.search);
    const found: Utm = {};
    for (const k of KEYS) {
      const v = params.get(k);
      if (v) found[k] = v.slice(0, 200);
    }
    if (Object.keys(found).length) {
      localStorage.setItem(STORE, JSON.stringify(found));
      return found;
    }
    return JSON.parse(localStorage.getItem(STORE) ?? "{}") as Utm;
  } catch {
    return {};
  }
}

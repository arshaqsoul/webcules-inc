import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function cad(amount: number, opts: { cents?: boolean } = {}) {
  const dollars = opts.cents ? amount / 100 : amount;
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: dollars % 1 === 0 ? 0 : 2,
  }).format(dollars);
}

export function fmtDate(d: Date | number | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "number" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" }).format(date);
}

export function daysSince(d: Date | number | null | undefined) {
  if (!d) return null;
  const date = typeof d === "number" ? new Date(d) : d;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

/** Normalize a phone number for wa.me deep links — digits only; 10-digit numbers get the Canada +1 prefix. */
export function waNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `1${digits}`;
  if (digits.length >= 11) return digits;
  return null;
}

/** Native WhatsApp deep link — opens the desktop app to the chat with the message prefilled (no browser interstitial). */
export function whatsappDeepLink(phone: string | null | undefined, text: string): string | null {
  const num = waNumber(phone);
  if (!num) return null;
  return `whatsapp://send?phone=${num}&text=${encodeURIComponent(text)}`;
}

/**
 * Bare social handle from whatever's on file — "@foo", "instagram.com/foo",
 * "https://www.facebook.com/foo/about" and "foo" all become "foo" (the DM links need it bare).
 */
export function socialHandle(input: string | null | undefined): string | null {
  let raw = (input ?? "").trim().replace(/^https?:\/\//i, "");
  if (!raw) return null;
  if (raw.includes("/")) {
    const path = raw.slice(raw.indexOf("/") + 1); // URL form: keep what follows the domain
    if (path) raw = path;
  }
  const handle = raw
    .replace(/^@/, "")
    .replace(/[/?].*$/, "")
    .trim();
  return handle || null;
}

const socialDmLinks = {
  facebook: (h: string) => `https://m.me/${h}`,
  instagram: (h: string) => `https://ig.me/m/${h}`,
  /** TikTok has no DM deep link — the profile is as close as a URL gets; the Message button is one tap away. */
  tiktok: (h: string) => `https://www.tiktok.com/@${h}`,
} as const;

/**
 * DM deep links for the social channels. Unlike WhatsApp, none of the three accept a
 * prefilled message — pair these with a clipboard copy of the draft.
 */
export function socialDmLink(channel: "facebook" | "instagram" | "tiktok", handle: string | null | undefined): string | null {
  const h = socialHandle(handle);
  if (!h) return null;
  return socialDmLinks[channel](h);
}

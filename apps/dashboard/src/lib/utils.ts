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
  const date = typeof d === "number" ? new Date(d * 1000) : d;
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" }).format(date);
}

export function daysSince(d: Date | number | null | undefined) {
  if (!d) return null;
  const date = typeof d === "number" ? new Date(d * 1000) : d;
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

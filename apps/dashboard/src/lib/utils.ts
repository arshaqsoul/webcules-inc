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

/* The one place Snap's public pricing copy lives — pure data, no React, so
 * the pricing surface (landing, /onboarding/plan, Settings → Plan) and its
 * tests share a single source. Prices/limits are enforced from lib/plans.ts
 * (the source of truth); this mirrors them for display because that module
 * pulls in the DB and can't be imported from client components.
 *
 * Tier copy is CUMULATIVE (WEB-284 cleanup): Free lists the baseline; every
 * paid tier lists only its deltas under an "Everything in <prev>, plus"
 * inherits label — never repeat an inherited feature on a higher card. */
export type TierId = "free" | "lite" | "studio" | "pro";

export type TierCard = {
  id: TierId;
  name: string;
  /** Numeric price for dialogs and dense layouts (Settings → Plan). */
  price: number;
  priceLabel: string;
  cadence: string;
  tagline: string;
  /** Compact spec line for dense surfaces ("20GB · RAW trial · 5 galleries"). */
  spec: string;
  /** Cumulative ladder: what this tier inherits in full ("Everything in
   * Free, plus"). Absent on Free — it is the baseline. */
  inherits?: string;
  /** True deltas vs the inherited tier ONLY — never repeat an inherited feature. */
  features: string[];
  highlight: boolean;
  cta: string;
  href: string;
};

export const TIER_CARDS: TierCard[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    priceLabel: "$0",
    cadence: "",
    tagline: "Try the whole thing",
    spec: "20GB · RAW trial · 5 galleries",
    features: [
      "20 GB storage (incl. 3 GB RAW trial)",
      "Unlimited bookings",
      "5 active galleries",
      "10 designer gallery templates — pick a look, swap in your photos",
      "Unified inbox — every conversation & event, free",
      "Secure client galleries with favorites",
      "Basic slideshow + video delivery",
      "Folders + folder delivery",
      "Full CRM + pipeline",
    ],
    highlight: false,
    cta: "Start free",
    href: "/signup?plan=free",
  },
  {
    id: "lite",
    name: "Lite",
    price: 15,
    priceLabel: "$15",
    cadence: "/mo",
    tagline: "For part-timers growing",
    spec: "150GB pooled · 3 studios · 15 galleries",
    inherits: "Everything in Free, plus",
    features: [
      "150 GB storage, pooled across your studios",
      "Unlimited RAW Vault — no more 3 GB trial",
      "15 active galleries",
      "Client photo app (/my)",
      "Gallery page builder — sections, custom fonts, colors",
      "Slideshows with your music + social sharing",
      "Download PIN, web-size & bulk ZIPs",
      "3 studios, one bill",
      "Booking page designer + invoice presets",
      "Sell minis and weddings differently — 3 session types",
      "Inbox snooze — park conversations until you're ready",
    ],
    highlight: false,
    cta: "Start Lite",
    href: "/signup?plan=lite",
  },
  {
    id: "studio",
    name: "Studio",
    price: 29,
    priceLabel: "$29",
    cadence: "/mo",
    tagline: "The working pro's tier",
    spec: "500GB · white-label · $0.10/GB",
    inherits: "Everything in Lite, plus",
    features: [
      "500 GB, then $0.10/GB",
      "Unlimited galleries",
      "Unlimited studios",
      "Remove Snap branding — galleries, emails, invoices",
      "Watermarks & photo deterrents",
      "Sneak peeks + download approvals",
      "Favorites lists, notes & exports",
      "Collage sections — free photo positioning",
      "Save unlimited custom gallery looks",
      "Per-photo insights + heat map",
      "Unlimited session types, contract templates, forms & questionnaires — design your own form fields",
      "Payment automations",
      "Custom domain add-on +$5/mo",
    ],
    highlight: true,
    cta: "Start Studio",
    href: "/signup?plan=studio",
  },
  {
    id: "pro",
    name: "Pro",
    price: 59,
    priceLabel: "$59",
    cadence: "/mo",
    tagline: "Studios & teams",
    spec: "2TB · white-label · $0.10/GB",
    inherits: "Everything in Studio, plus",
    features: [
      "2 TB, then $0.10/GB",
      "Teams & permissions",
      "Custom domains — 2 included, e.g. your own photo app domain",
      "Priority support",
    ],
    highlight: false,
    cta: "Start Pro",
    href: "/signup?plan=pro",
  },
];

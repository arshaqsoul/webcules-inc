/* The one place Snap's public pricing copy lives — pure data, no React, so
 * the pricing surface (landing, /onboarding/plan, Settings → Plan) and its
 * tests share a single source. Prices/limits are enforced from lib/plans.ts
 * (the source of truth); this mirrors them for display because that module
 * pulls in the DB and can't be imported from client components. */
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
    features: ["20 GB (incl. 3 GB RAW trial)", "Unlimited bookings", "5 active galleries", "Folders + folder delivery", "Full CRM + pipeline"],
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
    features: ["150 GB storage, pooled", "Unlimited RAW Vault", "15 active galleries", "3 studios, one bill", "Folders + folder delivery", "Booking page designer + invoice presets", "Sell minis and weddings differently — 3 session types"],
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
    features: ["500 GB, then $0.10/GB", "Unlimited galleries", "Unlimited studios", "Folders + folder delivery", "Custom domain add-on +$5/mo", "Remove Snap branding — galleries, emails, invoices", "Watermarks & photo deterrents", "Unlimited session types, contract templates & forms — design your own form fields", "RAW Vault + payment automations"],
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
    features: ["2 TB, then $0.10/GB", "Teams & permissions", "Unlimited studios", "Folders + folder delivery", "Custom domains — 2 included", "White-label + watermarks (everything in Studio)", "Contracts & e-sign", "Priority support"],
    highlight: false,
    cta: "Start Pro",
    href: "/signup?plan=pro",
  },
];

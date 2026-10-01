/* Snap docs — navigation registry (pure data, client-safe).
 *
 * Modeled on Linear's docs IA: flat /docs/<slug> URLs, top-level categories
 * that expand to child pages, one page per product area. The sidebar and
 * header are client components that read this tree; the content modules live
 * in lib/docs/content/*.tsx (server components, imported only by the docs
 * route + the search/markdown APIs).
 *
 * DOCS AS A PRACTICE: a user-visible feature ships together with (or updates)
 * a page here. Add the page to a category below, author it from the code, and
 * verify it on staging before it counts as done. */

export type DocTier = "lite" | "studio" | "pro";

export type DocPageMeta = {
  /** URL segment — /docs/<slug>. Flat, Linear-style. */
  slug: string;
  title: string;
  /** Meta description + the intro paragraph rendered under the H1. */
  description: string;
  /** Lucide icon key (mapped in components/docs/icons.tsx). */
  icon: string;
  /** Minimum plan for the FEATURE the page documents — shown as a badge.
   * Reading the docs is never gated. */
  tier?: DocTier;
};

export type DocCategory = {
  id: string;
  label: string;
  icon: string;
  pages: DocPageMeta[];
};

export const DOC_CATEGORIES: DocCategory[] = [
  {
    id: "getting-started",
    label: "Getting started",
    icon: "rocket",
    pages: [
      {
        slug: "start-guide",
        title: "Start Guide",
        description:
          "Snap helps photographers run the whole studio — inquiries, bookings, projects, galleries, and payment — in one place. This guide gets you from empty account to first delivered gallery.",
        icon: "rocket",
      },
      {
        slug: "concepts",
        title: "Concepts",
        description:
          "Snap is built around a few core objects that hand work to each other: leads become bookings, bookings become projects, projects hold the files, galleries, contracts, and money. Understanding how they connect makes every other page make sense.",
        icon: "info",
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    icon: "user",
    pages: [
      {
        slug: "security",
        title: "Security & two-factor",
        description:
          "Your Snap studio holds client photos and payment relationships. Add a second lock to sign-in, keep backup codes, and know exactly how recovery works — there is no magic bypass.",
        icon: "shield-check",
      },
      {
        slug: "notifications",
        title: "Notifications",
        description:
          "Choose which Snap alerts reach you — new inquiries, bookings, signed contracts, storage warnings — and understand the one email stream that can never be turned off: your clients' transactional email.",
        icon: "bell",
      },
    ],
  },
  {
    id: "leads",
    label: "Leads",
    icon: "inbox",
    pages: [
      {
        slug: "leads",
        title: "Lead inbox",
        description:
          "Every inquiry lands in one inbox — from your contact form, an embedded widget, or a reply to your email. Triage, reply with snippets, and convert the yeses into bookings without retyping anything.",
        icon: "inbox",
      },
    ],
  },
  {
    id: "bookings",
    label: "Bookings",
    icon: "calendar-days",
    pages: [
      {
        slug: "booking-page",
        title: "Booking page",
        description:
          "A standalone, branded page where clients pick a session type and a time, pay the deposit, and get confirmed — one link for your bio, email signature, and socials.",
        icon: "globe",
      },
      {
        slug: "calendar",
        title: "Calendar & availability",
        description:
          "The calendar is your whole studio at a glance: bookings, committed shoot days, and dated open leads. Availability rules decide what clients can book; blackout dates guard the days off.",
        icon: "calendar-days",
      },
      {
        slug: "bookings",
        title: "Managing bookings",
        description:
          "Reschedules, cancellations, reminders, and the client-side manage page — what happens after the booking is made, and what your clients can do themselves.",
        icon: "calendar-check",
      },
    ],
  },
  {
    id: "projects",
    label: "Projects",
    icon: "layout-grid",
    pages: [
      {
        slug: "projects",
        title: "Projects & pipeline",
        description:
          "Projects are the work: a kanban pipeline from Booked to Closed, where every job carries its files, galleries, payments, contracts, and history in one place.",
        icon: "layout-grid",
      },
      {
        slug: "project-hub",
        title: "The project hub",
        description:
          "Open any project and everything about that job is in tabs: responses and questionnaires, files and folders, invoices and payments, contracts, and the full activity trail.",
        icon: "folder-open",
      },
      {
        slug: "contracts",
        title: "Contracts & e-signing",
        description:
          "Build agreements with merge fields, apply them to a project, and send a private link your client signs in the browser — legally minded, checked, and archived on the project.",
        icon: "file-text",
      },
    ],
  },
  {
    id: "galleries",
    label: "Galleries",
    icon: "images",
    pages: [
      {
        slug: "gallery-delivery",
        title: "Delivering galleries",
        description:
          "The gallery is where your client falls in love with the work — and where their friends meet your studio. Verified access, expiring links, slideshows with your music, controlled downloads, and honest limits throughout.",
        icon: "link-2",
      },
      {
        slug: "gallery-design",
        title: "Gallery design & styles",
        description:
          "Covers with a hero slider, layouts, themes, and motion — design each gallery to match the shoot, preview it exactly as your client will see it, then save the combination as a preset your whole studio reuses.",
        icon: "frame",
        tier: "lite",
      },
      {
        slug: "video",
        title: "Films & video delivery",
        description:
          "We deliver your films bit-exact, like your photos: no transcoding, no re-encoding, no quality loss — the file you upload is the file your client plays and downloads.",
        icon: "film",
      },
      {
        slug: "protection",
        title: "Photo protection",
        description:
          "Every gallery platform markets \"protection.\" This is the straight version: the layers Snap actually gives you, what each one does, and what none of them can do.",
        icon: "lock",
      },
    ],
  },
  {
    id: "money",
    label: "Billing & money",
    icon: "credit-card",
    pages: [
      {
        slug: "billing-plans",
        title: "Plans & tiers",
        description:
          "Free, Lite, Studio, Pro — what each tier includes, what's gated where, and how the numbers (storage, galleries, studios, seats) actually work.",
        icon: "layers",
      },
      {
        slug: "billing",
        title: "Subscription & billing",
        description:
          "Upgrade, downgrade, the custom-domain add-on, storage overage, and your invoices — how the money side of your Snap subscription behaves.",
        icon: "receipt",
      },
      {
        slug: "payments",
        title: "Invoices & payments",
        description:
          "Charge deposits and balances, send beautiful invoices your clients pay online, and track every payment from pending to paid — yours, powered by Stripe.",
        icon: "wallet",
      },
      {
        slug: "transactions",
        title: "Transactions & refunds",
        description:
          "One ledger for every payment your studio has taken: statuses, refunds and voids, disputes, and what each one means for your payout.",
        icon: "arrow-left-right",
      },
      {
        slug: "payouts",
        title: "Payouts",
        description:
          "Connect your bank with Stripe Express and money clients pay lands in your account — Snap never holds it. Here's how onboarding, timing, and fees work.",
        icon: "banknote",
      },
    ],
  },
  {
    id: "clients",
    label: "Clients",
    icon: "users",
    pages: [
      {
        slug: "client-portal",
        title: "Client portal & app",
        description:
          "Your clients get a home of their own: every gallery currently open, where each project stands, and their upcoming bookings — installable to the home screen, on your brand.",
        icon: "smartphone",
      },
    ],
  },
  {
    id: "brand",
    label: "Brand & website",
    icon: "palette",
    pages: [
      {
        slug: "brand",
        title: "Brand & white-label",
        description:
          "Your accent, your logo, your email voice — and on Studio and above, Snap's name steps aside entirely. Watermarks live here too.",
        icon: "palette",
      },
      {
        slug: "domains",
        title: "Custom domains",
        description:
          "Put your client galleries, booking page and client portal on your own domain (gallery.yourstudio.com): the three steps, provider-specific DNS walkthroughs, and status meanings.",
        icon: "globe",
      },
      {
        slug: "embeds",
        title: "Embeds",
        description:
          "Add the Snap contact form, booking calendar or booking button to any website: plain HTML, Next.js, Astro, React, WordPress and page builders.",
        icon: "code-2",
      },
    ],
  },
  {
    id: "data",
    label: "Your data",
    icon: "hard-drive",
    pages: [
      {
        slug: "raw-vault",
        title: "RAW Vault",
        description:
          "Keep the RAWs hot while you work, then let them slide into cheap cold storage automatically — restorable any time, without eating your delivery quota.",
        icon: "snowflake",
      },
      {
        slug: "storage",
        title: "Storage & limits",
        description:
          "How your plan's storage pool works: what counts against it, what happens near the cap, the hard lock, and the overage math on Studio and Pro.",
        icon: "database",
      },
    ],
  },
  {
    id: "templates",
    label: "Templates",
    icon: "list-checks",
    pages: [
      {
        slug: "templates",
        title: "Templates guide",
        description:
          "One library for everything reusable in your studio — contracts, forms and questionnaires, email snippets, invoice presets, gallery styles, and session types — where each lives and where it applies.",
        icon: "list-checks",
      },
    ],
  },
  {
    id: "product-updates",
    label: "Product updates",
    icon: "sparkles",
    pages: [
      {
        slug: "releases",
        title: "Releases",
        description:
          "Every tagged release of Snap, newest first — new features, fixes, and changes worth knowing about, written for photographers.",
        icon: "sparkles",
      },
    ],
  },
];

/** Flat lookup: slug → page meta (with its category attached). */
export function findDocPage(slug: string): { category: DocCategory; page: DocPageMeta } | null {
  for (const category of DOC_CATEGORIES) {
    const page = category.pages.find((p) => p.slug === slug);
    if (page) return { category, page };
  }
  return null;
}

export const DOC_INDEX_LINK = "/docs";

/** Union of every slug — keeps DocHint links typechecked against the nav. */
export type DocSlug = (typeof DOC_CATEGORIES)[number]["pages"][number]["slug"];

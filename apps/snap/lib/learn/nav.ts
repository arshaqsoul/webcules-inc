/* /learn — video guide registry (mirrors lib/docs/nav.ts). Pure data: the
 * series, each guide's meta, its chapter timeline, and its transcript. The
 * guide page, index, and player all render from this — it never drifts. */

export type LearnChapter = { title: string; start: number };
export type LearnLine = { start: number; text: string };
export type LearnGuide = {
  slug: string;
  title: string;
  description: string;
  seconds: number;
  video: string;
  captions?: string;
  poster?: string;
  chapters: LearnChapter[];
  transcript: LearnLine[];
  relatedDocs: string[];
};

export const LEARN_GUIDES: LearnGuide[] = [
  {
    slug: "intro-to-snap",
    title: "Intro to Snap",
    description:
      "The whole loop in two minutes: a booking turns into a delivered gallery and a payout — bookings, projects, galleries, and money, in one place.",
    seconds: 132,
    video: "/learn/media/intro-to-snap.mp4",
    captions: "/learn/media/intro-to-snap.vtt",
    poster: "/learn/media/intro-to-snap-poster.jpg",
    chapters: [
      { title: "Introduction", start: 2.5 },
      { title: "Bookings", start: 19.07 },
      { title: "The pipeline", start: 41.25 },
      { title: "Galleries", start: 68.53 },
      { title: "Money", start: 96.1 },
      { title: "Wrap-up", start: 113.15 },
    ],
    transcript: [
      { start: 2.5, text: "Hi, we're Snap — the studio operating system for photographers. We run your bookings, your contracts, your galleries, and your payments, all in one place. In the next few minutes, we'll show you how a booking turns into a delivered gallery." },
      { start: 19.07, text: "Everything starts with your booking page. It's one link with your packages, your calendar, and your contract built in." },
      { start: 27.55, text: "Your client picks a package, chooses a date, signs, and pays the retainer. That's it. Snap creates the project, blocks the date on your calendar, and reminds the client before the shoot." },
      { start: 41.25, text: "New inquiries land in Leads, your inbox for triage and replies." },
      { start: 46.97, text: "Booked work moves down the Projects pipeline. A kanban carries every job from booking to delivery." },
      { start: 54.9, text: "The Calendar shows bookings, shoot days, and dated leads, with your availability rules underneath. And RAW shooters get a RAW Vault for cold storage, so archives stop eating your drives." },
      { start: 68.53, text: "After the shoot, upload your selects and hit Deliver. Snap builds a gallery with the client's name on it. Clients open a verified link, pick their favorites, run the slideshow, and order prints, on any device." },
      { start: 83.45, text: "Every gallery you've sent lives in Galleries, with its status and controls in one place. The client portal keeps their gallery, invoice, and contract together, under your brand." },
      { start: 96.1, text: "Money is its own area. Transactions holds every payment, with refunds and disputes when things go wrong. Connect payouts with Stripe Express, and what clients pay lands in your bank in one to two business days. Snap never holds it." },
      { start: 113.15, text: "That's the whole loop. Inquiry to booking, shoot to gallery, gallery to payout. Start with the setup guide on your Overview. It walks you through brand, payouts, and your booking page, one step at a time. See you in the dashboard." },
    ],
    relatedDocs: ["start-guide", "booking-page", "gallery-delivery", "payouts"],
  },
];

export function findLearnGuide(slug: string): LearnGuide | undefined {
  return LEARN_GUIDES.find((g) => g.slug === slug);
}

export function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

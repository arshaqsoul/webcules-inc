// Demo seed: Phase 1 swipe entries distilled from live research (2026-09-17).
// Run: node scripts/seed-demo.mjs
const BASE = "http://127.0.0.1:4322";
const SLUG = "webcules-custom-apps-launch-campaign";

const entries = [
  // ---- facebook ----
  {
    key: "facebook", title: "Meta Ad Library — how to spy on winning agency ads", kind: "campaign",
    url: "https://www.facebook.com/ads/library",
    hook: "n/a (research method)", format: "research workflow",
    why: "Search 'custom app development', 'website for my business', 'app development agency'. Ads running 30+ days are profitable — steal their angle, not their creative. Note the CTA buttons: 'Send WhatsApp Message' dominates for services.",
    tags: ["method", "meta", "research"],
  },
  {
    key: "facebook", title: "3,000+ high-performing ad creatives library (r/FacebookAds)", kind: "campaign",
    url: "https://www.reddit.com/r/FacebookAds/comments/1irjubd/i_built_a_free_library_of_3000_highperforming_ad/",
    format: "swipe library", why: "Filter by 'services' — recurring pattern for dev agencies: pain-question headline, dark UI mockup creative, WhatsApp CTA. Pain-first outperforms portfolio-first for cold audiences.",
    tags: ["swipe", "patterns"],
  },
  {
    key: "facebook", title: "Click-to-Messenger/WhatsApp pattern for local services", kind: "ad",
    format: "feed ad → messenger", why: "Winner structure for services: short pain hook (1 line) + 3-bullet proof + 'Tap Send Message, we reply within the hour'. Conversation-start beats link clicks for high-ticket custom work.",
    tags: ["cta", "messenger", "high-ticket"],
  },
  // ---- instagram ----
  {
    key: "instagram", title: "Carousel: '5 signs you've outgrown your tools' format", kind: "carousel",
    format: "7-frame 1080×1350 carousel",
    hook: "5 signs your business has outgrown template tools",
    why: "Checklist carousels get saved + shared (both weighted). Cover = big claim on brand color, one sign per slide, final slide = CTA 'DM us APP'. Saves are the strongest signal for IG reach.",
    tags: ["carousel", "saves", "checklist"],
  },
  {
    key: "instagram", title: "Reel: screen-recording + voiceover 'how we'd build X'", kind: "reel",
    format: "9:16, 15–25s, screen capture + VO", hook: "Your booking system shouldn't be 6 tabs and a prayer.",
    why: "Low-production screen recordings outperform polished motion graphics for dev shops — process transparency reads as competence. Hook lands on frame 1 as burned-in text.",
    tags: ["reel", "process", "voiceover"],
  },
  // ---- tiktok ----
  {
    key: "tiktok", title: "Algorithm call happens at ~1.5s — visual+verbal hook immediately", kind: "post",
    url: "https://www.lemonlight.com/blog/the-top-10-hooks-businesses-can-use-to-make-tiktok-marketing-work/",
    why: "No intros, no 'hey guys'. Pattern interrupt (unexpected visual) or direct question ('Still using X for Y?'). State the keyword ('custom app') in the first 3s — speech-to-text indexing categorizes the video off it.",
    tags: ["hook", "algorithm", "first-3-seconds"],
  },
  {
    key: "tiktok", title: "Talking-head + screen-record formats dominate B2B", kind: "post",
    url: "https://12amagency.com/blog/how-to-use-tiktok-for-digital-marketing/",
    why: "Authentic > polished for agencies. Winning combo: founder talking head, cut to screen demo every 2s, captions burned in, safe zones top/bottom 15%.",
    tags: ["format", "talking-head", "demo"],
  },
  {
    key: "tiktok", title: "OpusClip: 5 hook types that drive views (34,635 TikToks analyzed)", kind: "post",
    url: "https://www.opus.pro/blog/tiktok-hooks-that-go-viral-2026",
    why: "Use their taxonomy: contrarian, direct-question, POV, mistake-callout, result-first. Rotate across uploads so the account doesn't pattern-match itself into a corner.",
    tags: ["hooks", "data"],
  },
  // ---- linkedin ----
  {
    key: "linkedin", title: "LinkedIn Ad Library — B2B software/agency references", kind: "campaign",
    url: "https://www.linkedin.com/ad-library/home",
    why: "Filter software dev agencies. Document (PDF) ads get the highest save rates on LinkedIn — our document-carousel format mirrors the top performers.",
    tags: ["method", "b2b"],
  },
  {
    key: "linkedin", title: "Document carousel: 'The custom software buyer's checklist'", kind: "carousel",
    format: "8–10 page PDF document post",
    hook: "Most businesses buy software to avoid a decision, not to solve a problem.",
    why: "Founder-voice contrarian opening + one idea per page + numbered pages. Documents get re-opened and saved — LinkedIn's strongest distribution signal for B2B offers.",
    tags: ["document", "saves", "contrarian"],
  },
  // ---- whatsapp ----
  {
    key: "whatsapp", title: "WhatsApp Business success stories (Meta)", kind: "case-study",
    url: "https://www.facebook.com/business/success/categories/whatsapp-business-api",
    why: "Click-to-WhatsApp ad → first message that gives value (a checklist, a quote process), NOT a pitch. Broadcast cadence: max 2/week, business hours only, always with an opt-out line.",
    tags: ["c2wa", "broadcast", "cadence"],
  },
  {
    key: "whatsapp", title: "Broadcast structure that doesn't get blocked", kind: "post",
    format: "broadcast ≤ 3 short paragraphs + status 1080×1920",
    hook: "Quick one: still quoting jobs from a spreadsheet?",
    why: "Pattern: 1-line relevance check → 1-line offer → 1-line CTA ('Reply APP and we'll send the process'). Bold the offer line. Status posts: one bold claim + contact, nothing else.",
    tags: ["broadcast", "copy"],
  },
  // ---- visual ----
  {
    key: "visual", title: "Dribbble — social post layout patterns", kind: "layout",
    url: "https://dribbble.com/search/social-media-post",
    why: "Recurring winner: full-bleed imagery + dark gradient scrim bottom 60% + oversized display type + small brand chip top-left + pill CTA. Exactly the layout our renderer automates.",
    tags: ["layout", "typography", "scrim"],
  },
  {
    key: "visual", title: "Behance — LinkedIn/B2B carousel systems", kind: "layout",
    url: "https://www.behance.net/search/projects/linkedin%2520carousel",
    why: "Alternate dark cover → light content pages, page numbers as design elements (01/08), one idea per page, generous margins (≥80px at 1080 wide). Progress dots on every page.",
    tags: ["carousel", "system", "grid"],
  },
];

for (const e of entries) {
  const r = await fetch(`${BASE}/api/projects/${SLUG}/swipe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(e),
  });
  if (!r.ok) throw new Error(`${e.title}: ${await r.text()}`);
  console.log("✓", e.key, "—", e.title.slice(0, 60));
}
console.log(`\nseeded ${entries.length} swipe entries`);

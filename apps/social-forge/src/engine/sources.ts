import type { SwipeKey } from "./types.ts";

/**
 * Phase 1 research source registry — where to look for what actually performs,
 * per platform, before a single asset is generated. Opened from the Research tab.
 */
export type ResearchSource = {
  key: SwipeKey | "workflow";
  label: string;
  url: string;
  what: string; // what to look for there
  note?: string;
};

export const SOURCES: ResearchSource[] = [
  {
    key: "facebook",
    label: "Meta Ad Library",
    url: "https://www.facebook.com/ads/library",
    what: "Search 'app development', 'custom website', 'web design agency' — active ads only. Note which hooks run for 30+ days (those are profitable).",
    note: "JS-rendered — browse it, screenshot winners, add them as swipe entries.",
  },
  {
    key: "instagram",
    label: "Meta Ad Library (Instagram placements)",
    url: "https://www.facebook.com/ads/library",
    what: "Filter Instagram placements; study carousel frame 1 and reel cover frames — they carry the hook.",
  },
  {
    key: "tiktok",
    label: "TikTok Creative Center — Top Ads",
    url: "https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en",
    what: "Top ads by industry (select 'Services'/'Technology'); capture the 0–3s hook, on-screen text style, and sound.",
  },
  {
    key: "tiktok",
    label: "TikTok Creative Center — Hashtags & Sounds",
    url: "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en",
    what: "Trending hashtags + sounds to reference in captions and sound suggestions.",
  },
  {
    key: "linkedin",
    label: "LinkedIn Ad Library",
    url: "https://www.linkedin.com/ad-library/home",
    what: "B2B ads for software/agencies; study document (PDF carousel) ads — highest save rate format on LinkedIn.",
  },
  {
    key: "whatsapp",
    label: "WhatsApp Business success stories",
    url: "https://www.facebook.com/business/success/categories/whatsapp-business-api",
    what: "Click-to-WhatsApp campaign patterns: first-message structure, broadcast cadence, offer framing.",
  },
  {
    key: "visual",
    label: "Dribbble — social media post designs",
    url: "https://dribbble.com/search/social-media-post",
    what: "Layout patterns: type scale, badge/chip placement, gradient scrims over photography.",
  },
  {
    key: "visual",
    label: "Dribbble — Instagram carousels",
    url: "https://dribbble.com/tags/instagram-carousel-design",
    what: "Carousel systems: numbered slides, consistent margins, swipe-forward arrows.",
  },
  {
    key: "visual",
    label: "Behance — carousel post projects",
    url: "https://www.behance.net/search/projects/carousel%20posts",
    what: "Full carousel case studies — study the grid and how text sits on imagery.",
  },
  {
    key: "visual",
    label: "Behance — LinkedIn carousels",
    url: "https://www.behance.net/search/projects/linkedin%2520carousel",
    what: "B2B document design: big numbers, one idea per page, dark/light alternation.",
  },
  {
    key: "workflow",
    label: "Foreplay — swipe file workflow",
    url: "https://www.foreplay.co/",
    what: "How agencies organize winning ads per campaign (boards, tags, 'why it works' notes). Our swipe/ folder follows the same shape.",
  },
];

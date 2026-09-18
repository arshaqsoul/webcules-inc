export type Platform = "facebook" | "instagram" | "tiktok" | "linkedin" | "whatsapp";
export const PLATFORMS: Platform[] = ["facebook", "instagram", "tiktok", "linkedin", "whatsapp"];

export const PLATFORM_META: Record<Platform, { label: string; color: string; swipeFile: string }> = {
  facebook: { label: "Facebook", color: "#1877F2", swipeFile: "facebook.json" },
  instagram: { label: "Instagram", color: "#E1306C", swipeFile: "instagram.json" },
  tiktok: { label: "TikTok", color: "#25F4EE", swipeFile: "tiktok.json" },
  linkedin: { label: "LinkedIn", color: "#0A66C2", swipeFile: "linkedin.json" },
  whatsapp: { label: "WhatsApp", color: "#25D366", swipeFile: "whatsapp.json" },
};

/** Swipe file key — the 5 platforms + cross-platform visual inspiration. */
export type SwipeKey = Platform | "visual";

export type SwipeEntry = {
  id: string;
  key: SwipeKey; // which swipe file it lives in
  title: string;
  url?: string;
  kind: string; // ad | post | carousel | reel | case-study | layout | campaign | sound | hashtag
  hook?: string; // the actual hook line, when captured
  format?: string; // e.g. "9:16 UGC talking head", "6-page PDF carousel"
  why: string; // why it performs / what to steal
  tags: string[];
  savedAt: string;
  thumb?: string; // relative path inside the project (assets/swipe/)
};

export type Brand = {
  business: string;
  accent: string;
  accent2: string;
  dark: string;
  light: string;
  fontDisplay: string; // canvas font family for headlines
  fontBody: string; // canvas font family for body
};

export type Offer = {
  product: string; // "custom apps & websites"
  promise: string; // outcome-led one-liner
  audience: string;
  pains: string[];
  proofs: string[];
  promo?: string;
  ctaLabel: string;
  ctaUrl?: string;
  whatsapp?: string; // wa.me number for click-to-WhatsApp
};

export type ProjectManifest = {
  schema: "social-forge/project@1";
  slug: string;
  name: string;
  brief: string; // the original prompt/brief text
  tone: string;
  platforms: Platform[];
  brand: Brand;
  offer: Offer;
  status: "active" | "paused" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type PostStatus = "draft" | "in_review" | "changes_requested" | "approved" | "scheduled" | "exported";

export type PostAssetRef = { path: string; role: string }; // path relative to project root

export type Post = {
  id: string; // <platform>-<n>
  schema: "social-forge/post@1";
  project: string;
  platform: Platform;
  format: string; // instagram: feed|carousel|reel · facebook: post|video · tiktok: video · linkedin: text|document · whatsapp: broadcast|status
  status: PostStatus;
  scheduledFor?: string; // ISO datetime
  hook: string;
  copy: Record<string, any>; // platform-specific fields (caption, script, pages, message, hashtags, ...)
  cta: { label: string; url?: string; note?: string };
  assets: PostAssetRef[];
  review?: { note?: string; at?: string };
  meta?: { regen?: number; hookFormula?: string; inspiredBy?: string[] };
  createdAt: string;
  updatedAt: string;
};

export type WorkflowJob = {
  id: string;
  workflow: string; // workflow name in the library
  vars: Record<string, unknown>;
  prompt?: string;
  status: "queued" | "running" | "done" | "error";
  promptId?: string;
  error?: string;
  outputs: { path: string; kind: "image" | "video"; filename: string; elapsedSec?: number }[];
  startedAt: string;
  finishedAt?: string;
};

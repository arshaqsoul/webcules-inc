import fs from "node:fs";
import path from "node:path";

/**
 * Publishing connectors — wired but dormant until API keys are provided.
 * Keys can be set via env (.env.local in the app) or app-config/publishers.json;
 * the UI reads this registry to show readiness per platform. No posting happens
 * anywhere else in the codebase until a connector reports configured=true AND
 * the user explicitly schedules through it.
 */

export type PublisherKey = "facebook" | "instagram" | "tiktok" | "linkedin" | "whatsapp";
export type PublisherStatus = {
  key: PublisherKey;
  label: string;
  configured: boolean;
  missing: string[];
  scopes?: string;
  howTo: string;
};

const REQUIRED: Record<PublisherKey, { label: string; env: string[]; scopes: string; howTo: string }> = {
  facebook: {
    label: "Facebook (Meta Graph)",
    env: ["META_APP_ID", "META_APP_SECRET", "META_PAGE_ID", "META_ACCESS_TOKEN"],
    scopes: "pages_manage_posts,pages_read_engagement,pages_show_list",
    howTo: "Create a Meta app → add 'Pages' product → generate a long-lived Page token (System User token recommended).",
  },
  instagram: {
    label: "Instagram (Meta Graph — IG account tied to the FB Page)",
    env: ["META_APP_ID", "META_APP_SECRET", "IG_USER_ID", "META_ACCESS_TOKEN"],
    scopes: "instagram_basic,instagram_content_publish,pages_show_list",
    howTo: "Business/Creator IG account linked to your FB Page; the content_publish permission needs App Review in prod, or use a dev/test account while testing.",
  },
  tiktok: {
    label: "TikTok (Content Posting API)",
    env: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    scopes: "video.publish,video.upload",
    howTo: "TikTok for Developers app with Content Posting API (direct post needs audited access; unaudited = author-only, private drafts).",
  },
  linkedin: {
    label: "LinkedIn",
    env: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "LINKEDIN_ACCESS_TOKEN", "LINKEDIN_ORG_URN"],
    scopes: "w_member_social (org posts: rw_organization_admin)",
    howTo: "LinkedIn app with 'Share on LinkedIn' product; generate a member or organization token.",
  },
  whatsapp: {
    label: "WhatsApp Business (Cloud API)",
    env: ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_WABA_ID"],
    scopes: "cloud_api",
    howTo: "Meta Business → WhatsApp Manager → create phone number + permanent token. Broadcasts require pre-approved message templates.",
  },
};

export function publisherStatuses(): PublisherStatus[] {
  const f = (() => {
    try {
      // optional app-config/publishers.json in webcules-inc/apps/social-forge
      const p = path.resolve(import.meta.dirname, "..", "..", "app-config", "publishers.json");
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, string>;
    } catch {}
    return {};
  })();
  return (Object.keys(REQUIRED) as PublisherKey[]).map((key) => {
    const spec = REQUIRED[key];
    const missing = spec.env.filter((e) => !process.env[e] && !f[e]);
    return { key, label: spec.label, configured: missing.length === 0, missing, scopes: spec.scopes, howTo: spec.howTo };
  });
}

import { mulberry32, pick, pickMany, nowIso } from "./util.ts";
import { loadSwipe } from "./swipe.ts";
import { nextPostId } from "./projects.ts";
import type { Platform, Post, ProjectManifest } from "./types.ts";

/**
 * Phase 3 — the copywriting engine. 100% offline, formula-driven: proven direct-response
 * structures (hook → agitation → mechanism → proof → CTA) filled from the project brief.
 * Deterministic per (project, platform, regen) so regeneration rotates real variants
 * instead of shuffling randomly. Every pack's CTA drives one action: inquire about a
 * custom app/site from Webcules.
 */

export type Ctx = {
  m: ProjectManifest;
  rng: () => number;
  pain: string;
  proof: string;
  audienceShort: string; // "business owners"
};

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

function audienceShort(aud: string): string {
  const m = aud.match(/([\w&-]+(?:\s[\w&-]+)?)\s+(?:who|that|stuck|running|paying)/i);
  if (m) return m[1]!.toLowerCase();
  return aud.split(/[,.;]/)[0]!.split(/\s+/).slice(0, 3).join(" ").toLowerCase();
}

// ---------------------------------------------------------------- hooks

type HookFormula = { id: string; name: string; build: (c: Ctx) => string };

const HOOKS: HookFormula[] = [
  {
    id: "pain-question",
    name: "Pain question",
    build: (c) => pick(c.rng, [`Still running your business out of ${pick(c.rng, ["DMs", "spreadsheets", "WhatsApp chats", "notion docs and sticky notes"])}?`, `How many customers did ${c.pain.split(" ").slice(0, 4).join(" ")} cost you this month?`, `If your "system" is 6 open tabs and a good memory — this is for you.`]),
  },
  {
    id: "what-if",
    name: "What if",
    build: (c) => pick(c.rng, [`What if ${c.audienceShort} could afford the same custom app the big players use?`, `What if your business ran on software built exactly for it — not the other way around?`]),
  },
  {
    id: "contrarian",
    name: "Contrarian take",
    build: (c) => pick(c.rng, [`You don't need another SaaS subscription. You need software that's yours.`, `Templates aren't cheap. They're expensive with worse branding.`, `Stop renting your software. ${cap(c.audienceShort)} are starting to own theirs.`]),
  },
  {
    id: "stat-gap",
    name: "Stat / gap",
    build: (c) => pick(c.rng, [`Most ${c.audienceShort} won't invest in custom software this year. That's exactly why the ones who do will stand out.`, `Your customers already expect an app. Most businesses near you can't offer one. That gap is the opportunity.`]),
  },
  {
    id: "pov",
    name: "POV",
    build: (c) => `POV: your competitor just launched their app and your customers noticed.`,
  },
  {
    id: "listicle",
    name: "Listicle",
    build: (c) => pick(c.rng, [`5 signs your business has outgrown template tools`, `3 ways ${c.audienceShort} lose money to "almost-fits" software`, `The 10-minute audit that tells you if you need a custom app`]),
  },
  {
    id: "story",
    name: "Mini story",
    build: (c) => pick(c.rng, [`We watched a business drown in ${pick(c.rng, ["booking spreadsheets", "quote PDFs", "missed DMs"])}. So we built them an app. Here's what changed.`, `A client told us "we'll just use another template." 6 months later, they called us back. Here's why.`]),
  },
  {
    id: "offer-direct",
    name: "Direct offer",
    build: (c) => `${c.m.brand.business} builds ${c.m.offer.product}. ${pick(c.rng, ["Here's how it works, step by step.", "No bloat, no hostage contracts — here's the deal.", "Here's what you get and what it takes."])}`,
  },
  {
    id: "before-after",
    name: "Before → after",
    build: (c) => `Before: ${cap(c.pain)}. After: one app, built for exactly how you work.`,
  },
  {
    id: "founder",
    name: "Founder voice",
    build: (c) => pick(c.rng, [`We started ${c.m.brand.business} because ${c.audienceShort} kept getting sold software they didn't own.`, `Hot take from our team: most businesses don't need more tools. They need one tool that fits.`]),
  },
  {
    id: "speed",
    name: "Speed / timeline",
    build: (c) => pick(c.rng, [`An app your customers actually use — scoped this week, built in weeks, not quarters.`, `From first call to shipped app: here's the honest timeline.`]),
  },
];

function hookBank(_c: Ctx): HookFormula[] {
  return [
    ...HOOKS,
    {
      id: "transparency",
      name: "Process transparency",
      build: (c2) => pick(c2.rng, [`Fixed scope. Fixed timeline. ${c2.proof}.`, `We quote in days, not "discovery phases." Here's our exact process for building your app.`]),
    },
  ];
}

function buildHook(c: Ctx): { hook: string; formula: string } {
  const bank = hookBank(c);
  const f = pick(c.rng, bank);
  const hook = f.build(c);
  return { hook: hook || `${c.m.brand.business}: ${c.m.offer.promise}`, formula: f.name };
}

// ---------------------------------------------------------------- hashtags

const TAGS: Record<Platform, { brand: string[]; niche: string[]; audience: string[]; reach: string[] }> = {
  instagram: {
    brand: ["#webcules"],
    niche: ["#customappdevelopment", "#appdevelopmentcompany", "#webdevelopmentagency", "#customsoftware", "#appdesign", "#webdevelopment", "#softwaredevelopment"],
    audience: ["#smallbusinessowner", "#smallbusinesstech", "#entrepreneurlife", "#businessgrowth", "#digitransformation", "#founderlife"],
    reach: ["#techtok", "#buildinpublic", "#startuplife", "#digitalagency", "#growthmarketing", "#businesstools"],
  },
  facebook: { brand: ["#webcules"], niche: ["#customappdevelopment", "#smallbusinessgrowth", "#digitaltransformation"], audience: ["#smallbusinessowner"], reach: ["#buildinpublic"] },
  tiktok: { brand: ["#webcules"], niche: ["#smallbusinesstok", "#apps", "#tech"], audience: ["#smallbusinessowner", "#entrepreneur"], reach: ["#buildinpublic", "#learnontiktok"] },
  linkedin: { brand: ["#webcules"], niche: ["#customsoftware", "#digitaltransformation", "#softwaredevelopment"], audience: ["#smallbusiness", "#founders"], reach: ["#buildinpublic"] },
  whatsapp: { brand: [], niche: [], audience: [], reach: [] }, // WhatsApp: no hashtags
};

function hashtags(c: Ctx, platform: Platform): string[] {
  const t = TAGS[platform];
  if (platform === "whatsapp") return [];
  const n = platform === "instagram" ? 18 : platform === "tiktok" ? 5 : 4;
  return [...t.brand, ...pickMany(c.rng, t.niche, Math.ceil(n / 2)), ...pickMany(c.rng, t.audience, Math.ceil(n / 3)), ...pickMany(c.rng, t.reach, Math.max(2, n - Math.ceil(n / 2) - Math.ceil(n / 3)))].slice(0, n);
}

// ---------------------------------------------------------------- CTA bank

function ctaLine(c: Ctx, platform: Platform): string {
  const url = c.m.offer.ctaUrl ? ` ${c.m.offer.ctaUrl}` : "";
  const wa = c.m.offer.whatsapp ? `wa.me/${c.m.offer.whatsapp}` : "";
  switch (platform) {
    case "instagram":
      return pick(c.rng, [`DM us "APP" and we'll scope yours this week.`, `Tap the link in bio to book a free scoping call.${url}`, `Comment "BUILD" and we'll send you our process + pricing.`, `Send us a DM — tell us what your business is drowning in, we'll tell you what to build first.`]);
    case "facebook":
      return pick(c.rng, [`Tap "Send Message" — we'll reply with our process, timelines and a fixed quote.`, `Click through and tell us what you need built. Fixed scope, fixed price.${url || wa ? ` ${url || wa}` : ""}`]);
    case "tiktok":
      return pick(c.rng, [`Comment "APP" and we'll walk you through it.`, `Link in bio — free scoping call, no pitch deck.${url}`, `Follow for how we build custom apps — then DM us yours.`]);
    case "linkedin":
      return pick(c.rng, [`If your business has outgrown its tools, my DMs are open — or book a scoping call.${url}`, `Comment or DM "custom" and I'll share how we scope, quote and ship.${url}`]);
    case "whatsapp":
      return pick(c.rng, [`Reply "APP" and we'll send you our process + a free scoping call slot.`, `Reply with the word "BUILD" — we'll take it from there.`]);
  }
}

// ---------------------------------------------------------------- body builders

function igCaption(c: Ctx): string[] {
  return [
    c.pain ? cap(c.pain) + "." : cap(c.m.offer.pains[0] ?? "Your business has outgrown its tools") + ".",
    "",
    pick(c.rng, [
      `${c.m.brand.business} designs and builds ${c.m.offer.product} — mapped to how YOUR business actually runs.`,
      `That's why ${c.m.brand.business} exists: ${c.m.offer.promise.toLowerCase()}`,
    ]),
    "",
    ...pickMany(c.rng, c.m.offer.proofs, Math.min(3, c.m.offer.proofs.length)).map((p) => `✓ ${p}`),
    "",
    ctaLine(c, "instagram"),
  ];
}

function fbPrimary(c: Ctx): string[] {
  return [
    c.pain ? cap(c.pain) + " — you're not alone." : "Your business has outgrown its tools.",
    "",
    `${c.m.brand.business} builds ${c.m.offer.product}. ${c.m.offer.promise}`,
    c.m.offer.promo ? `📌 ${c.m.offer.promo}` : "",
    "",
    ctaLine(c, "facebook"),
  ].filter((l) => l !== "");
}

function liBody(c: Ctx): string[] {
  const structure = pick(c.rng, ["insight", "story", "checklist"]);
  if (structure === "story") {
    return [
      c.pain ? cap(c.pain) + "." : "Most small businesses don't have a software problem. They have a mismatch problem.",
      "",
      `The tools almost fit. So the team builds workarounds. The workarounds become the process. Then nobody can untangle it.`,
      "",
      `That's usually when ${c.audienceShort} call us. We build ${c.m.offer.product} — designed around the process, not the other way around.`,
      "",
      ...c.m.offer.proofs.slice(0, 3).map((p) => `→ ${p}`),
      "",
      ctaLine(c, "linkedin"),
    ];
  }
  if (structure === "checklist") {
    return [
      `${pick(c.rng, ["3 signs", "5 signs"])} your business is ready for custom software:`,
      "",
      ...pickMany(c.rng, [
        "① You have a spreadsheet 3 people update and nobody trusts.",
        "② Your team uses 4+ SaaS tools that overlap 60%.",
        "③ You've said " + '"we\'ll just build it internally"' + " for over a year.",
        "④ Customer requests live in DMs, not a system.",
        "⑤ Your competitor's app is better than your website.",
      ], 4),
      "",
      `If you nodded twice — that's exactly who ${c.m.brand.business} builds for.`,
      "",
      ctaLine(c, "linkedin"),
    ];
  }
  return [
    `Unpopular opinion: ${pick(c.rng, ["most businesses buy software to avoid a decision, not to solve a problem.", "SaaS subscriptions are renting a solution that almost fits. Custom software is owning one that does."])}`,
    "",
    `${cap(c.audienceShort)} keep paying monthly for tools they bend their process around. Flip it:`,
    "",
    ...pickMany(c.rng, [
      "→ Map how your business actually works (1 week)",
      "→ Design the app around that map (1 week)",
      "→ Build, ship, iterate (weeks, not quarters)",
      "→ You own the code. Forever.",
    ], 4),
    "",
    `That's the ${c.m.brand.business} model. ${c.m.offer.promise}`,
    "",
    ctaLine(c, "linkedin"),
  ];
}

function ttScript(c: Ctx): { t: string; line: string }[] {
  return [
    { t: "0–3s", line: `HOOK ON SCREEN + SPOKEN: "${pick(c.rng, ["Stop buying software that almost fits.", "Your business doesn't need more apps. It needs ONE.", "Template sites are costing you customers."])}"` },
    { t: "3–8s", line: `Show the mess: tabs, spreadsheets, ${pick(c.rng, ["missed DMs", "quote chaos", "double bookings"])} — quick cuts, real screens if possible.` },
    { t: "8–15s", line: `The turn: "${cap(c.m.offer.product)} — built around how you actually work." Show a clean UI mockup / generated demo screen.` },
    { t: "15–22s", line: `Proof beat: ${c.proof}. Flash 2–3 text callouts.` },
    { t: "22–30s", line: `CTA: "${ctaLine(c, "tiktok")}" — point to comments/link in bio.` },
  ];
}

function waBroadcast(c: Ctx): string[] {
  return [
    `👋 *${c.m.brand.business}* — ${c.m.offer.product}`,
    ``,
    pick(c.rng, [`Quick one: ${c.pain}?`, `Tired of tools that almost fit?`]),
    `We build the exact app or site your business needs. ${c.m.offer.promise}`,
    c.m.offer.promo ? `🎁 ${c.m.offer.promo}` : ``,
    ``,
    ctaLine(c, "whatsapp"),
  ].filter((l) => l !== undefined);
}

// ---------------------------------------------------------------- carousel / document outlines

function carouselSlides(c: Ctx): { title: string; text: string }[] {
  return [
    { title: c.pain ? cap(c.pain.split(",")[0]!) : "Your tools don't fit", text: "Sound familiar? Swipe →" },
    { title: "The real cost of 'almost fits'", text: pick(c.rng, ["Hours lost to workarounds. Data living in 5 places. A process nobody can explain.", "You pay for features you don't use — and still do the boring parts manually."]) },
    { title: "The alternative", text: `One app. Built for exactly how ${c.audienceShort} work.` },
    { title: "How we do it", text: `1. We map your real process\n2. We design the app around it\n3. ${c.proof}` },
    { title: "What you own", text: c.m.offer.proofs.slice(0, 3).map((p) => `✓ ${p}`).join("\n") },
    { title: `${c.m.brand.business} builds ${c.m.offer.product}`, text: c.m.offer.promise },
    { title: "Your move", text: `${ctaLine(c, "instagram")}` },
  ];
}

function liDocPages(c: Ctx): { title: string; text: string }[] {
  return [
    { title: c.pain ? cap(c.pain.split(",")[0]!) : "Your software doesn't fit your business", text: "A short guide for founders & operators — swipe through." },
    { title: "The problem with 'almost fits'", text: "SaaS tools are built for everyone. So they fit no one exactly. Your process bends around the tool — and the cracks show up in revenue." },
    { title: "Sign #1 you've outgrown it", text: "A spreadsheet 3 people update and nobody trusts." },
    { title: "Sign #2", text: "Customer requests living in DMs instead of a system." },
    { title: "Sign #3", text: 'You said "we\'ll build it internally"… a year ago.' },
    { title: "The custom path", text: `Map → design → build → ship. ${pick(c.rng, ["Weeks, not quarters.", "One team, end to end."])}` },
    { title: "What you actually get", text: c.m.offer.proofs.slice(0, 3).map((p) => `→ ${p}`).join("\n") },
    { title: `${c.m.brand.business} — ${c.m.offer.product}`, text: c.m.offer.promise },
    { title: "Let's talk", text: ctaLine(c, "linkedin") },
  ];
}

// ---------------------------------------------------------------- formats per platform

export const PLATFORM_FORMATS: Record<Platform, { id: string; label: string; spec: string }[]> = {
  instagram: [
    { id: "feed", label: "Feed post", spec: "1080×1350 (4:5)" },
    { id: "carousel", label: "Carousel", spec: "1080×1350 × 5–7 frames" },
    { id: "reel", label: "Reel", spec: "1080×1920 (9:16), hook ≤ 3s" },
  ],
  facebook: [
    { id: "post", label: "Post / ad creative", spec: "1080×1080 + link card 1200×627" },
    { id: "video", label: "Short video post", spec: "9:16 or 1:1, ≤ 30s" },
  ],
  tiktok: [{ id: "video", label: "Video", spec: "1080×1920, hook in first 3s" }],
  linkedin: [
    { id: "text", label: "Text post", spec: "1300 chars visible, 3000 max" },
    { id: "document", label: "Document carousel (PDF)", spec: "1080×1350 pages → PDF" },
  ],
  whatsapp: [
    { id: "broadcast", label: "Broadcast message", spec: "≤ 4096 chars, plain text + bold" },
    { id: "status", label: "Status graphic", spec: "1080×1920, text ≤ 40% of screen" },
  ],
};

// ---------------------------------------------------------------- the generator

export function generatePost(m: ProjectManifest, platform: Platform, opts: { format?: string; regen?: number; seedSalt?: string } = {}): Post {
  const regen = opts.regen ?? 0;
  const formats = PLATFORM_FORMATS[platform];
  const format = opts.format && formats.some((f) => f.id === opts.format) ? opts.format : formats[regen % formats.length]!.id;

  let seed = 0;
  for (const ch of `${m.slug}|${platform}|${format}|${regen}|${opts.seedSalt ?? ""}`) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const rng = mulberry32(seed);

  const ctx: Ctx = {
    m,
    rng,
    pain: pick(rng, m.offer.pains),
    proof: pick(rng, m.offer.proofs),
    audienceShort: audienceShort(m.offer.audience),
  };
  const { hook, formula } = buildHook(ctx);

  const base: any = {
    schema: "social-forge/post@1" as const,
    project: m.slug,
    platform,
    format,
    status: "draft" as const,
    hook,
    cta: { label: m.offer.ctaLabel, url: m.offer.ctaUrl, note: platform === "whatsapp" && m.offer.whatsapp ? `wa.me/${m.offer.whatsapp}` : undefined },
    assets: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    meta: { regen, hookFormula: formula },
  };

  let copy: Record<string, any>;
  switch (`${platform}:${format}`) {
    case "instagram:feed":
      copy = { caption: [...igCaption(ctx)], hashtags: hashtags(ctx, platform), altText: `${hook} — ${m.brand.business} custom app development` };
      break;
    case "instagram:carousel":
      copy = { caption: [hook, "", `${m.brand.business} builds ${m.offer.product}. Swipe →`], slides: carouselSlides(ctx), hashtags: hashtags(ctx, platform) };
      break;
    case "instagram:reel":
      copy = {
        caption: [hook, "", `Full breakdown in the video 👆`, "", ctaLine(ctx, "instagram")],
        script: ttScript(ctx),
        overlays: [hook, "One app. Built for you.", ctaLine(ctx, "instagram")],
        sound: pick(rng, ["trending minimal tech beat (~120bpm) — check Creative Center popular sounds", "soft spoken-word / voiceover trend", "lo-fi build-in-public loop"]),
        hashtags: hashtags(ctx, platform),
        coverText: hook,
      };
      break;
    case "facebook:post":
      copy = {
        primaryText: fbPrimary(ctx),
        headline: pick(rng, [`${m.brand.business} — Custom Apps & Sites`, `Your business. Your app. Your code.`, `Fixed scope. Real timeline. Yours.`]),
        description: m.offer.promise,
        ctaButton: pick(rng, ["Send WhatsApp Message", "Send Message", "Learn More", "Get Quote"]),
        targetingNote: `${m.offer.audience} · interests: small business tools, entrepreneurship, SaaS`,
      };
      break;
    case "facebook:video":
      copy = {
        primaryText: fbPrimary(ctx),
        script: ttScript(ctx),
        overlays: [hook, ctaLine(ctx, "facebook")],
        ctaButton: "Send WhatsApp Message",
        targetingNote: `${m.offer.audience} · video views + message campaigns`,
      };
      break;
    case "tiktok:video":
      copy = {
        script: ttScript(ctx),
        overlays: [hook.slice(0, 60), "One app. Yours.", ctaLine(ctx, "tiktok").slice(0, 60)],
        caption: [hook, "", ctaLine(ctx, "tiktok")],
        sound: pick(rng, ["trending upbeat remix (top-10 Creative Center this week)", "spoken hook + beat drop at 3s", "minimal house loop for UI showcase"]),
        shootingNotes: ["0–3s must land the hook — no logo intros", "show real screens/UI, cut every 2s", "captions burned-in, safe-zone top & bottom 15%"],
        hashtags: hashtags(ctx, platform),
      };
      break;
    case "linkedin:text":
      copy = { body: liBody(ctx), hashtags: hashtags(ctx, platform), commentBait: pick(rng, ["What's the tool your business outgrew first? 👇", "Agree or disagree: own > rent — even for software."]) };
      break;
    case "linkedin:document":
      copy = { pages: liDocPages(ctx), postText: [hook, "", `We put the whole playbook in this doc — swipe through.`, "", ctaLine(ctx, "linkedin")], hashtags: hashtags(ctx, platform) };
      break;
    case "whatsapp:broadcast":
      copy = { message: waBroadcast(ctx), optOut: "Reply STOP to opt out", sendWindow: "business hours only (no 2am blasts)" };
      break;
    case "whatsapp:status":
      copy = { statusText: pick(rng, [hook, `${m.brand.business} — ${m.offer.product}`, m.offer.promo ?? `Custom app, built for you. Ask us how.`]), subline: ctaLine(ctx, "whatsapp") };
      break;
    default:
      copy = {};
  }

  // link swipe entries with captured hooks as inspiration trail
  const swipeHooks = loadSwipe(m.slug, platform).filter((e) => e.hook);
  if (swipeHooks.length) {
    base.meta!.inspiredBy = pickMany(rng, swipeHooks, Math.min(2, swipeHooks.length)).map((e) => `${e.id}: ${e.hook!.slice(0, 60)}`);
  }

  return { ...base, id: nextPostId(m.slug, platform), copy } as Post;
}

/** Generate a full pack: every platform in the project, default format rotation. */
export function generatePack(m: ProjectManifest, opts: { perPlatform?: number; regen?: number } = {}): Post[] {
  const posts: Post[] = [];
  for (const p of m.platforms) {
    const n = Math.max(1, opts.perPlatform ?? 1);
    for (let i = 0; i < n; i++) posts.push(generatePost(m, p, { regen: (opts.regen ?? 0) + i }));
  }
  return posts;
}

/** Alternate hooks for the editor (3 options without leaving the panel). */
export function altHooks(m: ProjectManifest, platform: Platform, regen: number): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 3; i++) {
    let seed = 0;
    for (const ch of `${m.slug}|${platform}|alt|${regen}|${i}`) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
    const rng = mulberry32(seed);
    const ctx: Ctx = { m, rng, pain: pick(rng, m.offer.pains), proof: pick(rng, m.offer.proofs), audienceShort: audienceShort(m.offer.audience) };
    out.push(buildHook(ctx).hook);
  }
  return out;
}

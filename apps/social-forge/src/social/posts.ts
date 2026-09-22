import fs from "node:fs";
import path from "node:path";
import { SOCIAL_ROOT, ensureDir, flagStr, log, readManifest, writeManifest, type Args } from "./util.ts";

export async function cmdPost(args: Args) {
  const slug = flagStr(args, "project");
  if (!slug) log.err("usage: social post --project <slug>") || process.exit(1);
  const m = readManifest(slug);
  const variants = Object.keys(m.variants ?? {});
  if (!variants.length) log.warn("no variants in manifest — the carousel section will be a placeholder");

  const catchphrase = m.catchphrase || "Your website has 3 seconds to make an impression.";
  const cta = m.cta;
  const tags = (m.hashtags ?? []).map((t) => `#${t.replace(/^#/, "")}`);
  const name = m.component.name || slug;
  const dir = path.join(SOCIAL_ROOT, slug, "social", "posts");
  ensureDir(dir);

  const files: Record<string, string> = {
    "facebook.md": `# Facebook — ${name}

## Feed post (attach: renders/${slug}-wide.mp4)

🌌 Most websites open like a spreadsheet. This one opens like a launch.

This is "${name}" — a signature hero effect we built from scratch. Not stock footage, not a
template: a live React component, running in a real browser, generated 100% in-house on our own
hardware.

It's the kind of first impression we build into Saskatoon business sites — and here's the part
nobody else does: **you see your redesigned site, live, before you pay a dollar.**

👉 ${cta}

📍 Saskatoon, SK · 🌐 webcules.com

${tags.slice(0, 4).join(" ")}

## Reel (attach: renders/${slug}-reel.mp4 — 1080×1920, hook is baked into the video)

${catchphrase}

This is a React component running live — the same signature moments we build into local business
websites. You see your redesign before you spend a dollar.

👉 ${cta}

${tags.slice(0, 5).join(" ")}
`,

    "instagram.md": `# Instagram — @studio.webcules · ${name}

## Carousel (stills/ in order: ${variants.join(", ") || "v1, v2, v3"} — 1080×1350)

Slide 1 — the hook: ${catchphrase}
Slides 2+ — one variant each; caption the vibe of the palette, one line per slide
Last slide — the CTA card: "Your site, redesigned live before you pay. 📍 YXE"

Caption:

${catchphrase}

This isn't stock footage — it's "${name}", a React component we built from scratch, running live
in the browser. Same energy goes into every Saskatoon business site we ship. ${cta}

${tags.join(" ")}

## Reel (attach: renders/${slug}-reel.mp4)

${catchphrase}

Not stock. Not a template. A component we engineered — and it can be your homepage.

${cta} 👇

${tags.join(" ")}
`,

    "hooks.md": `# Hook / catchphrase options — ${name}

Pick one per post; never repeat within a week. The best ones name a feeling the owner has felt.

1. ${catchphrase}
2. This is a React component. Not stock footage. Not a template.
3. Your customers decide in 3 seconds. Spend them like this.
4. POV: your website's first impression. 🌌
5. We build the part of your website people remember.
6. Light streams. Zero templates. Built in Saskatoon.

${cta ? `CTA used everywhere: "${cta}"` : ""}
`,

    "README.md": `# Posting checklist — ${name}

Nothing auto-posts. Everything here is copy-paste, in this order:

1. **Facebook reel first** (biggest local reach per minute of effort):
   Page → create Reel → attach \`renders/${slug}-reel.mp4\` → paste the Reel caption from facebook.md.
2. **Facebook feed post** → attach \`renders/${slug}-wide.mp4\` + the feed caption.
3. **Instagram carousel** → post the stills in the order listed in instagram.md.
4. **Instagram Reel** → attach the same reel mp4 (IG doesn't mind cross-posting) + its caption.
5. Reply to every comment within the hour — early replies are the reach signal.

Optional: a ComfyUI poster (qwen-image) of the best still + catchphrase as the page's featured
photo while this component is the lead post.
`,
  };

  for (const [file, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), body);
  m.status = "posted" !== m.status ? "rendered" : m.status; // copy is written; posting is still manual
  writeManifest(slug, m);

  log.ok(`post pack: ${path.relative(SOCIAL_ROOT, dir)}/ (${Object.keys(files).length} files)`);
  console.log("  facebook.md · instagram.md · hooks.md · README.md — nothing posts automatically");
}

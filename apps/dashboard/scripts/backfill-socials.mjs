// One-off: backfill lead social handles (facebook/instagram/tiktok) for the DM channels.
//  - handles mined from research/*.md and revamp-analysis.md (below)
//  - missing ones fetched from the business's live site (footer/header social links)
//  - stores bare handles ("venicehousepizza", no URL, no @) — what socialDmLink() expects
//  - writes the contact block back into each project's gtm.json (source of truth)
// Run: node scripts/backfill-socials.mjs   (from apps/dashboard)
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";

const FORGE_ROOT = process.env.FORGE_ROOT ?? "C:/Users/arsha/Documents/projects/webcules";
const db = createClient({ url: process.env.DATABASE_URL ?? "file:./data/dashboard.db" });

// mined from the forge research files — venicehouse: revamp-analysis.md, wintringham: gtm.json
const mined = {
  venicehouse: { facebook: "venicehousepizza" },
  wintringhamroofing: { facebook: "Wintringham-Roofing-455483817987914" },
};

const BAD = ["darkmodedesign", "webcules", "arshaq", "example", "wix", "sentry", "sharer", "share.php", "dialog", "plugins", "watch", "hashtag", "embed", "oembed", "tr"];
const IG_JUNK = ["p", "reel", "reels", "explore", "accounts", "share", "stories", "tv"];

const FB_RE = /https?:\/\/(?:www\.|m\.|web\.|business\.)?(?:facebook\.com|fb\.me|m\.me)\/([A-Za-z0-9._-]+)/gi;
const FB_PROFILE_RE = /facebook\.com\/profile\.php\?(?:[^>]*&)?id=(\d{6,})/i; // page by numeric id — m.me/<id> works
const IG_RE = /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)/gi;
const TT_RE = /https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9._]+)/gi;

function pick(matches, junk = []) {
  for (const m of matches) {
    const handle = m[1].replace(/\.php$/, "");
    if (!handle || junk.includes(handle)) continue;
    if (/^\d+$/.test(handle)) continue; // bare numeric paths are pixel/FBML junk — real numeric pages come via profile.php?id=
    if (BAD.some((b) => handle.toLowerCase().includes(b))) continue;
    return handle;
  }
  return null;
}

async function siteSocials(url) {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(12000), headers: { "user-agent": "Mozilla/5.0" } });
    const html = await res.text();
    const fbProfile = html.match(FB_PROFILE_RE)?.[1];
    return {
      facebook: fbProfile ?? pick([...html.matchAll(FB_RE)]) ?? undefined,
      instagram: pick([...html.matchAll(IG_RE)], IG_JUNK) ?? undefined,
      tiktok: pick([...html.matchAll(TT_RE)]) ?? undefined,
    };
  } catch {
    return {};
  }
}

const projects = await db.execute("select p.slug, p.lead_id, l.facebook, l.instagram, l.tiktok from projects p join leads l on l.id = p.lead_id");
let updated = 0;
const still = [];

for (const row of projects.rows) {
  const slug = row.slug;
  if (row.facebook && row.instagram && row.tiktok) continue;

  let info = { ...(mined[slug] ?? {}) };
  const gtmPath = path.join(FORGE_ROOT, slug, "research", "gtm.json");
  let gtm;
  try {
    gtm = JSON.parse(readFileSync(gtmPath, "utf8"));
  } catch {
    still.push(`${slug}: no gtm.json`);
    continue;
  }

  const url = gtm.url;
  if (url && (!info.facebook || !info.instagram || !info.tiktok)) {
    const found = await siteSocials(url);
    for (const net of ["facebook", "instagram", "tiktok"]) {
      if (!info[net] && found[net]) {
        info[net] = found[net];
        console.log(`${slug}: ${net} from live site -> ${found[net]}`);
      }
    }
  }
  if (!Object.keys(info).length) {
    still.push(`${slug}: no social links found — needs manual entry`);
    continue;
  }

  await db.execute({
    sql: "update leads set facebook = ?, instagram = ?, tiktok = ? where id = ?",
    args: [row.facebook || info.facebook || "", row.instagram || info.instagram || "", row.tiktok || info.tiktok || "", row.lead_id],
  });

  // keep gtm.json as source of truth for the future
  gtm.contact = {
    ...(gtm.contact ?? {}),
    ...(info.facebook ? { facebook: info.facebook } : {}),
    ...(info.instagram ? { instagram: info.instagram } : {}),
    ...(info.tiktok ? { tiktok: info.tiktok } : {}),
    address: gtm.contact?.address,
  };
  if (gtm.contact.address === undefined) delete gtm.contact.address;
  writeFileSync(gtmPath, JSON.stringify(gtm, null, 2) + "\n");

  updated++;
  console.log(`${slug}: fb ${info.facebook ?? "-"} / ig ${info.instagram ?? "-"} / tt ${info.tiktok ?? "-"}`);
}

console.log(`\n${updated} leads updated; gtm.json contact blocks written.`);
if (still.length) {
  console.log("Still needs manual entry (use the lead's Edit button):");
  for (const s of still) console.log(`  - ${s}`);
}

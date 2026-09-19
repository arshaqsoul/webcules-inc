// Round 2: fill remaining contact info.
//  - phones/emails mined from research/*.md (done in shell), minus research-source artifacts
//  - missing emails fetched from the business's live site (mailto: / plain emails)
//  - writes the contact block back into each project's gtm.json (source of truth)
// Run: node scripts/backfill-contacts-2.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";

const FORGE_ROOT = process.env.FORGE_ROOT ?? "C:/Users/arsha/Documents/projects/webcules";
const db = createClient({ url: process.env.DATABASE_URL ?? "file:./data/dashboard.db" });

// emails/phones mined from research files (round 1) — darkmodedesign.com filtered out (research source, not client)
const mined = {
  mexroofing: { phone: "(306) 380-5812" },
  amtopmlandscaping: { phone: "306-241-6412" },
  kscontracting: { email: "clint@kscontracting.ca" },
  jbcontractingsaskatoon: { email: "jbcontractingsvc@sasktel.net", phone: "(306) 221-9473" },
  bridgecitycollision: { phone: "306-653-4505" },
  northstarcleaners: { phone: "(306) 374-7827" },
  saskvalleyrefrigeration: { phone: "306-290-1112" },
  wedoall: { email: "sales@wedoall.ca", phone: "306-713-8672" },
  venicehouse: { phone: "(306) 242-4242" },
  gibsonsfishandchips: { phone: "306-374-1411" },
  caverestaurant: { email: "georgekosmas@hotmail.com", phone: "(306) 374-5090" },
  glenwoodauto: { phone: "(306) 700-5455" },
  avalonauto: { email: "avalonauto@sasktel.net", phone: "(306) 343-9551" },
  broadwaycafe: { email: "info@broadwaycafesaskatoon.ca", phone: "(306) 652-8244" },
  klassendriving: { email: "administration@klassendrivingschool.com", phone: "(306) 260-2984" },
  hometowndiner: { phone: "306-665-1565" },
  tech7auto: { email: "service@tech7autorepair.com", phone: "(306) 978-2269" },
};

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
const BAD = ["darkmodedesign", "example", "sentry", "wixpress", "webcules", "arshaq"];

async function siteEmail(url) {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(12000), headers: { "user-agent": "Mozilla/5.0" } });
    const html = await res.text();
    const emails = [...html.matchAll(EMAIL_RE)].map((m) => m[0].toLowerCase()).filter((e) => !BAD.some((b) => e.includes(b)));
    return emails[0] ?? null;
  } catch {
    return null;
  }
}

const projects = await db.execute("select p.slug, p.lead_id, l.email, l.phone from projects p join leads l on l.id = p.lead_id");
let updated = 0;
const still = [];

for (const row of projects.rows) {
  const slug = row.slug;
  if (row.email && row.phone) continue;
  const gtmPath = path.join(FORGE_ROOT, slug, "research", "gtm.json");
  let gtm;
  try {
    gtm = JSON.parse(readFileSync(gtmPath, "utf8"));
  } catch {
    still.push(`${slug}: no gtm.json`);
    continue;
  }

  let info = mined[slug] ?? {};
  if (!info.email && gtm.url) {
    const found = await siteEmail(gtm.url);
    if (found) {
      info.email = found;
      console.log(`${slug}: email from live site -> ${found}`);
    }
  }
  if (!info.email && !info.phone) {
    still.push(`${slug}: nothing found — needs manual entry`);
    continue;
  }

  const email = row.email || info.email || "";
  const phone = row.phone || info.phone || "";
  await db.execute({ sql: "update leads set email = ?, phone = ? where id = ?", args: [email, phone, row.lead_id] });

  // keep gtm.json as source of truth for the future
  gtm.contact = { ...(gtm.contact ?? {}), ...(email ? { email } : {}), ...(phone ? { phone } : {}), address: gtm.contact?.address };
  if (gtm.contact.address === undefined) delete gtm.contact.address;
  writeFileSync(gtmPath, JSON.stringify(gtm, null, 2) + "\n");

  updated++;
  console.log(`${slug}: ${email || "-"} / ${phone || "-"}`);
}

console.log(`\n${updated} leads updated; gtm.json contact blocks written.`);
if (still.length) {
  console.log("Still needs manual entry (use the lead's Edit button):");
  for (const s of still) console.log(`  - ${s}`);
}

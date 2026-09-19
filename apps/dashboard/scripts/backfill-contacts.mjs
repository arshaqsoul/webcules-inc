// One-off: backfill lead contact info (email/phone) from webcules/<slug>/research/gtm.json
// Run: node scripts/backfill-contacts.mjs   (from apps/dashboard)
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";

const FORGE_ROOT = process.env.FORGE_ROOT ?? "C:/Users/arsha/Documents/projects/webcules";
const db = createClient({ url: process.env.DATABASE_URL ?? "file:./data/dashboard.db" });

const projects = await db.execute("select p.slug, p.lead_id, l.email, l.phone, l.contact_name from projects p join leads l on l.id = p.lead_id");
let filled = 0;
const missing = [];

for (const row of projects.rows) {
  const slug = row.slug;
  let gtm;
  try {
    gtm = JSON.parse(readFileSync(path.join(FORGE_ROOT, slug, "research", "gtm.json"), "utf8"));
  } catch {
    missing.push(`${slug}: no gtm.json`);
    continue;
  }
  const c = gtm.contact ?? {};
  const email = (c.email ?? "").trim();
  const phone = (c.phone ?? "").trim();
  const name = (c.contactName ?? c.name ?? "").trim();

  if (!email && !phone) {
    missing.push(`${slug}: gtm.json has no contact block`);
    continue;
  }
  if (row.email && row.phone) continue; // already complete

  await db.execute({
    sql: "update leads set email = ?, phone = ?, contact_name = ? where id = ?",
    args: [row.email || email, row.phone || phone, row.contact_name || name, row.lead_id],
  });
  filled++;
  console.log(`filled ${slug}: ${row.email || email || "-"} / ${row.phone || phone || "-"}`);
}

console.log(`\n${filled} leads updated from gtm.json contact blocks.`);
if (missing.length) {
  console.log("\nStill missing contact info (add manually via lead Edit, or extend their gtm.json):");
  for (const m of missing) console.log(`  - ${m}`);
}

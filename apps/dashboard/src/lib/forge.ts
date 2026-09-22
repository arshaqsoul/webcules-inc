import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type Finding = {
  severity: "critical" | "major" | "minor";
  lens: "uiux" | "conversion" | "ai";
  title: string;
  cost: string;
  fix: string;
};

/** What /forge-redesign writes to webcules/<slug>/research/gtm.json */
export type GtmManifest = {
  project: string;
  business: string;
  url: string;
  industry: string;
  city: string;
  /** captured during intake — feeds the one-click send buttons */
  contact?: { contactName?: string; phone?: string; email?: string; address?: string; facebook?: string; instagram?: string; tiktok?: string };
  grade: { uiux: string; conversion: string; ai: string };
  topFindings: Finding[];
  quote: {
    tier: string;
    pages: number;
    oneTime: number;
    maintenanceMonthly: number;
    marketLow: number;
    marketHigh: number;
  };
  previewUrl: string | null;
  generatedAt: string;
};

export function forgeRoot() {
  return process.env.FORGE_ROOT ?? "C:/Users/arsha/Documents/projects/webcules";
}

export type ForgeScanResult = {
  slug: string;
  gtm: GtmManifest;
  alreadyImported: boolean;
};

export async function scanForgeProjects(importedSlugs: Set<string>): Promise<ForgeScanResult[]> {
  const root = forgeRoot();
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    throw new Error(`Forge root not found: ${root} (set FORGE_ROOT in .env.local)`);
  }

  const results: ForgeScanResult[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const gtmPath = path.join(root, entry.name, "research", "gtm.json");
    try {
      const raw = await readFile(gtmPath, "utf8");
      const gtm = JSON.parse(raw) as GtmManifest;
      if (!gtm.project || !gtm.business || !gtm.quote) continue;
      results.push({ slug: entry.name, gtm, alreadyImported: importedSlugs.has(entry.name) });
    } catch {
      // no gtm.json — not a redesign go-to-market project, skip
    }
  }
  results.sort((a, b) => (b.gtm.generatedAt ?? "").localeCompare(a.gtm.generatedAt ?? ""));
  return results;
}

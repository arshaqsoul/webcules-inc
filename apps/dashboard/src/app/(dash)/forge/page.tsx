import { ForgeImporter } from "@/components/app/forge-importer";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { forgeRoot, scanForgeProjects } from "@/lib/forge";

export default async function ForgePage() {
  const existing = await db.select({ slug: projects.slug }).from(projects);
  const importedSlugs = new Set(existing.map((p) => p.slug));

  let scanError: string | null = null;
  let found: Awaited<ReturnType<typeof scanForgeProjects>> = [];
  try {
    found = await scanForgeProjects(importedSlugs);
  } catch (err) {
    scanError = err instanceof Error ? err.message : "Scan failed";
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Forge import</h1>
        <p className="text-sm text-muted-foreground">
          Redesigns produced by <code className="rounded bg-secondary px-1 py-0.5 text-xs">/forge-redesign</code> carry a{" "}
          <code className="rounded bg-secondary px-1 py-0.5 text-xs">research/gtm.json</code>. Scan{" "}
          <code className="rounded bg-secondary px-1 py-0.5 text-xs">{forgeRoot()}</code> and pull them into the pipeline with one click.
        </p>
      </div>
      <ForgeImporter
        initial={found.map((f) => ({
          slug: f.slug,
          business: f.gtm.business,
          industry: f.gtm.industry,
          previewUrl: f.gtm.previewUrl,
          grade: f.gtm.grade,
          oneTime: f.gtm.quote?.oneTime ?? 799,
          alreadyImported: f.alreadyImported,
        }))}
        scanError={scanError}
      />
    </div>
  );
}

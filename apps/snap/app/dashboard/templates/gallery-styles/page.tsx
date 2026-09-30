/* /dashboard/templates/gallery-styles (WEB-286) — reusable gallery looks:
 * list + editor with the shared dual-frame (desktop + mobile) preview. */
import Link from "next/link";

import { getOrgContext } from "@/lib/session";
import { getTemplate, listTemplates } from "@/lib/repos/templates";
import { parseGalleryDesignJson } from "@/lib/gallery-design";
import { GalleryStyleEditor } from "@/components/gallery-style-editor";
import { TemplateHubRows } from "@/components/template-hub";

export const dynamic = "force-dynamic";

export const metadata = { title: { absolute: "Gallery styles · Snap" } };

export default async function GalleryStylesPage({ searchParams }: { searchParams: Promise<{ edit?: string; archived?: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const { edit, archived } = await searchParams;
  const showArchived = archived === "1";

  const editing = edit ? await getTemplate(ctx.organizationId, edit) : null;
  if (editing && editing.kind === "gallery_preset" && !editing.archivedAt) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-ink">Edit gallery style</h1>
            <p className="mt-0.5 text-sm text-ink-subtle">One look, every gallery — apply it from a project&apos;s Gallery tab → Design.</p>
          </div>
          <Link href="/dashboard/templates/gallery-styles" className="text-xs font-medium text-primary hover:underline">← Gallery styles</Link>
        </div>
        <GalleryStyleEditor templateId={editing.id} initialName={editing.name} initialDesign={parseGalleryDesignJson(editing.body)} />
      </div>
    );
  }

  const templates = await listTemplates(ctx.organizationId, "gallery_preset", { includeArchived: true });
  const rows = templates
    .filter((t) => (showArchived ? true : !t.archivedAt))
    .map((t) => ({
      id: t.id,
      kind: t.kind,
      name: t.name,
      isDefault: Boolean(t.isDefault),
      archived: Boolean(t.archivedAt),
      updatedAt: t.updatedAt.toISOString(),
      lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
    }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">Gallery styles</h1>
          <p className="mt-1 text-sm text-ink-subtle">Reusable gallery looks — cover treatment, layout, theme. The preview shows desktop and mobile exactly as clients see them.</p>
        </div>
        <Link href={`/dashboard/templates/gallery-styles${showArchived ? "" : "?archived=1"}`} className="text-xs font-medium text-primary hover:underline">
          {showArchived ? "Hide archived" : "Show archived"}
        </Link>
      </div>
      {!edit && <GalleryStyleEditor />}
      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <TemplateHubRows templates={rows} activeKind="gallery_preset" editHref={(t) => `/dashboard/templates/gallery-styles?edit=${t.id}`} />
      </section>
    </div>
  );
}

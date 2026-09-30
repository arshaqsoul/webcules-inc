/* /dashboard/templates/invoice-presets (WEB-286) — default invoice line
 * items: list + editor with a live PDF preview from the real pipeline. */
import Link from "next/link";

import { getOrgContext } from "@/lib/session";
import { getTemplate, listTemplates } from "@/lib/repos/templates";
import { parsePresetLines } from "@/lib/invoice-settings";
import { InvoicePresetEditor } from "@/components/invoice-preset-editor";
import { TemplateHubRows } from "@/components/template-hub";

export const dynamic = "force-dynamic";

export const metadata = { title: { absolute: "Invoice presets · Snap" } };

export default async function InvoicePresetsPage({ searchParams }: { searchParams: Promise<{ edit?: string; archived?: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const { edit, archived } = await searchParams;
  const showArchived = archived === "1";

  const editing = edit ? await getTemplate(ctx.organizationId, edit) : null;
  if (editing && editing.kind === "invoice_preset" && !editing.archivedAt) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-ink">Edit invoice preset</h1>
            <p className="mt-0.5 text-sm text-ink-subtle">Default line items — applied when composing an invoice on a project&apos;s Payments tab.</p>
          </div>
          <Link href="/dashboard/templates/invoice-presets" className="text-xs font-medium text-primary hover:underline">← Invoice presets</Link>
        </div>
        <InvoicePresetEditor templateId={editing.id} initialName={editing.name} initialLines={parsePresetLines(editing.body)} />
      </div>
    );
  }

  const templates = await listTemplates(ctx.organizationId, "invoice_preset", { includeArchived: true });
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
          <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">Invoice presets</h1>
          <p className="mt-1 text-sm text-ink-subtle">Default line items — pick one when composing an invoice and edit from there.</p>
        </div>
        <Link href={`/dashboard/templates/invoice-presets${showArchived ? "" : "?archived=1"}`} className="text-xs font-medium text-primary hover:underline">
          {showArchived ? "Hide archived" : "Show archived"}
        </Link>
      </div>
      {!edit && <InvoicePresetEditor />}
      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <TemplateHubRows templates={rows} activeKind="invoice_preset" editHref={(t) => `/dashboard/templates/invoice-presets?edit=${t.id}`} />
      </section>
    </div>
  );
}

/* Forms designer page (WEB-248) — list + builder. Lives under
 * /dashboard/templates (the 9/10 hub promotes the parent route). */
import Link from "next/link";

import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { parseFormSchema } from "@/lib/forms";
import { getTemplate, listTemplates } from "@/lib/repos/templates";
import { FormBuilder } from "@/components/form-builder";
import { CreateFormRow, FormTemplateRowActions } from "@/components/form-templates-list";

export const dynamic = "force-dynamic";

export const metadata = { title: { absolute: "Forms · Snap" } };

function safeMeta(raw: string): { submitLabel?: string; redirectUrl?: string } {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      ...(typeof parsed.submitLabel === "string" ? { submitLabel: parsed.submitLabel } : {}),
      ...(typeof parsed.redirectUrl === "string" ? { redirectUrl: parsed.redirectUrl } : {}),
    };
  } catch {
    return {};
  }
}

export default async function FormsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const { edit } = await searchParams;

  const templates = await listTemplates(ctx.organizationId, "form");
  const editing = edit ? await getTemplate(ctx.organizationId, edit) : null;
  const ent = await getPlanEntitlements(ctx.organizationId);
  const allowFile = ent?.id === "studio" || ent?.id === "pro";

  if (editing && editing.kind === "form" && !editing.archivedAt) {
    const schema = parseFormSchema(editing.body, { allowFile }) ?? { v: 1 as const, fields: [{ id: "f_name", kind: "text", label: "Name", required: true }] };
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-ink">Edit form</h1>
            <p className="mt-0.5 text-sm text-ink-subtle">Custom questions flow into the lead record; the preview renders exactly what clients see.</p>
          </div>
          <Link href="/dashboard/templates/forms" className="text-xs font-medium text-primary hover:underline">← Forms</Link>
        </div>
        <FormBuilder
            templateId={editing.id}
            initialName={editing.name}
            initialSchema={schema}
            initialMeta={safeMeta(editing.meta)}
            allowFile={allowFile}
            customFieldCap={allowFile ? null : 2}
          />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">Forms</h1>
        <p className="mt-0.5 text-sm text-ink-subtle">
          Question sets for your contact widget and questionnaires — one schema, every surface.{!allowFile && " File-upload fields are included with Studio."}
        </p>
      </div>
      <CreateFormRow />
      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        {templates.length === 0 ? (
          <p className="text-sm text-ink-subtle">No forms yet — create your first one above.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <Link href={`/dashboard/templates/forms?edit=${t.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:text-primary">
                  {t.name}
                </Link>
                {t.isDefault ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">default</span> : null}
                <span className="hidden text-xs text-ink-tertiary sm:block">{t.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                <FormTemplateRowActions id={t.id} isDefault={Boolean(t.isDefault)} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* Contract templates library (WEB-251) — list + editor with clause
 * library and live signing-page preview. */
import Link from "next/link";

import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { getTemplate, listTemplates, starterTemplateRows } from "@/lib/repos/templates";
import { ContractTemplateEditor } from "@/components/contract-template-editor";
import { CreateContractTemplate, ContractTemplateActions } from "@/components/contract-templates-list";
import { RestoreStartersBanner } from "@/components/template-hub";

export const dynamic = "force-dynamic";

export const metadata = { title: { absolute: "Contract templates · Snap" } };

const BLANK = `This agreement is between {{studio_name}} ("the Studio") and {{client_name}} ("the Client").

Coverage. The Studio will photograph {{session_type}} on {{event_date}}.

Payment. The total is {{total}}; the deposit is {{deposit}}.

By signing below, both parties agree to these terms.`;

export default async function ContractTemplatesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const { edit } = await searchParams;

  const templates = await listTemplates(ctx.organizationId, "contract");
  const clauses = await listTemplates(ctx.organizationId, "contract_clause");
  const all = await listTemplates(ctx.organizationId, undefined, { includeArchived: true });
  const starterKeys = new Set(all.map((t) => `${t.kind}::${t.name}`));
  const missingStarters = starterTemplateRows("probe").filter((r) => !starterKeys.has(`${r.kind}::${r.name}`)).length;
  const ent = await getPlanEntitlements(ctx.organizationId);
  const unlimited = ent?.id === "studio" || ent?.id === "pro";
  // null = unlimited on Studio/Pro — the `?? 2` fallback is only for a
  // missing entitlements read, never for "unlimited" (the studios-limit bug
  // class; guarded by tests/unit/plan-null-safety.test.ts).
  const limit = ent ? (unlimited ? null : ent.maxContractTemplates ?? 2) : 2;

  const editing = edit ? await getTemplate(ctx.organizationId, edit) : null;
  if (editing && editing.kind === "contract" && !editing.archivedAt) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-ink">Edit contract template</h1>
            <p className="mt-0.5 text-sm text-ink-subtle">Merge fields resolve from the real project at send; the preview shows sample data.</p>
          </div>
          <Link href="/dashboard/templates/contracts" className="text-xs font-medium text-primary hover:underline">← Contracts</Link>
        </div>
        <ContractTemplateEditor
          templateId={editing.id}
          initialName={editing.name}
          initialBody={editing.body}
          clauses={clauses.map((c) => ({ id: c.id, name: c.name, body: c.body }))}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">Contract templates</h1>
        <p className="mt-0.5 text-sm text-ink-subtle">
          Your agreement library — apply one to any project, then send for e-signature.{limit !== null && ` Your plan includes ${limit}.`}
        </p>
      </div>
      <CreateContractTemplate disabled={limit !== null && templates.length >= limit} limit={limit} blankBody={BLANK} />
      <RestoreStartersBanner missingCount={missingStarters} />
      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        {templates.length === 0 ? (
          <p className="text-sm text-ink-subtle">No contract templates yet — create one above.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <Link href={`/dashboard/templates/contracts?edit=${t.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:text-primary">
                  {t.name}
                </Link>
                {t.isDefault ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">default</span> : null}
                <span className="hidden text-xs text-ink-tertiary sm:block">{t.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                <ContractTemplateActions id={t.id} isDefault={Boolean(t.isDefault)} />
              </li>
            ))}
          </ul>
        )}
      </section>
      {clauses.length > 0 && (
        <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
          <h2 className="text-[15px] font-medium text-ink">Clause library</h2>
          <p className="mb-3 mt-1 text-xs text-ink-subtle">Reusable paragraphs — insert them at the cursor from the editor's toolbar.</p>
          <ul className="flex flex-col divide-y divide-hairline">
            {clauses.map((c) => (
              <li key={c.id} className="py-2 first:pt-0 last:pb-0">
                <p className="text-sm font-medium text-ink">{c.name}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-ink-subtle">{c.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

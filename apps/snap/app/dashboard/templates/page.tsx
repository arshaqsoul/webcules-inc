/* /dashboard/templates (WEB-255) — the unified template hub. Every
 * designer's library lives here; session types stay in their booking home
 * (Calendar → Availability) because they're scheduling config, not
 * reusable copy — cross-linked below. */
import Link from "next/link";

import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { listTemplates, starterTemplateRows } from "@/lib/repos/templates";
import { CreateContractTemplate } from "@/components/contract-templates-list";
import { CreateFormRow } from "@/components/form-templates-list";
import { RestoreStartersBanner, TemplateHubRows } from "@/components/template-hub";

export const dynamic = "force-dynamic";

export const metadata = { title: { absolute: "Templates · Snap" } };

const KIND_TABS = [
  { kind: "contract", label: "Contracts" },
  { kind: "form", label: "Forms & questionnaires" },
  { kind: "email_snippet", label: "Email snippets" },
  { kind: "invoice_preset", label: "Invoice presets" },
  { kind: "contract_clause", label: "Clauses" },
] as const;

const APPLY_HINTS: Record<string, string> = {
  contract: "Use on a project from its Contracts tab.",
  form: "Embed from Settings → Embeds & links; questionnaires send from a project's Overview.",
  email_snippet: "Insert from any lead thread's reply box.",
  invoice_preset: "Apply when composing an invoice on a project's Payments tab.",
  contract_clause: "Insert at the cursor in the contract editor.",
};

export default async function TemplatesHub({ searchParams }: { searchParams: Promise<{ kind?: string; archived?: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const { kind: kindParam, archived } = await searchParams;
  const activeKind = (KIND_TABS.find((t) => t.kind === kindParam)?.kind ?? "contract") as (typeof KIND_TABS)[number]["kind"];
  const showArchived = archived === "1";

  const [templates, ent] = await Promise.all([listTemplates(ctx.organizationId, undefined, { includeArchived: true }), getPlanEntitlements(ctx.organizationId)]);
  const starters = starterTemplateRows("probe").map((r) => `${r.kind}::${r.name}`);
  const owned = new Set(templates.map((t) => `${t.kind}::${t.name}`));
  const missingStarters = starters.filter((k) => !owned.has(k)).length;

  const rows = templates
    .filter((t) => (activeKind === "form" ? t.kind === "form" || t.kind === "questionnaire" : t.kind === activeKind))
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

  const unlimitedKinds = ent && (ent.id === "studio" || ent.id === "pro");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">Templates</h1>
          <p className="mt-1 text-sm text-ink-subtle">
            Every reusable piece of your studio — contracts, forms, emails, packages. Session types live in{" "}
            <Link href="/dashboard/calendar?tab=availability" className="font-medium text-primary hover:underline">
              Calendar → Availability
            </Link>{" "}
            (they&apos;re scheduling config, not copy).
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {KIND_TABS.map((t) => (
            <Link
              key={t.kind}
              href={`/dashboard/templates?kind=${t.kind}${showArchived ? "&archived=1" : ""}`}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                activeKind === t.kind ? "bg-surface-2 text-ink" : "text-ink-subtle hover:bg-surface-1 hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      <RestoreStartersBanner missingCount={missingStarters} />

      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-subtle">{APPLY_HINTS[activeKind]}</p>
          <div className="flex items-center gap-3">
            <Link href={`/dashboard/templates?kind=${activeKind}${showArchived ? "" : "&archived=1"}`} className="text-xs font-medium text-primary hover:underline">
              {showArchived ? "Hide archived" : "Show archived"}
            </Link>
          </div>
        </div>
        {activeKind === "contract" && (
          <div className="mb-4">
            <CreateContractTemplate
              disabled={!unlimitedKinds && templates.filter((t) => t.kind === "contract" && !t.archivedAt).length >= (ent?.maxContractTemplates ?? 2)}
              limit={ent?.maxContractTemplates ?? 2}
              blankBody='This agreement is between {{studio_name}} ("the Studio") and {{client_name}} ("the Client").'
            />
          </div>
        )}
        {activeKind === "form" && (
          <div className="mb-4">
            <CreateFormRow />
          </div>
        )}
        <TemplateHubRows templates={rows} activeKind={activeKind} />
      </section>
    </div>
  );
}

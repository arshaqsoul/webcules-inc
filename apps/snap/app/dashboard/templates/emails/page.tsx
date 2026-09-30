/* /dashboard/templates/emails (WEB-286) — the one home for email copy:
 * Saved replies (canned, inserted from lead threads) and Automatic emails
 * (system message overrides with live preview). The EmailsCard moved here
 * from Settings → Brand; loading logic moved with it. */
import { redirect } from "next/navigation";

import { EmailsCard } from "@/components/emails-card";
import { loadEmailOverrides, OVERRIDABLE_TEMPLATES } from "@/lib/email-overrides";
import { listTemplates } from "@/lib/repos/templates";
import { getPlanEntitlements } from "@/lib/plans";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = { title: { absolute: "Emails · Snap" } };

export default async function TemplatesEmailsPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const [overrides, snippetTemplates] = await Promise.all([
    loadEmailOverrides(ctx.organizationId),
    listTemplates(ctx.organizationId, "email_snippet"),
  ]);
  const snippets = snippetTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    subject: (JSON.parse(t.meta || "{}") as { subject?: string }).subject ?? null,
    body: t.body,
  }));
  const ent = await getPlanEntitlements(ctx.organizationId);
  const snippetLimit = ent && ent.id !== "studio" && ent.id !== "pro" ? (ent.maxEmailSnippets ?? 5) : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">Emails</h1>
        <p className="mt-1 text-sm text-ink-subtle">
          Two kinds of copy live here: <strong className="font-medium">Saved replies</strong> you insert into lead threads,
          and <strong className="font-medium">Automatic emails</strong> the system sends on bookings, galleries and invoices.
        </p>
      </div>
      <EmailsCard
        templates={OVERRIDABLE_TEMPLATES}
        initialOverrides={overrides}
        initialSnippets={snippets}
        snippetLimit={snippetLimit}
      />
    </div>
  );
}

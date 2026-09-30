/* /dashboard/templates — WEB-286: the tabs hub is gone; every template
 * kind is a sidebar section with its own list/detail route. Old hub links
 * (?kind=…) and the parent nav row land here and redirect to the section. */
import { redirect } from "next/navigation";

const KIND_REDIRECTS: Record<string, string> = {
  contract: "/dashboard/templates/contracts",
  contract_clause: "/dashboard/templates/contracts",
  form: "/dashboard/templates/forms",
  questionnaire: "/dashboard/templates/forms",
  email_snippet: "/dashboard/templates/emails",
  invoice_preset: "/dashboard/templates/invoice-presets",
  gallery_preset: "/dashboard/templates/gallery-styles",
};

export default async function TemplatesRedirect({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  redirect(KIND_REDIRECTS[kind ?? ""] ?? "/dashboard/templates/contracts");
}

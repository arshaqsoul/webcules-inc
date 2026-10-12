/* /dashboard/store/[id] (WEB-179, Commerce C1 2/7) — one price list's
 * editor: product/variant CRUD, reorder, archive, live markup and the bulk
 * markup tool. The route is auth-gated like every dashboard page; org
 * scoping happens in lib/commerce (a foreign list id reads as not_found). */
import { notFound, redirect } from "next/navigation";

import { CommercePriceListEditor } from "@/components/commerce-price-list-editor";
import { commerceGatesForPlan, getPriceListDetail } from "@/lib/commerce";
import { getPlanEntitlements } from "@/lib/plans";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return { title: "Price list" };
  const { id } = await params;
  const detail = await getPriceListDetail(ctx.organizationId, id);
  return { title: detail ? `${detail.name} — Store` : "Price list" };
}

export default async function PriceListPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const { id } = await params;
  const detail = await getPriceListDetail(ctx.organizationId, id);
  if (!detail) notFound();
  const ent = await getPlanEntitlements(ctx.organizationId);
  if (!ent) redirect("/onboarding");
  return <CommercePriceListEditor initial={detail} gates={commerceGatesForPlan(ent)} />;
}

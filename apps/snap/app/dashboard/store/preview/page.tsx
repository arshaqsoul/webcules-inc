/* /dashboard/store/preview (WEB-277, Commerce C1 6/7) — "Preview the store
 * as a client": the client store view in the studio's colors with the amber
 * Preview banner, ordering disabled. The dashboard session is the only key.
 *
 * NOTHING HERE CAN CREATE A REAL ORDER:
 *  - this page renders the default price list read-only — no grant token is
 *    minted and no cart endpoint is ever called;
 *  - the preview session flag (HttpOnly signed cookie, minted by
 *    /api/studio/store-preview) makes cart creation, cart adds, and Stripe
 *    checkout sessions refuse with preview_refused server-side
 *    (lib/store-preview.ts, lib/repos/carts.ts, lib/repos/checkout.ts);
 *  - Buy surfaces render as disabled "Preview only" buttons — no dead ends,
 *    no fake success. */
import { and, asc, desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { getPriceListDetail } from "@/lib/commerce";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { safeHexColor } from "@/lib/embed";
import { getPlanEntitlements } from "@/lib/plans";
import { getStudioProfile } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Store preview", robots: { index: false } };

function fmtMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

export default async function StorePreviewPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const ent = await getPlanEntitlements(ctx.organizationId);
  if (!ent?.storeEnabled) notFound();

  // The default list is what a client's gallery would carry unless a
  // different list is attached; preview shows the default, falling back to
  // the studio's first list.
  const db = getDb();
  const list = (
    await db
      .select({ id: schema.priceLists.id })
      .from(schema.priceLists)
      .where(and(eq(schema.priceLists.organizationId, ctx.organizationId)))
      .orderBy(desc(schema.priceLists.isDefault), asc(schema.priceLists.createdAt))
      .limit(1)
  )[0];
  const detail = list ? await getPriceListDetail(ctx.organizationId, list.id) : null;

  const profile = await getStudioProfile(ctx.organizationId);
  let accent: string | null = null;
  try {
    accent = safeHexColor((JSON.parse(profile?.brand ?? "{}") as { accent?: string }).accent);
  } catch {
    accent = null;
  }
  const studioName = profile?.studioName ?? "Your studio";
  // Client store view: only active products and active variants.
  const products = (detail?.products ?? [])
    .filter((p) => p.active)
    .map((p) => ({ ...p, variants: p.variants.filter((v) => v.active) }))
    .filter((p) => p.variants.length > 0);

  return (
    <div className="min-h-screen bg-canvas pb-20">
      {/* Preview banner — handoff copy, exact */}
      <div role="status" className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-center text-sm text-amber-700 dark:text-amber-400">
        You&apos;re previewing your store. Clients see this view without this banner — and they can check out. In preview, ordering is off.
      </div>

      <div className="mx-auto max-w-3xl px-4 pt-10">
        <p className="text-xs font-semibold uppercase tracking-widest" style={accent ? { color: accent } : undefined}>
          Store
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.6px] text-ink">{studioName}</h1>

        {products.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-hairline px-6 py-14 text-center">
            <h2 className="font-semibold text-ink">No products yet</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink-subtle">
              This studio hasn&apos;t published a price list yet. Clients will see the store once a list with products is attached to their gallery.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {products.map((p) => (
              <div key={p.id} className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface px-4 py-4">
                <div>
                  <h2 className="font-medium text-ink">{p.name}</h2>
                </div>
                <ul className="flex flex-col gap-2">
                  {p.variants.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-ink-subtle">{v.name}</span>
                      <span className="flex items-center gap-3">
                        <span className="font-medium text-ink tabular-nums">{fmtMoney(v.priceCents, detail!.currency)}</span>
                        <button
                          type="button"
                          disabled
                          title="Ordering is off in preview"
                          className="rounded-md px-3 py-1.5 text-xs font-medium text-white opacity-60"
                          style={accent ? { backgroundColor: accent } : { backgroundColor: "#5e6ad2" }}
                        >
                          Preview only
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

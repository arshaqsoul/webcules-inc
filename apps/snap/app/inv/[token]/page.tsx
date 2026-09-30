/* Public invoice view at /inv/{token} (WEB-137) — 256-bit token possession
 * is the gate (same trust model as gallery links; voided invoices vanish). */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { resolveInvoiceByToken } from "@/lib/invoices";
import { isWhiteLabeled } from "@/lib/branding";
import { brandIcons, brandOgImage, parseBrandAssets } from "@/lib/brand-assets";
import { getPlanEntitlements } from "@/lib/plans";
import { getStudioProfile } from "@/lib/repos/studios";
import { hasBusinessIdentity, parseBusiness, taxIdLine } from "@/lib/business";
import { safeHexColor } from "@/lib/embed";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoice", robots: { index: false } };

/** WEB-238/239: white-labeled — absolute title skips the `· Snap` template
 * suffix; generated brand assets add favicon + og:image. */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const invoice = await resolveInvoiceByToken(token);
  if (!invoice) return {};
  const profile = await getStudioProfile(invoice.organizationId);
  if (!profile) return {};
  const bag = parseBrandAssets(profile.brandAssets);
  const icons = brandIcons(bag, invoice.organizationId);
  const og = brandOgImage(bag, invoice.organizationId);
  const wl = isWhiteLabeled(await getPlanEntitlements(invoice.organizationId), profile.brand);
  return {
    ...(wl ? { title: { absolute: `Invoice ${invoice.number} · ${profile.studioName}` } } : {}),
    ...(icons ? { icons } : {}),
    ...(og ? { openGraph: { title: `Invoice ${invoice.number} — ${profile.studioName}`, images: [og] } } : {}),
    robots: { index: false },
  };
}

const STATUS_TONE: Record<string, string> = {
  draft: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  sent: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  paid: "bg-success/10 text-success-text",
  void: "bg-surface-2 text-ink-subtle",
};

function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amountMinor / 100);
}

export default async function InvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await resolveInvoiceByToken(token);
  if (!invoice) notFound();

  const profile = await getStudioProfile(invoice.organizationId);
  const brand = JSON.parse(profile?.brand || "{}") as { accent?: string };
  const accent = safeHexColor(brand.accent) ?? "#5e6ad2";
  const lines = JSON.parse(invoice.lines) as { description: string; qty: number; amountMinor: number }[];
  // WEB-277: business identity mirrors the PDF's FROM block when configured.
  const biz = parseBusiness(profile?.business ?? null, profile?.studioName ?? "Studio");
  const fromBlock = hasBusinessIdentity(biz) ? biz : null;

  return (
    <main className="flex min-h-screen justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5" style={{ background: `${accent}14` }}>
            <div>
              <p className="text-lg font-semibold text-ink">{profile?.studioName ?? "Studio"}</p>
              <p className="text-xs text-ink-subtle">Invoice {invoice.number}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[invoice.status] ?? ""}`}>
              {invoice.status}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 border-b border-hairline px-6 py-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-ink-tertiary">Billed to</p>
              <p className="mt-0.5 truncate text-ink">{invoice.clientEmail ?? "—"}</p>
            </div>
            {fromBlock && (
              <div className="col-span-2 sm:col-span-1">
                <p className="text-xs text-ink-tertiary">From</p>
                <p className="mt-0.5 text-ink">{fromBlock.legalName}</p>
                {fromBlock.addressLines.filter(Boolean).length > 0 && (
                  <p className="text-xs text-ink-subtle">{fromBlock.addressLines.filter(Boolean).join(", ")}</p>
                )}
                {fromBlock.taxId && (
                  <p className="text-xs text-ink-subtle">{taxIdLine(fromBlock)}</p>
                )}
              </div>
            )}
            <div>
              <p className="text-xs text-ink-tertiary">Issued</p>
              <p className="mt-0.5 text-ink">
                {(invoice.issuedAt ?? invoice.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-tertiary">Due</p>
              <p className="mt-0.5 text-ink">
                {invoice.dueAt ? invoice.dueAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
              </p>
            </div>
          </div>
          <div className="px-6 py-2">
            {lines.map((l, i) => (
              <div key={i} className="flex items-baseline gap-3 border-b border-hairline py-3 text-sm last:border-0">
                <span className="min-w-0 flex-1 text-ink">{l.description}</span>
                <span className="text-xs text-ink-tertiary">×{l.qty}</span>
                <span className="font-medium text-ink">{money(l.qty > 0 ? l.amountMinor * l.qty : l.amountMinor, invoice.currency)}</span>
              </div>
            ))}
          </div>
          {invoice.taxRateBps && invoice.taxLabel ? (
            <div className="flex flex-col gap-1 border-t border-hairline px-6 py-3 text-sm">
              <div className="flex justify-between text-ink-subtle">
                <span>Subtotal</span>
                <span>{money(lines.reduce((n, l) => n + (l.qty > 0 ? l.amountMinor * l.qty : l.amountMinor), 0), invoice.currency)}</span>
              </div>
              <div className="flex justify-between text-ink">
                <span>{invoice.taxLabel}</span>
                <span>{money(invoice.totalMinor - lines.reduce((n, l) => n + (l.qty > 0 ? l.amountMinor * l.qty : l.amountMinor), 0), invoice.currency)}</span>
              </div>
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t border-hairline px-6 py-4">
            <span className="text-sm text-ink-subtle">Total due</span>
            <span className="text-lg font-semibold" style={{ color: accent }}>
              {money(invoice.totalMinor, invoice.currency)}
            </span>
          </div>
          {(invoice.memo || invoice.terms) && (
            <div className="flex flex-col gap-2 border-t border-hairline px-6 py-4 text-xs leading-relaxed">
              {invoice.memo ? <p className="whitespace-pre-wrap text-ink">{invoice.memo}</p> : null}
              {invoice.terms ? <p className="whitespace-pre-wrap text-ink-subtle">{invoice.terms}</p> : null}
            </div>
          )}
        </div>
        <div className="mt-4 text-center">
          {invoice.status === "sent" && invoice.paymentUrl && (
            <a
              href={invoice.paymentUrl}
              className="mb-3 inline-block rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
              style={{ background: accent }}
            >
              Pay {money(invoice.totalMinor, invoice.currency)} — secure checkout
            </a>
          )}
          {invoice.pdfKey && (
            <a
              href={`/api/invoices/${invoice.id}/pdf?token=${token}`}
              className="inline-block rounded-lg px-4 py-2 text-sm font-medium text-ink-subtle underline underline-offset-2"
            >
              Download PDF
            </a>
          )}
          <p className="mt-3 text-xs text-ink-tertiary">
            This private link is unique to you — {profile?.studioName ?? "the studio"} can resend it any time.
          </p>
        </div>
      </div>
    </main>
  );
}

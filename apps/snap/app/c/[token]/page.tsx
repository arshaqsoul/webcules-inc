/* Public contract view + signing at /c/{token} (WEB-158). Token possession
 * is the gate; signing is Turnstile-protected; voided/draft tokens vanish. */
import { notFound } from "next/navigation";
import { env } from "cloudflare:workers";

import { resolveContractByToken } from "@/lib/contracts";
import { getStudioProfile } from "@/lib/repos/studios";
import { safeHexColor } from "@/lib/embed";
import { ContractSignForm } from "@/components/contract-sign";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contract", robots: { index: false } };

export default async function ContractPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const contract = await resolveContractByToken(token);
  if (!contract) notFound();

  const profile = await getStudioProfile(contract.organizationId);
  const brand = JSON.parse(profile?.brand || "{}") as { accent?: string };
  const accent = safeHexColor(brand.accent) ?? "#5e6ad2";

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-5" style={{ background: `${accent}14` }}>
          <div>
            <p className="text-lg font-semibold text-ink">{profile?.studioName ?? "Studio"}</p>
            <p className="text-xs text-ink-subtle">Prepared for {contract.clientEmail ?? "you"}</p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              contract.status === "signed" ? "bg-success/10 text-success-text" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            }`}
          >
            {contract.status === "signed" ? "Signed" : "Awaiting signature"}
          </span>
        </div>
        <div className="px-6 py-6">
          <h1 className="text-xl font-semibold tracking-[-0.4px] text-ink">{contract.title}</h1>
          <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-muted">{contract.body}</p>
        </div>
        {contract.status === "signed" ? (
          <div className="border-t border-hairline px-6 py-5">
            <p className="text-sm text-ink">
              Signed by <strong>{contract.signerName}</strong> on{" "}
              {contract.signedAt?.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })} UTC
              {contract.signerIp ? ` · IP ${contract.signerIp}` : ""}.
            </p>
            <a
              href={`/api/contracts/${contract.id}/pdf?token=${token}`}
              className="mt-3 inline-block rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ background: accent }}
            >
              Download signed PDF
            </a>
          </div>
        ) : (
          <div className="border-t border-hairline px-6 py-5">
            <ContractSignForm token={token} accent={accent} turnstileSiteKey={env.TURNSTILE_SITE_KEY ?? ""} />
          </div>
        )}
      </div>
      <p className="mt-4 text-center text-xs text-ink-tertiary">
        Signing records your typed name, the date/time, and your IP address for both parties&apos; records.
      </p>
    </main>
  );
}

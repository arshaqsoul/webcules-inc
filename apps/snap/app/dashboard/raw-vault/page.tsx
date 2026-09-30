import { redirect } from "next/navigation";

import { RawVaultPanel } from "@/components/raw-vault-panel";
import { getOrgContext } from "@/lib/session";
import { canAccessRawVault } from "@/lib/permissions";
import { getStudioProfile } from "@/lib/repos/studios";
import { getRawVaultSummary } from "@/lib/vault";

export const metadata = { title: "RAW Vault" };

export default async function RawVaultPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  // WEB-275: members see the vault only when the studio opts them in.
  const vaultProfile = await getStudioProfile(ctx.organizationId);
  if (!canAccessRawVault(ctx.role, vaultProfile?.memberRawAccess ?? false)) redirect("/dashboard");
  const summary = await getRawVaultSummary(ctx.organizationId);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">RAW Vault</h1>
          <p className="mt-1 text-sm text-ink-subtle">
            RAW files stay hot for 6 months, then move to low-cost cold storage — always restorable, never deleted
            without repeated emailed warnings. JPGs are never touched.
          </p>
        </div>
      </div>
      <RawVaultPanel initial={summary} />
    </div>
  );
}

import { redirect } from "next/navigation";

import { IntegrationsPanel } from "@/components/integrations-panel";
import {
  SCOPE_CATALOG,
  listIntegrationTokens,
} from "@/lib/integrations/tokens";
import { getStudioProfile } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";
import { can } from "@/lib/permissions";

export const metadata = { title: "Settings · Integrations" };

export default async function SettingsIntegrationsPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  // Settings surfaces are admin+ (WEB-275); token creation needs the same
  // settings.write the other sections' mutations use.
  if (!can(ctx.role, "settings.read")) redirect("/dashboard");
  const profile = await getStudioProfile(ctx.organizationId);
  if (!profile) redirect("/onboarding");
  const tokens = await listIntegrationTokens(ctx.organizationId);

  return (
    <IntegrationsPanel
      initial={tokens.map((t) => ({
        id: t.id,
        name: t.name,
        prefix: t.prefix,
        scopes: t.scopes,
        createdAt: t.createdAt.toISOString(),
        lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
        revokedAt: t.revokedAt?.toISOString() ?? null,
      }))}
      scopes={SCOPE_CATALOG.map((s) => ({ ...s }))}
    />
  );
}

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { SettingsSecurity } from "@/components/settings-security";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";

export const metadata = { title: "Settings · Security" };

export default async function SettingsSecurityPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const row = (
    await getDb()
      .select({ twoFactorEnabled: schema.user.twoFactorEnabled })
      .from(schema.user)
      .where(eq(schema.user.id, ctx.user.id))
      .limit(1)
  )[0];
  return <SettingsSecurity twoFactorEnabled={row?.twoFactorEnabled ?? false} />;
}

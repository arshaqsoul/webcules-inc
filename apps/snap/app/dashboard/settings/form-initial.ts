/* Interim (WEB-235): one place building the monolith SettingsForm's props so
 * the general/brand/delivery routes can render it unsplit. WEB-236 carves
 * each section into its own component with narrow loading and deletes this. */
import type { ComponentProps } from "react";

import type { SettingsForm } from "@/components/settings-form";
import type { studioProfiles } from "@/lib/db-schema";

type Profile = typeof studioProfiles.$inferSelect;

export function settingsFormInitial(profile: Profile, slug: string) {
  const brand = JSON.parse(profile.brand || "{}") as {
    accent?: string;
    fontFamily?: string;
    theme?: string;
    tokens?: unknown;
  };
  const rejected = JSON.parse(profile.rejectedPolicy || "{}") as {
    enabled?: boolean;
    retainDays?: number;
  };
  return {
    slug,
    studioName: profile.studioName,
    timezone: profile.timezone,
    contactEmail: profile.contactEmail ?? "",
    accentColor: brand.accent ?? "#5e6ad2",
    fontFamily: brand.fontFamily ?? "",
    theme: brand.theme ?? "light",
    tokens: JSON.stringify(brand.tokens ?? {}, null, 1),
    embedKey: profile.embedKey ?? "",
    hasLogo: Boolean(profile.logoKey),
    logoUrl: profile.logoKey ? `/api/embed/logo?key=${profile.embedKey}` : null,
    rejectedRetentionDays: rejected.enabled ? (rejected.retainDays ?? 30) : 0,
    exifStripDerived: profile.exifStripDerived,
  } satisfies ComponentProps<typeof SettingsForm>["initial"];
}

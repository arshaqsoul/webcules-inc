/* The one place the free-tier attribution link target lives. Every
 * non-white-labeled surface credits Snap with a UTM-tagged homepage link —
 * the growth loop the "Remove Snap branding" upgrade sells against.
 * Single self-domain link, visible text matches the href (spam-safe in
 * email footers). */
import { PUBLIC_ORIGIN } from "@/lib/hosts";

export function snapBrandUrl(medium: string): string {
  return `${PUBLIC_ORIGIN}/?utm_source=brand&utm_medium=${encodeURIComponent(medium)}`;
}

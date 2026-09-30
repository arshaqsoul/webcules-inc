import type { ReactNode } from "react";

import { snapBrandUrl } from "@/lib/snap-url";

/** Clickable Snap attribution for non-white-labeled surfaces (galleries,
 * /my, portal). Pass surface text as children; sizing/color come from the
 * parent so it reads as a signature, not a banner. */
export function SnapBadge({
  medium,
  className = "",
  children,
}: {
  medium: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <a href={snapBrandUrl(medium)} className={`hover:underline underline-offset-2 ${className}`}>
      {children ?? "Delivered by Snap · snap.webcules.com"}
    </a>
  );
}

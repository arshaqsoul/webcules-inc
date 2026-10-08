/* Snap's side of the @webcules/commerce host seam (WEB-353). The core never imports from
 * here; this file only proves Snap's bindings satisfy what the core asks for. */
import type { CommerceDb } from "@webcules/commerce/host";

/** Compile-time check: the real D1 binding is a valid CommerceDb. */
export const asCommerceDb = (d1: D1Database): CommerceDb => d1;

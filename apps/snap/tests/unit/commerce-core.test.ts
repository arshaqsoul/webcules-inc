import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { priceFromMarkup } from "@webcules/commerce";

import { asCommerceDb } from "@/lib/commerce-host";

describe("@webcules/commerce inside Snap's workerd", () => {
  it("loads the core and runs a query through the CommerceDb seam", async () => {
    expect(priceFromMarkup(1000, 100)).toBe(2000);
    const row = await asCommerceDb(env.D1).prepare("select 1 as one").first<{ one: number }>();
    expect(row?.one).toBe(1);
  });
});

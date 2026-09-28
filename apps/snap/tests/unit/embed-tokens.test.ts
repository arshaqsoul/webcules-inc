/* Widget theme token sanitation — untrusted embed config must never inject. */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_FONT,
  safeFontStack,
  safeRadius,
  sanitizeTokenBag,
} from "@/lib/embed-tokens";

describe("safeFontStack", () => {
  it("accepts the default stack and normal font lists (quotes are legal CSS)", () => {
    expect(safeFontStack(DEFAULT_FONT)).toBe(DEFAULT_FONT);
    expect(safeFontStack("Georgia, serif")).toBe("Georgia, serif");
    expect(safeFontStack("'Segoe UI', Roboto")).toBe("'Segoe UI', Roboto");
  });

  it("rejects CSS/HTML injection vectors ({} <> ; @)", () => {
    expect(safeFontStack("Evil;}</style><script>")).toBeNull();
    expect(safeFontStack("Font{brace}")).toBeNull();
    expect(safeFontStack("a @media")).toBeNull();
  });

  it("rejects non-strings and empties", () => {
    expect(safeFontStack(42 as unknown as string)).toBeNull();
    expect(safeFontStack("")).toBeNull();
    expect(safeFontStack(null as unknown as string)).toBeNull();
  });
});

describe("safeRadius", () => {
  it("accepts sane px/rem/50% values", () => {
    expect(safeRadius("12px")).toBe("12px");
    expect(safeRadius("1.5rem")).toBe("1.5rem");
    expect(safeRadius("50%")).toBe("50%");
  });

  it("rejects anything that isn't a bare length", () => {
    expect(safeRadius("12px solid red")).toBeNull();
    expect(safeRadius("url(javascript:1)")).toBeNull();
    expect(safeRadius("9999px")).toBeNull();
    expect(safeRadius("")).toBeNull();
  });
});

describe("sanitizeTokenBag", () => {
  it("drops unknown keys and unsafe values, keeps sanitized ones", () => {
    const bag = sanitizeTokenBag({
      accent: "#ff0000",
      bg: "javascript:alert(1)",
      radius: "8px",
      fontFamily: "Inter, sans-serif",
      evil: "<script>",
    });
    expect(bag.accent).toBe("#ff0000");
    expect(bag.radius).toBe("8px");
    expect(bag.fontFamily).toBe("Inter, sans-serif");
    expect(bag.bg).toBeUndefined();
    expect("evil" in bag).toBe(false);
  });
});

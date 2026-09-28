/* Share-token crypto: mint → hash (lookup) / encrypt→decrypt (re-email). */
import { describe, expect, it } from "vitest";

import { decryptToken, encryptToken, hashToken, mintToken } from "@/lib/shares/grants";

describe("share tokens", () => {
  it("mintToken produces distinct url-safe tokens", () => {
    const a = mintToken();
    const b = mintToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it("hashToken is deterministic, one-way shaped, and not the token itself", async () => {
    const t = mintToken();
    const h1 = await hashToken(t);
    const h2 = await hashToken(t);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(t);
    expect(await hashToken(mintToken())).not.toBe(h1);
  });

  it("encryptToken/decryptToken round-trips (AES-GCM under derived key)", async () => {
    const t = mintToken();
    const enc = await encryptToken(t);
    expect(enc).not.toBe(t);
    expect(await decryptToken(enc)).toBe(t);
    // Ciphertexts are non-deterministic per call (fresh IV) but both decrypt.
    const enc2 = await encryptToken(t);
    expect(enc2).not.toBe(enc);
    expect(await decryptToken(enc2)).toBe(t);
  });

  it("decryptToken returns null for tampered ciphertext", async () => {
    const enc = await encryptToken(mintToken());
    const tampered = enc.slice(0, -4) + (enc.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(await decryptToken(tampered)).toBeNull();
  });
});

/* WEB-245 — pin the R2 class-move gate OFF (WEB-42 / roadmap S1 AC4).
 *
 * R2 bills Infrequent-Access operations in 1M-op blocks with no free tier
 * ($9/mo per single IA write — see the WEB-284 note in r2s3.ts), so class
 * moves stay disabled until cold RAW volume nears ~2TB. The gate is live in
 * r2s3.ts; this test PINS it: it must fail if anyone flips the default in
 * wrangler.jsonc or drops the `R2_CLASS_MOVES_ENABLED === "1"` check.
 *
 * The flag="1" case is included as a positive control — it proves the
 * no-fetch assertions guard the gate itself, not some dead code path. */
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import wranglerConfig from "../../wrangler.jsonc?raw";

import { toInfrequentAccess, toStandard } from "@/lib/storage/r2s3";

/* String-aware JSONC comment stripper — a naive // regex would eat the
 * "https://" URLs in the config's string values. */
function parseJsonc(text: string): Record<string, unknown> {
  let out = "";
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === "\\") {
        out += text[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      i += 1;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

const ORG = "gate-test-org";
const KEY = `${ORG}/raw/pin.cr3`;

let fetchSpy: ReturnType<typeof vi.spyOn>;
const flagKey = "R2_CLASS_MOVES_ENABLED";
const envRecord = env as unknown as Record<string, unknown>;
const originalFlag = envRecord[flagKey] as string | undefined;

function setFlag(value: string | undefined): void {
  if (value === undefined) delete envRecord[flagKey];
  else envRecord[flagKey] = value;
}

beforeEach(async () => {
  await env.R2.put(KEY, "raw-bytes", { httpMetadata: { contentType: "application/octet-stream" } });
  // The gate-open path only needs S3 signing (local HMAC) + one PUT; the
  // fake test creds in tests/wrangler.test.jsonc never reach the network
  // because fetch is mocked here.
  fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("<CopyObjectResult></CopyObjectResult>", { status: 200 }));
});

afterEach(async () => {
  fetchSpy.mockRestore();
  setFlag(originalFlag);
  await env.R2.delete(KEY);
});

describe("wrangler.jsonc pins the class-move gate off", () => {
  it("vars.R2_CLASS_MOVES_ENABLED is \"0\"", () => {
    const config = parseJsonc(wranglerConfig) as { vars?: Record<string, string> };
    expect(config.vars?.[flagKey]).toBe("0");
  });
});

describe("class-move gate (r2s3.ts)", () => {
  it.each(["0", "", "true", "on", "yes"] as const)(
    "toInfrequentAccess and toStandard make no S3 call when the flag is %j",
    async (value) => {
      setFlag(value);
      await toInfrequentAccess(ORG, KEY);
      await toStandard(ORG, KEY);
      expect(fetchSpy).not.toHaveBeenCalled();
      // The object is untouched — no copy, no metadata rewrite.
      expect(await env.R2.head(KEY)).not.toBeNull();
    },
  );

  it("gate holds when the flag is unset (deploy default)", async () => {
    setFlag(undefined);
    await toInfrequentAccess(ORG, KEY);
    await toStandard(ORG, KEY);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("positive control: flag \"1\" issues the CopyObject PUTs the gate blocks", async () => {
    setFlag("1");
    await toInfrequentAccess(ORG, KEY);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const iaReq = fetchSpy.mock.calls[0][0] as Request;
    expect(iaReq.method).toBe("PUT");
    expect(iaReq.url).toContain(".r2.cloudflarestorage.com/");
    expect(iaReq.headers.get("x-amz-storage-class")).toBe("STANDARD_IA");

    await toStandard(ORG, KEY);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const stdReq = fetchSpy.mock.calls[1][0] as Request;
    expect(stdReq.headers.get("x-amz-storage-class")).toBe("STANDARD");
  });
});

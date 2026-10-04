/* Downloads 3.0 - the streaming ZIP writer and part planner. The archive is
 * parsed back by hand (central directory → local headers → payload) so the
 * test proves what an unzip tool will see, not what the writer intended. */
import { describe, expect, it } from "vitest";

import { parseZip } from "../helpers/zip";

import {
  PART_BYTES,
  allocateZipName,
  crc32,
  planParts,
  planRevision,
  zipChunks,
  zipReadable,
  type ZipEntry,
} from "@/lib/zip-stream";

const enc = (s: string) => new TextEncoder().encode(s);

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function naiveCrc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function streamOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(ch);
      c.close();
    },
  });
}

describe("crc32 (slicing-by-8)", () => {
  it("matches the canonical vector", () => {
    expect(crc32(enc("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it("agrees with a bitwise reference across lengths and alignments", () => {
    const data = new Uint8Array(4099);
    for (let i = 0; i < data.length; i++) data[i] = (i * 31 + (i >> 3)) & 0xff;
    for (const len of [1, 7, 8, 9, 15, 16, 17, 255, 1024, 4099]) {
      expect(crc32(data.subarray(0, len))).toBe(naiveCrc32(data.subarray(0, len)));
    }
  });

  it("is incremental: chunked seeds equal one pass", () => {
    const data = new Uint8Array(10_000).map((_, i) => (i * 7) & 0xff);
    let crc = 0;
    for (let i = 0; i < data.length; i += 1337) crc = crc32(data.subarray(i, i + 1337), crc);
    expect(crc).toBe(crc32(data));
  });
});

describe("allocateZipName", () => {
  it("dedupes with folder prefixes and (n) suffixes", () => {
    const taken = new Set<string>();
    expect(allocateZipName(taken, "Ceremony", "IMG_1.jpg")).toBe("Ceremony/IMG_1.jpg");
    expect(allocateZipName(taken, "Ceremony", "IMG_1.jpg")).toBe("Ceremony/IMG_1 (2).jpg");
    expect(allocateZipName(taken, null, "IMG_1.jpg")).toBe("IMG_1.jpg");
    expect(allocateZipName(taken, null, "IMG_1.jpg")).toBe("IMG_1 (2).jpg");
    expect(allocateZipName(taken, "Par/ty", "x.jpg")).toBe("Par-ty/x.jpg");
  });

  it("neutralises separators and control characters so a name can't escape", () => {
    const taken = new Set<string>();
    expect(allocateZipName(taken, null, "..\\..\\evil.jpg")).toBe("..-..-evil.jpg");
    expect(allocateZipName(taken, null, "a\u0000b\nc.jpg")).toBe("abc.jpg");
    expect(allocateZipName(taken, null, "   ")).toBe("file");
  });

  it("dedupes extensionless names without mangling them", () => {
    const taken = new Set<string>();
    expect(allocateZipName(taken, null, "README")).toBe("README");
    expect(allocateZipName(taken, null, "README")).toBe("README (2)");
    expect(allocateZipName(taken, "v1.0", "README")).toBe("v1.0/README");
    expect(allocateZipName(taken, "v1.0", "README")).toBe("v1.0/README (2)");
  });
});

describe("planParts", () => {
  const item = (i: number, bytes: number) => ({ id: `a${i}`, name: `p${i}.jpg`, bytes });

  it("one part for a small gallery", () => {
    const parts = planParts([item(1, 10), item(2, 20)]);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ index: 1, bytes: 30 });
  });

  it("splits a 20 GB wedding into <= 2 GiB parts, preserving order and every file", () => {
    const items = Array.from({ length: 2000 }, (_, i) => item(i, 10 * 1024 * 1024)); // 2000 x 10 MiB ≈ 19.5 GiB
    const parts = planParts(items);
    expect(parts.length).toBe(10);
    for (const p of parts) expect(p.bytes).toBeLessThanOrEqual(PART_BYTES);
    expect(parts.flatMap((p) => p.items).map((i) => i.id)).toEqual(items.map((i) => i.id));
    expect(parts.map((p) => p.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("an oversized single item gets a part of its own; empty input plans nothing", () => {
    const parts = planParts([item(1, 100), item(2, PART_BYTES * 1.5), item(3, 100)]);
    expect(parts.map((p) => p.items.length)).toEqual([1, 1, 1]);
    expect(planParts([])).toEqual([]);
  });

  it("caps files per part", () => {
    const parts = planParts(Array.from({ length: 25 }, (_, i) => item(i, 1)), PART_BYTES, 10);
    expect(parts.map((p) => p.items.length)).toEqual([10, 10, 5]);
  });

  it("is deterministic, and the revision changes when the gallery does", async () => {
    const a = [item(1, 5), item(2, 6)];
    expect(await planRevision(a)).toBe(await planRevision([item(1, 5), item(2, 6)]));
    expect(await planRevision(a)).not.toBe(await planRevision([item(1, 5)]));
    expect(await planRevision(a)).not.toBe(await planRevision([item(1, 5), item(2, 7)]));
  });
});

describe("zipChunks / zipReadable", () => {
  it("writes a valid archive mixing buffered and streamed entries", async () => {
    const big = new Uint8Array(300_000).map((_, i) => (i * 13) & 0xff);
    const entries: ZipEntry[] = [
      { name: "Ceremony/a.jpg", open: async () => ({ bytes: enc("buffered-bytes") }) },
      { name: "b.mp4", open: async () => ({ stream: streamOf(big.subarray(0, 100_000), big.subarray(100_000)), size: big.length }) },
      { name: "wedding é 💍.jpg", open: async () => ({ bytes: enc("unicode") }) },
    ];
    const zip = await collect(zipReadable(entries));
    const parsed = parseZip(zip);

    expect(parsed.map((p) => p.name)).toEqual(["Ceremony/a.jpg", "b.mp4", "wedding é 💍.jpg"]);
    expect(new TextDecoder().decode(parsed[0].data)).toBe("buffered-bytes");
    expect(parsed[1].data).toEqual(big);
    for (const p of parsed) {
      expect(crc32(p.data)).toBe(p.crc);
      expect(p.flags & 0x0800).toBe(0x0800); // UTF-8 names
    }
    expect(parsed[0].flags & 0x0008).toBe(0); // buffered: no descriptor
    expect(parsed[1].flags & 0x0008).toBe(0x0008); // streamed: descriptor
  });

  it("skips entries that can't be opened and counts only what shipped", async () => {
    const zip = await collect(
      zipReadable([
        { name: "gone.jpg", open: async () => null },
        { name: "here.jpg", open: async () => ({ bytes: enc("x") }) },
      ]),
    );
    expect(parseZip(zip).map((p) => p.name)).toEqual(["here.jpg"]);
  });

  it("an empty archive is still a valid (22-byte) ZIP", async () => {
    const zip = await collect(zipReadable([]));
    expect(zip.length).toBe(22);
    expect(parseZip(zip)).toEqual([]);
  });

  it("refuses an entry that would need ZIP64 (streamed) and skips one that is already buffered", async () => {
    const chunk = () => new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(60)); } });
    await expect(
      collect(zipReadable([{ name: "huge.bin", open: async () => ({ stream: chunk(), size: 0 }) }], { entryMaxBytes: 100 })),
    ).rejects.toThrow(/too large/);
    const zip = await collect(zipReadable([{ name: "big", open: async () => ({ bytes: new Uint8Array(100) }) }], { entryMaxBytes: 100 }));
    expect(parseZip(zip)).toEqual([]);
  });

  it("beforeEntry runs per entry and aborting it kills the stream (revocation)", async () => {
    let calls = 0;
    const entries: ZipEntry[] = ["a", "b", "c"].map((n) => ({ name: n, open: async () => ({ bytes: enc(n) }) }));
    const stream = zipReadable(entries, {
      beforeEntry: async () => {
        calls += 1;
        if (calls === 2) throw new Error("gallery revoked");
      },
    });
    await expect(collect(stream)).rejects.toThrow(/revoked/);
    expect(calls).toBe(2); // the third entry never opened
  });

  it("is pull-driven: a cancelled consumer stops reading and cancels the source", async () => {
    let cancelled = false;
    let pulls = 0;
    const source = new ReadableStream<Uint8Array>({
      pull(c) {
        pulls += 1;
        c.enqueue(new Uint8Array(1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    const reader = zipReadable([{ name: "x", open: async () => ({ stream: source, size: 0 }) }]).getReader();
    await reader.read(); // local header
    await reader.read(); // first payload chunk
    await reader.cancel();
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(10);
  });

  it("zipChunks is an async generator the caller can stop early", async () => {
    const gen = zipChunks([{ name: "a", open: async () => ({ bytes: enc("a") }) }]);
    expect((await gen.next()).done).toBe(false);
    await gen.return(undefined);
    expect((await gen.next()).done).toBe(true);
  });
});

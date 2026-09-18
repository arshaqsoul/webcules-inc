import fs from "node:fs";
import path from "node:path";
import { nowIso, projPath, readJsonSafe, writeJson } from "./util.ts";
import type { SwipeEntry, SwipeKey } from "./types.ts";

export const SWIPE_KEYS: SwipeKey[] = ["facebook", "instagram", "tiktok", "linkedin", "whatsapp", "visual"];

export function loadSwipe(slug: string, key: SwipeKey): SwipeEntry[] {
  return readJsonSafe<SwipeEntry[]>(projPath(slug, "swipe", `${key}.json`), []);
}

export function saveSwipe(slug: string, key: SwipeKey, entries: SwipeEntry[]): SwipeEntry[] {
  writeJson(projPath(slug, "swipe", `${key}.json`), entries);
  return entries;
}

export function addEntry(slug: string, entry: Omit<SwipeEntry, "id" | "savedAt">): SwipeEntry {
  const full: SwipeEntry = { ...entry, id: "sw_" + Math.random().toString(36).slice(2, 9), savedAt: nowIso() };
  const entries = loadSwipe(slug, full.key);
  entries.push(full);
  saveSwipe(slug, full.key, entries);
  return full;
}

export function updateEntry(slug: string, id: string, patch: Partial<SwipeEntry>): SwipeEntry | null {
  for (const key of SWIPE_KEYS) {
    const entries = loadSwipe(slug, key);
    const i = entries.findIndex((e) => e.id === id);
    if (i >= 0) {
      entries[i] = { ...entries[i]!, ...patch, id, key: entries[i]!.key };
      saveSwipe(slug, key, entries);
      return entries[i]!;
    }
  }
  return null;
}

export function deleteEntry(slug: string, id: string): boolean {
  for (const key of SWIPE_KEYS) {
    const entries = loadSwipe(slug, key);
    const i = entries.findIndex((e) => e.id === id);
    if (i >= 0) {
      entries.splice(i, 1);
      saveSwipe(slug, key, entries);
      return true;
    }
  }
  return false;
}

/**
 * Best-effort metadata fetch for a pasted reference URL (og:title / og:description /
 * og:image). Ad libraries are mostly JS-rendered — when tags are missing we keep the
 * URL and whatever the user typed; that's how real swipe files work anyway.
 */
export async function fetchOg(url: string): Promise<{ title?: string; description?: string; image?: string }> {
  const { fetchWithTimeout, UA } = await import("./util.ts");
  const r = await fetchWithTimeout(url, { timeoutMs: 10000, headers: { "User-Agent": UA } });
  const html = (await r.text()).slice(0, 400_000);
  const meta = (prop: string) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i");
    const m = html.match(re);
    return m?.[1];
  };
  const title = meta("og:title") ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  return {
    title: title?.trim().slice(0, 200),
    description: meta("og:description")?.trim().slice(0, 400),
    image: meta("og:image"),
  };
}

/** Save a swipe thumbnail into the project (assets/swipe/) and return its relative path. */
export async function saveThumb(slug: string, url: string): Promise<string | undefined> {
  try {
    const { fetchWithTimeout } = await import("./util.ts");
    const r = await fetchWithTimeout(url, { timeoutMs: 15000 });
    if (!r.ok) return undefined;
    const type = r.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return undefined;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) return undefined;
    const dir = projPath(slug, "assets", "swipe");
    fs.mkdirSync(dir, { recursive: true });
    const name = `sw_${Date.now().toString(36)}${path.extname(new URL(url).pathname) || ".jpg"}`.slice(0, 80);
    fs.writeFileSync(path.join(dir, name), buf);
    return `assets/swipe/${name}`;
  } catch {
    return undefined;
  }
}

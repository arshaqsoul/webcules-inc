/* Gallery photo order (pure + client-safe): the sort modes a photographer
 * can apply, natural filename comparison, and the position math behind drag
 * and drop. Order lives on the delivered gallery (share_grant_asset.position)
 * - the same photo can sit in several galleries, each with its own order.
 *
 * Positions are spaced by POSITION_STEP so a drag rewrites only the moved
 * rows (a gap is split) instead of renumbering a 1,500-photo gallery; the
 * rare exhausted gap falls back to one full renumber. */

export const POSITION_STEP = 1024;

export const SORT_MODES = ["upload_old", "upload_new", "taken_old", "taken_new", "name_az", "name_za", "color", "random"] as const;
export type SortMode = (typeof SORT_MODES)[number];
/** What the gallery is currently ordered by: a sort that was applied, or a hand-arranged order. */
export type OrderMode = SortMode | "custom";

export const SORT_LABELS: Record<OrderMode, string> = {
  upload_old: "Upload date - oldest first",
  upload_new: "Upload date - newest first",
  taken_old: "Date taken - oldest first",
  taken_new: "Date taken - newest first",
  name_az: "Filename A to Z",
  name_za: "Filename Z to A",
  color: "Color - rainbow",
  random: "Random shuffle",
  custom: "Custom order",
};

export function isSortMode(value: unknown): value is SortMode {
  return typeof value === "string" && (SORT_MODES as readonly string[]).includes(value);
}

export function isOrderMode(value: unknown): value is OrderMode {
  return value === "custom" || isSortMode(value);
}

export type OrderItem = {
  id: string;
  filename: string;
  /** Upload time, epoch seconds. */
  createdAtSec: number;
  /** EXIF capture time, epoch seconds; null/<=0 = unknown (falls back to upload time). */
  capturedAtSec: number | null;
  /** lib/color-sort.ts key; null = not analysed yet (sorts last). */
  colorKey: number | null;
  /** Folder label frozen at delivery; sorts apply within each folder. */
  folder: string | null;
};

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Human filename order: IMG_2 before IMG_10, case-insensitive. */
export function compareNatural(a: string, b: string): number {
  return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

function takenSec(i: OrderItem): number {
  return i.capturedAtSec && i.capturedAtSec > 0 ? i.capturedAtSec : i.createdAtSec;
}

/** mulberry32 - tiny seeded PRNG so "random" is reproducible in tests. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sortGroup(items: OrderItem[], mode: SortMode, seed: number): OrderItem[] {
  const out = [...items];
  const tie = (a: OrderItem, b: OrderItem) => compareNatural(a.filename, b.filename) || (a.id < b.id ? -1 : 1);
  switch (mode) {
    case "upload_old":
      return out.sort((a, b) => a.createdAtSec - b.createdAtSec || tie(a, b));
    case "upload_new":
      return out.sort((a, b) => b.createdAtSec - a.createdAtSec || tie(a, b));
    case "taken_old":
      return out.sort((a, b) => takenSec(a) - takenSec(b) || tie(a, b));
    case "taken_new":
      return out.sort((a, b) => takenSec(b) - takenSec(a) || tie(a, b));
    case "name_az":
      return out.sort((a, b) => tie(a, b));
    case "name_za":
      return out.sort((a, b) => tie(b, a));
    case "color":
      // Un-analysed photos go last, in filename order.
      return out.sort((a, b) => (a.colorKey ?? Infinity) - (b.colorKey ?? Infinity) || tie(a, b));
    case "random": {
      const rand = rng(seed);
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    }
  }
}

/** Ids in the order `mode` produces. `items` must arrive in the gallery's
 * CURRENT order: folders keep their current relative order (a folder sits
 * where its first photo sits) and the sort applies inside each folder, so
 * "filename A-Z" on a wedding gives Ceremony A-Z, then Reception A-Z. */
export function orderedIdsForSort(items: OrderItem[], mode: SortMode, seed = 1): string[] {
  const groups = new Map<string, OrderItem[]>();
  for (const item of items) {
    const key = item.folder ?? "";
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  const ids: string[] = [];
  for (const group of groups.values()) for (const item of sortGroup(group, mode, seed)) ids.push(item.id);
  return ids;
}

/** Dense positions for an ordered id list. */
export function stepPositions(ids: string[]): Map<string, number> {
  return new Map(ids.map((id, i) => [id, (i + 1) * POSITION_STEP]));
}

export type MovePlan = {
  /** The whole gallery order after the move. */
  order: string[];
  /** Only the rows that must be written. */
  positions: Map<string, number>;
  /** True when the gap ran out and every row was renumbered. */
  renumbered: boolean;
};

/** Move `moving` (keeping their relative order) to sit immediately before
 * `beforeId` (null = the end). `current` is the gallery in position order. */
export function planMove(current: { id: string; position: number }[], moving: string[], beforeId: string | null): MovePlan {
  const movingSet = new Set(moving);
  // Dropping a group onto one of its own members changes nothing.
  if (beforeId !== null && movingSet.has(beforeId)) {
    return { order: current.map((c) => c.id), positions: new Map(), renumbered: false };
  }
  const moved = current.filter((c) => movingSet.has(c.id)).map((c) => c.id); // relative order preserved
  const rest = current.filter((c) => !movingSet.has(c.id));
  let at = beforeId === null ? rest.length : rest.findIndex((c) => c.id === beforeId);
  if (at < 0) at = rest.length;

  const order = [...rest.slice(0, at).map((c) => c.id), ...moved, ...rest.slice(at).map((c) => c.id)];
  const k = moved.length;
  if (k === 0) return { order: current.map((c) => c.id), positions: new Map(), renumbered: false };

  const prev = at > 0 ? rest[at - 1].position : null;
  const next = at < rest.length ? rest[at].position : null;
  const positions = new Map<string, number>();

  if (prev === null && next === null) {
    return { order, positions: stepPositions(order), renumbered: true };
  }
  if (prev === null) {
    moved.forEach((id, i) => positions.set(id, next! - POSITION_STEP * (k - i)));
  } else if (next === null) {
    moved.forEach((id, i) => positions.set(id, prev + POSITION_STEP * (i + 1)));
  } else {
    const gap = next - prev;
    if (gap < k + 1) return { order, positions: stepPositions(order), renumbered: true };
    moved.forEach((id, i) => positions.set(id, prev + Math.floor((gap * (i + 1)) / (k + 1))));
  }
  return { order, positions, renumbered: false };
}

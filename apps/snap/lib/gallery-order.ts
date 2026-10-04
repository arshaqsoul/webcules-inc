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

/** The order after moving `ids` before `beforeId` (null = the end) - the pure
 * "what would it look like" used for live drag previews and optimistic UI.
 * Same result as planMove(...).order. */
export function applyMove(order: string[], ids: string[], beforeId: string | null): string[] {
  return planMove(
    order.map((id, i) => ({ id, position: (i + 1) * POSITION_STEP })),
    ids,
    beforeId,
  ).order;
}

/** Where a dragged group goes when the pointer is over `hoverId`: before it
 * when moving toward the start, after it when moving toward the end. Returns
 * `beforeId` for applyMove, or `undefined` for "no change" (hovering the
 * group itself). Crossing the tile's CENTER is what triggers a swap, which
 * is what stops a live-reflowing grid from flickering under the pointer. */
export function dropTarget(order: string[], moving: string[], hoverId: string, pastCenter: boolean): string | null | undefined {
  const movingSet = new Set(moving);
  if (movingSet.has(hoverId)) return undefined;
  const rest = order.filter((id) => !movingSet.has(id));
  const hoverAt = rest.indexOf(hoverId);
  if (hoverAt < 0) return undefined;
  const groupAt = order.findIndex((id) => movingSet.has(id)); // where the block currently sits
  const hoverOrderAt = order.indexOf(hoverId);
  const hoverIsAfterBlock = hoverOrderAt > groupAt;
  if (hoverIsAfterBlock) {
    // moving toward the end: swap once the pointer is past the centre → insert AFTER the tile
    return pastCenter ? (rest[hoverAt + 1] ?? null) : undefined;
  }
  // moving toward the start: swap once the pointer is before the centre → insert BEFORE the tile
  return pastCenter ? undefined : hoverId;
}

/** Indices (into `seq`) of one longest strictly-increasing subsequence. */
function longestIncreasing(seq: number[]): Set<number> {
  const tails: number[] = []; // tails[k] = index in seq ending the best subsequence of length k+1
  const prev = new Array<number>(seq.length).fill(-1);
  for (let i = 0; i < seq.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]] < seq[i]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const keep = new Set<number>();
  for (let at = tails.length ? tails[tails.length - 1] : -1; at >= 0; at = prev[at]) keep.add(at);
  return keep;
}

/** Save a whole arrangement with the FEWEST row writes. `finalOrder` is the
 * gallery order the photographer ended on (a permutation of `current`).
 * Photos already in relative order keep their stored positions (a longest
 * increasing subsequence); only the photos that actually moved get new
 * positions, spaced into the gaps around their neighbours. So a handful of
 * drags on a 1,500-photo gallery writes a handful of rows - while a full
 * re-sort (where nearly everything moves) writes about N. If a gap runs out,
 * everything is renumbered once. */
export function planSet(current: { id: string; position: number }[], finalOrder: string[]): { positions: Map<string, number>; renumbered: boolean } {
  const pos = new Map(current.map((c) => [c.id, c.position]));
  const seq = finalOrder.map((id) => pos.get(id) ?? 0);
  const keep = longestIncreasing(seq);
  const out = new Map<string, number>();
  const n = finalOrder.length;
  const renumber = () => ({ positions: stepPositions(finalOrder), renumbered: true });

  let i = 0;
  while (i < n) {
    if (keep.has(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && !keep.has(j)) j++;
    const k = j - i; // a maximal run of moved photos, between two kept ones
    const left = i > 0 ? seq[i - 1] : null;
    const right = j < n ? seq[j] : null;
    if (left === null && right === null) return renumber();
    for (let t = 0; t < k; t++) {
      let at: number;
      if (left === null) at = right! - POSITION_STEP * (k - t);
      else if (right === null) at = left + POSITION_STEP * (t + 1);
      else {
        const gap = right - left;
        if (gap < k + 1) return renumber();
        at = left + Math.floor((gap * (t + 1)) / (k + 1));
      }
      out.set(finalOrder[i + t], at);
    }
    i = j;
  }
  return { positions: out, renumbered: false };
}

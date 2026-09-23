/* Saved component configs — the client-side contract for the playground
 * "Save" flow and the dashboard. Server routes live in app/api/configs.
 *
 * API contract (all JSON):
 *   POST   /api/configs        { component, config, title?, id? } → { ok, id } | 401 { error }
 *   GET    /api/configs        → { configs: SavedConfig[] }
 *   PATCH  /api/configs/:id    { config?, title? }                → { ok, id } | 401 { error }
 *   DELETE /api/configs/:id                                       → { ok }
 */

export type ConfigValues = Record<string, number | boolean | string>;

export type SavedConfig = {
  id: string;
  component: string;
  title: string;
  config: ConfigValues;
  createdAt: string;
  updatedAt: string;
};

const PENDING_KEY = "webcules:pending-save";

export type PendingSave = {
  component: string;
  config: ConfigValues;
  title?: string;
};

/* A save attempted while signed out is parked here and replayed by the
 * login page once the session exists. */
export function parkPendingSave(save: PendingSave) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(save));
  } catch {
    /* storage unavailable */
  }
}

export function takePendingSave(): PendingSave | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_KEY);
    return JSON.parse(raw) as PendingSave;
  } catch {
    return null;
  }
}

export async function fetchConfigs(): Promise<SavedConfig[]> {
  const res = await fetch("/api/configs", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load saved configs (${res.status})`);
  const json = (await res.json()) as { configs: SavedConfig[] };
  return json.configs;
}

export async function saveConfig(input: {
  id?: string;
  component: string;
  config: ConfigValues;
  title?: string;
}): Promise<{ ok: false; unauthorized: true } | { ok: true; id: string }> {
  const res = await fetch("/api/configs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.status === 401) return { ok: false, unauthorized: true };
  if (!res.ok) throw new Error(`Save failed (${res.status})`);
  const json = (await res.json()) as { id: string };
  return { ok: true, id: json.id };
}

export async function deleteConfig(id: string): Promise<void> {
  const res = await fetch(`/api/configs/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}

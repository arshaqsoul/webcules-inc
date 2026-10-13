/* WEB-183 (Integrations 4/6) — Google Drive import: Picker + drive.file,
 * browser relay, explicit import sessions.
 *
 * The studio's own Drive, pulled through with the narrowest consent Google
 * offers: the Google Picker (Google's own UI, in a popup) lets the user
 * browse everything, and the GIS token client asks for `drive.file` scope
 * only — per-file access to exactly the files they picked. Google exempts
 * `drive.file` apps from restricted-scope verification and the annual CASA
 * assessment, and Snap (and its servers) can never see or touch anything
 * else in the account.
 *
 * "Browser relay": the bytes never transit Snap's Worker. The browser
 * downloads each picked file from Drive (`?alt=media`, Bearer token that
 * exists only in this tab) and hands it to the SAME upload queue as
 * drag-and-drop — dedup fingerprints, retry/backoff, multipart, all of it.
 * No refresh token is ever requested or stored; nothing server-side ever
 * sees a Google credential.
 *
 * "Explicit import session": every import opens a server-side session row
 * (source, picked files) and closes it with per-file outcomes, so relayed
 * imports are auditable and distinct from plain uploads. See
 * lib/repos/import-sessions.ts + migrations/0076_drive_import_sessions.sql.
 *
 * Pure helpers (appId derivation, picked-doc filtering, outcome mapping) are
 * exported for tests; window/network code stays inside the functions. */
import {
  DRIVE_SCOPE,
  GIS_SRC,
  loadScriptOnce,
} from "./cloud-destinations";

export { DRIVE_SCOPE };

/** Most files one import session accepts (Picker multiselect is the bound in
 * practice; this is the hard stop that keeps a session payload sane). */
export const DRIVE_IMPORT_MAX_FILES = 500;
/** Matches the per-file cap of the upload pipeline ("up to 5 GB per file"). */
export const DRIVE_IMPORT_MAX_FILE_BYTES = 5 * 1024 ** 3;

/** Field caps shared with the server-side session repo. */
export const DRIVE_FILE_ID_MAX = 128;
export const DRIVE_NAME_MAX = 255;

/* ---------------- pure helpers ---------------- */

/** The Picker's `setAppId` wants the numeric project id the client id
 * belongs to. Google issues web client ids exclusively as
 * `<projectnumber>-<suffix>.apps.googleusercontent.com` (e.g.
 * `606239879894-abc123.apps.googleusercontent.com`); the bare-numeric
 * `<projectnumber>.apps.googleusercontent.com` form is also accepted.
 * Either way the project number prefix is the Picker app id. */
export function driveAppId(clientId: string): string | null {
  const trimmed = clientId.trim();
  const m = /^(\d+)(?:-[a-z0-9]+)?\.apps\.googleusercontent\.com$/.exec(trimmed);
  return m ? m[1] : null;
}

/** One row as Picker reports it (subset of google.picker.Document). */
export type DrivePickedDoc = {
  id: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
};

export type DrivePickedFile = DrivePickedDoc;

export type DriveFilterLimits = {
  maxFiles: number;
  maxFileBytes: number;
};

const DEFAULT_FILTER_LIMITS: DriveFilterLimits = {
  maxFiles: DRIVE_IMPORT_MAX_FILES,
  maxFileBytes: DRIVE_IMPORT_MAX_FILE_BYTES,
};

export type DriveFilterResult =
  | {
      ok: true;
      files: DrivePickedFile[];
      /** Drive folders / Google-native docs (Docs, Sheets, …) in the pick. */
      skippedGoogleNative: number;
      /** Files whose name Snap doesn't accept (classifyUpload === null). */
      skippedUnsupported: number;
      /** Files over the per-file size cap (declared size). */
      skippedTooLarge: number;
    }
  | { ok: false; error: "too_many_files"; detail: string };

/** Google-native document MIME prefix — folders, Docs, Sheets, Slides. They
 * have no bytes `alt=media` can hand over (and no filename Snap accepts). */
export function isGoogleNativeDoc(doc: {
  name: string;
  mimeType?: string;
}): boolean {
  return Boolean(doc.mimeType?.startsWith("application/vnd.google-apps."));
}

/** Filter a Picker selection down to files Snap will actually import.
 * Pure — no DOM, no network — so it runs in unit tests and workerd. */
export function filterPickedDocs(
  docs: DrivePickedDoc[],
  limits: Partial<DriveFilterLimits> = {},
): DriveFilterResult {
  const L = { ...DEFAULT_FILTER_LIMITS, ...limits };
  const files: DrivePickedFile[] = [];
  let skippedGoogleNative = 0;
  let skippedUnsupported = 0;
  let skippedTooLarge = 0;
  for (const doc of docs) {
    if (isGoogleNativeDoc(doc)) {
      skippedGoogleNative++;
      continue;
    }
    if (!classifyUploadName(doc.name)) {
      skippedUnsupported++;
      continue;
    }
    if (typeof doc.sizeBytes === "number" && doc.sizeBytes > L.maxFileBytes) {
      skippedTooLarge++;
      continue;
    }
    if (files.length >= L.maxFiles) {
      return {
        ok: false,
        error: "too_many_files",
        detail: `more than ${L.maxFiles} importable files`,
      };
    }
    files.push({
      id: doc.id.slice(0, DRIVE_FILE_ID_MAX),
      name: clampName(doc.name, DRIVE_NAME_MAX),
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
    });
  }
  return {
    ok: true,
    files,
    skippedGoogleNative,
    skippedUnsupported,
    skippedTooLarge,
  };
}

/* Classify by extension via the shared gate (lib/upload-kinds.ts) without
 * importing client-unsafe code into workerd unit tests — classifyUpload
 * itself is pure, so this is just a thin named wrapper for readability. */
import { classifyUpload } from "./upload-kinds";

function classifyUploadName(name: string): boolean {
  return classifyUpload(name) !== null;
}

/** Clamp a filename to `max` chars, keeping the extension when the clamp
 * would otherwise cut it off (the server classifies by extension too). */
export function clampName(name: string, max: number): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return name.slice(0, max); // no extension (or dotfile)
  const ext = name.slice(dot); // ".jpg"
  const head = max - ext.length;
  if (head < 1) return name.slice(0, max);
  return name.slice(0, head) + ext;
}

/* ---------------- session outcomes (shared with the server repo) ---------------- */

export type DriveImportOutcome = "imported" | "skipped_duplicate" | "skipped" | "failed";

/** Map a queue item's final state (+ its error label, which carries the
 * duplicate-skip marker from enqueueWithStore) to a session outcome. */
export function outcomeForQueueState(
  state: "done" | "failed" | "canceled" | "pending" | "uploading" | "paused",
  error?: string,
): DriveImportOutcome {
  if (state === "done") return "imported";
  if (state === "failed") return "failed";
  if (state === "canceled" && error === "Duplicate — skipped")
    return "skipped_duplicate";
  return "skipped";
}

/** Sanitize + cap the entries payload both the client close call and the
 * server repo accept. Pure. */
export function buildSessionEntries(
  entries: { driveFileId: string; outcome: string }[],
  limits: Partial<{ maxFiles: number }> = {},
): { driveFileId: string; outcome: DriveImportOutcome }[] {
  const max = limits.maxFiles ?? DRIVE_IMPORT_MAX_FILES;
  const valid = new Set<DriveImportOutcome>([
    "imported",
    "skipped_duplicate",
    "skipped",
    "failed",
  ]);
  const out: { driveFileId: string; outcome: DriveImportOutcome }[] = [];
  const seen = new Set<string>();
  for (const e of entries.slice(0, max)) {
    const id = String(e.driveFileId ?? "").trim().slice(0, DRIVE_FILE_ID_MAX);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (!valid.has(e.outcome as DriveImportOutcome)) continue;
    out.push({ driveFileId: id, outcome: e.outcome as DriveImportOutcome });
  }
  return out;
}

/* ---------------- browser: GIS + Picker + download ---------------- */

type GsiTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
};
type GsiTokenClient = {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
};
type GsiOAuth2 = {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: GsiTokenResponse) => void;
  }) => GsiTokenClient;
};

/** GIS one-off consent for the IMPORT direction — same drive.file scope as
 * WEB-195's save-to-Drive, same never-stored token. Only ever called from a
 * click handler (a popup must be user-gestured). */
export async function driveImportAccessToken(
  clientId: string,
): Promise<string> {
  await loadScriptOnce(GIS_SRC);
  const oauth2 = (window as unknown as { google?: { accounts?: { oauth2?: GsiOAuth2 } } })
    .google?.accounts?.oauth2;
  if (!oauth2) throw new Error("gis_unavailable");
  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.access_token) resolve(response.access_token);
        else reject(new Error(response.error || "google_consent_failed"));
      },
    });
    client.requestAccessToken({ prompt: "" });
  });
}

const GAPI_SRC = "https://apis.google.com/js/api.js";

type PickerDoc = {
  id?: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
};
type PickerResponse = { action: string; docs?: PickerDoc[] };
type DocsView = { setParent: (p: string) => DocsView };
type PickerBuilderI = {
  setAppId: (id: string) => PickerBuilderI;
  setTitle: (t: string) => PickerBuilderI;
  setOAuthToken: (t: string) => PickerBuilderI;
  addView: (v: DocsView) => PickerBuilderI;
  enableFeature: (f: unknown) => PickerBuilderI;
  setCallback: (cb: (r: PickerResponse) => void) => PickerBuilderI;
  build: () => { setVisible: (v: boolean) => void };
};
type PickerNamespace = {
  DocsView: new (viewId?: string) => DocsView;
  ViewId: Record<string, string>;
  Feature: Record<string, unknown>;
  PickerBuilder: new () => PickerBuilderI;
};

function pickerNamespace(): Promise<PickerNamespace> {
  return new Promise((resolve, reject) => {
    const gapi = (
      window as unknown as {
        gapi?: {
          load: (
            pkg: string,
            cfg:
              | (() => void)
              | { callback: () => void; onerror: () => void },
          ) => void;
        };
      }
    ).gapi;
    if (!gapi) return reject(new Error("gapi_unavailable"));
    gapi.load("picker", {
      callback: () => {
        const picker = (
          window as unknown as { google?: { picker?: PickerNamespace } }
        ).google?.picker;
        if (picker) resolve(picker);
        else reject(new Error("picker_unavailable"));
      },
      onerror: () => reject(new Error("picker_load_failed")),
    });
  });
}

export type DrivePick = {
  token: string;
  docs: DrivePickedDoc[];
};

/** Open Google's Picker on the user's Drive. Resolves with the access token
 * (the caller reuses it for the downloads — no second consent) plus the
 * picked docs; null when the user closed the picker without picking. */
export async function pickFromDrive(clientId: string): Promise<DrivePick | null> {
  const appId = driveAppId(clientId);
  if (!appId) throw new Error("drive_client_id_invalid");
  const token = await driveImportAccessToken(clientId);
  await loadScriptOnce(GAPI_SRC);
  const picker = await pickerNamespace();
  const view = new picker.DocsView(picker.ViewId.DOCS).setParent("root");
  return new Promise<DrivePick | null>((resolve) => {
    const builder = new picker.PickerBuilder()
      .setAppId(appId)
      .setTitle("Import files from Google Drive")
      .setOAuthToken(token)
      .addView(view)
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setCallback((r) => {
        if (r.action === "picked") {
          const docs: DrivePickedDoc[] = [];
          for (const d of r.docs ?? []) {
            if (d.id && d.name) {
              docs.push({
                id: d.id,
                name: d.name,
                mimeType: d.mimeType,
                sizeBytes: d.sizeBytes,
              });
            }
          }
          resolve({ token, docs });
        } else if (r.action === "cancel") {
          resolve(null);
        }
      });
    builder.build().setVisible(true);
    // No reject path past here: builder construction errors surface as the
    // popup simply not opening; Google fires no error callback. The catch
    // above (script/token) covers the realistic failure modes.
  });
}

/** Browser relay: download one picked file's bytes from Drive. The token
 * only ever lives in this tab; Snap's servers never see it. */
export async function fetchDriveFile(
  token: string,
  doc: { id: string; name: string },
): Promise<File> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(doc.id)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`drive_download_failed_${res.status}`);
  const blob = await res.blob();
  return new File([blob], doc.name, {
    type: blob.type || "application/octet-stream",
  });
}

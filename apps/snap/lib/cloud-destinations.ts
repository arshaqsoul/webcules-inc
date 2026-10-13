/* WEB-195 Downloads 3b — client-side save-to-cloud destinations.
 *
 * 100% client-side by design: the server only mints the gallery's existing
 * entitlement-checked download URL (PIN, per-client cap, proofing
 * watermarking and audit all apply on the fetch below); the browser then
 * pushes the bytes to the CLIENT'S own account with their own OAuth
 * consent. Nothing is stored server-side — no refresh tokens, no file
 * handles, no Snap Google/Dropbox app server flow.
 *
 *  - Google Drive: Google Identity Services token client (one-off popup,
 *    `drive.file` scope — create-file-only) + a browser multipart upload
 *    to the Drive v3 resumable-less multipart endpoint.
 *  - Dropbox: the official Saver (dropins.js). The photo is fetched as a
 *    blob and handed over as an object URL, so Dropbox's servers never see
 *    the (cookie-gated) gallery URL and the client's session does the work.
 *
 * Keys are public browser values, surfaced to the gallery through the
 * download controls (`cloudDestinationsFromEnv`); until an environment
 * sets them the destination buttons simply never render. */

export type CloudDestination = "drive" | "dropbox";

/** Per-drive-file scope: Snap (and the studio) can never read or touch
 * anything else in the client's Drive — consent covers exactly the file
 * this upload creates. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export const GIS_SRC = "https://accounts.google.com/gsi/client";
export const DROPINS_SRC = "https://www.dropbox.com/static/api/2/dropins.js";

/** Map worker env (public vars) to the gallery's destination controls.
 * Blank/missing → null → the button stays hidden in that environment. */
export function cloudDestinationsFromEnv(envLike: {
  GOOGLE_DRIVE_CLIENT_ID?: string;
  DROPBOX_APP_KEY?: string;
}): { driveClientId: string | null; dropboxAppKey: string | null } {
  const driveClientId = (envLike.GOOGLE_DRIVE_CLIENT_ID ?? "").trim();
  const dropboxAppKey = (envLike.DROPBOX_APP_KEY ?? "").trim();
  return { driveClientId: driveClientId || null, dropboxAppKey: dropboxAppKey || null };
}

/* ---------------- script loading ---------------- */

const scriptLoads = new Map<string, Promise<void>>();

/** Inject a third-party <script> once per page, deduped by src. Rejects on
 * load error so the caller can show an honest flash instead of hanging. */
export function loadScriptOnce(src: string, attrs: Record<string, string> = {}): Promise<void> {
  const pending = scriptLoads.get(src);
  if (pending) return pending;
  const load = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.onload = () => resolve();
    s.onerror = () => {
      scriptLoads.delete(src);
      reject(new Error("script_load_failed"));
    }
    document.head.appendChild(s);
  });
  scriptLoads.set(src, load);
  return load;
}

/* ---------------- Google Drive (GIS + multipart upload) ---------------- */

type GsiTokenResponse = { access_token?: string; error?: string; error_description?: string };
type GsiTokenClient = { requestAccessToken: (overrides?: { prompt?: string }) => void };
type GsiOAuth2 = {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: GsiTokenResponse) => void;
  }) => GsiTokenClient;
};

/** GIS one-off consent: opens Google's popup, resolves with the access
 * token the client granted FOR THIS UPLOAD ONLY (never stored anywhere). */
async function driveAccessToken(clientId: string): Promise<string> {
  await loadScriptOnce(GIS_SRC);
  const oauth2 = (window as unknown as { google?: { accounts?: { oauth2?: GsiOAuth2 } } }).google?.accounts?.oauth2;
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
    // prompt "" → re-consent silently when a previous grant still stands,
    // never silently fail when it doesn't (a popup must be user-gestured —
    // this only ever runs from a click handler).
    client.requestAccessToken({ prompt: "" });
  });
}

/** The multipart/related body Drive's `uploadType=multipart` expects:
 * JSON metadata part + raw bytes part. Pure so it's unit-testable. */
export function driveUploadBody(
  filename: string,
  bytes: Blob,
  boundary = `snap${Math.random().toString(36).slice(2)}`,
): { body: Blob; contentType: string } {
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: filename })}\r\n--${boundary}\r\nContent-Type: ${bytes.type || "application/octet-stream"}\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  return {
    body: new Blob([head, bytes, tail], { type: "multipart/related" }),
    contentType: `multipart/related; boundary=${boundary}`,
  };
}

/** Fetch-consented upload of one blob to the client's own Drive root. */
export async function saveToDrive(opts: {
  clientId: string;
  filename: string;
  bytes: Blob;
}): Promise<{ id: string }> {
  const token = await driveAccessToken(opts.clientId);
  const { body, contentType } = driveUploadBody(opts.filename, opts.bytes);
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
    body,
  });
  if (!res.ok) throw new Error(`drive_upload_failed_${res.status}`);
  return (await res.json()) as { id: string };
}

/* ---------------- Dropbox Saver ---------------- */

type SaverOptions = {
  files: { url: string; filename: string }[];
  success?: () => void;
  error?: (errorMessage: string) => void;
  progress?: (percent: number) => void;
  cancel?: () => void;
};
type Dropins = {
  save: (options: SaverOptions) => void;
  isSupported?: () => boolean;
  init?: (options: { appKey: string }) => void;
};

/** dropins.js reads the app key from the <script id="dropboxjs"
 * data-app-key> tag itself (document.getElementById("dropboxjs")) — a tag
 * with only data-app-key loads the Saver with app_key=undefined and Dropbox
 * shows "App is misconfigured" (WEB-327). Pure so it is unit-testable. */
export function dropinsAttrs(appKey: string): Record<string, string> {
  return { id: "dropboxjs", "data-app-key": appKey };
}

/** Push one blob to the client's Dropbox via the Saver. The blob is handed
 * over as an object URL — dropins reads it in this tab, so the authorized
 * gallery URL (and its cookie gate) is never exposed to Dropbox's servers. */
export async function saveToDropbox(opts: {
  appKey: string;
  filename: string;
  bytes: Blob;
}): Promise<"saved" | "cancelled"> {
  await loadScriptOnce(DROPINS_SRC, dropinsAttrs(opts.appKey));
  const dropbox = (window as unknown as { Dropbox?: Dropins }).Dropbox;
  if (!dropbox || (dropbox.isSupported && !dropbox.isSupported())) throw new Error("saver_unsupported");
  // WEB-328: dropins resolves the app key from the <script id="dropboxjs">
  // tag at load time; if that lookup ever misses (dynamic inject edge,
  // cached script, library change) the Saver opens with app_key=undefined
  // and Dropbox answers "App is misconfigured". Set the key explicitly too
  // — verified in-page on staging — so the Saver can never lose it.
  dropbox.init?.({ appKey: opts.appKey });
  const url = URL.createObjectURL(opts.bytes);
  try {
    return await new Promise<"saved" | "cancelled">((resolve, reject) => {
      dropbox.save({
        files: [{ url, filename: opts.filename }],
        success: () => resolve("saved"),
        cancel: () => resolve("cancelled"),
        error: () => reject(new Error("saver_failed")),
      });
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

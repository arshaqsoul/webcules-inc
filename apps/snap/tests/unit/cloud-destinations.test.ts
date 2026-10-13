/* WEB-195 Downloads 3b — client-side cloud destinations: the pure pieces.
 * The browser flows (GIS popup, Drive multipart POST, dropins Saver) are
 * DOM/network-bound and covered by the wiring assertions in
 * tests/integration/downloads.test.ts; these tests pin the parts that must
 * not regress silently. */
import { describe, expect, it, vi } from "vitest";

import {
  DROPINS_SRC,
  DRIVE_SCOPE,
  cloudDestinationsFromEnv,
  driveUploadBody,
  dropinsAttrs,
  loadScriptOnce,
  saveToDropbox,
} from "@/lib/cloud-destinations";

describe("WEB-195 cloud destinations", () => {
  it("maps env keys to controls, hiding destinations whose key is unset or blank", () => {
    expect(cloudDestinationsFromEnv({})).toEqual({ driveClientId: null, dropboxAppKey: null });
    expect(cloudDestinationsFromEnv({ GOOGLE_DRIVE_CLIENT_ID: "  ", DROPBOX_APP_KEY: "" })).toEqual({
      driveClientId: null,
      dropboxAppKey: null,
    });
    expect(
      cloudDestinationsFromEnv({
        GOOGLE_DRIVE_CLIENT_ID: " abc.apps.googleusercontent.com ",
        DROPBOX_APP_KEY: "dbkey",
      }),
    ).toEqual({ driveClientId: "abc.apps.googleusercontent.com", dropboxAppKey: "dbkey" });
  });

  it("builds a Drive multipart/related body: metadata part, byte part, one boundary", async () => {
    const bytes = new Blob([new Uint8Array([1, 2, 3, 0xff])], { type: "image/jpeg" });
    const { body, contentType } = driveUploadBody("bride-portrait.jpg", bytes, "snapweb195");
    expect(contentType).toBe("multipart/related; boundary=snapweb195");
    const text = await body.text();
    // metadata part carries the filename as JSON
    expect(text).toContain("Content-Type: application/json; charset=UTF-8");
    expect(text).toContain('"name":"bride-portrait.jpg"');
    // byte part carries the asset's mime type
    expect(text).toContain("Content-Type: image/jpeg");
    // well-formed: opens and closes on the same boundary, binary survives
    expect(text.startsWith("--snapweb195\r\n")).toBe(true);
    expect(text.endsWith("\r\n--snapweb195--\r\n")).toBe(true);
    expect(text).toContain("\r\n--snapweb195\r\n");
    expect(text).not.toContain("\r\n--snapweb195\r\n--snapweb195--");
  });

  it("falls back to octet-stream for byte parts without a type", async () => {
    const { body } = driveUploadBody("raw.cr3", new Blob([new Uint8Array([0])]), "b");
    expect(await body.text()).toContain("Content-Type: application/octet-stream");
  });

  it("requests the create-file-only Drive scope — never full drive access", () => {
    expect(DRIVE_SCOPE).toBe("https://www.googleapis.com/auth/drive.file");
  });

  /* WEB-327: dropins.js resolves the app key via
   * document.getElementById("dropboxjs").getAttribute("data-app-key") — a
   * tag without that id opens the Saver with app_key=undefined and Dropbox
   * answers "App is misconfigured". */
  it("gives the dropins script tag id=\"dropboxjs\" alongside data-app-key", async () => {
    const attrs = dropinsAttrs("dbkey327");
    expect(attrs).toEqual({ id: "dropboxjs", "data-app-key": "dbkey327" });

    // …and loadScriptOnce applies exactly those attributes to the injected tag.
    const tag: Record<string, string> = {};
    const el = {
      set src(v: string) {
        tag.src = v;
      },
      async: false,
      setAttribute: (k: string, v: string) => {
        tag[k] = v;
      },
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
    };
    vi.stubGlobal("document", {
      createElement: () => el,
      head: {
        appendChild: () => {
          el.onload?.();
        },
      },
    });
    try {
      await loadScriptOnce(DROPINS_SRC, attrs);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(tag.src).toBe(DROPINS_SRC);
    expect(tag.id).toBe("dropboxjs");
    expect(tag["data-app-key"]).toBe("dbkey327");
  });

  /* WEB-328: even if dropins' script-tag key lookup misses, the Saver must
   * not open with app_key=undefined — saveToDropbox sets the key explicitly
   * via Dropbox.init (verified in-page on staging). */
  it("saveToDropbox sets the app key explicitly via Dropbox.init", async () => {
    const el = {
      src: "",
      async: false,
      setAttribute: () => {},
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
    };
    vi.stubGlobal("document", {
      createElement: () => el,
      head: { appendChild: () => el.onload?.() },
    });
    const init = vi.fn();
    const dropins = {
      isSupported: () => true,
      init,
      save: (options: { success?: () => void }) => options.success?.(),
    };
    vi.stubGlobal("window", { Dropbox: dropins });
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:web328",
      revokeObjectURL: () => {},
    });
    try {
      const result = await saveToDropbox({ appKey: "dbkey328", filename: "p.jpg", bytes: new Blob(["x"]) });
      expect(result).toBe("saved");
    } finally {
      vi.unstubAllGlobals();
    }
    expect(init).toHaveBeenCalledWith({ appKey: "dbkey328" });
  });
});

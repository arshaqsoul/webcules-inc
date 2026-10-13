/* WEB-195 Downloads 3b — client-side cloud destinations: the pure pieces.
 * The browser flows (GIS popup, Drive multipart POST, dropins Saver) are
 * DOM/network-bound and covered by the wiring assertions in
 * tests/integration/downloads.test.ts; these tests pin the parts that must
 * not regress silently. */
import { describe, expect, it } from "vitest";

import { DRIVE_SCOPE, cloudDestinationsFromEnv, driveUploadBody } from "@/lib/cloud-destinations";

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
});

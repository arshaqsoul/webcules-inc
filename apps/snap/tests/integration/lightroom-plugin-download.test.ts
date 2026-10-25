/* WEBC-124 (audit F5) — the in-app Snap Publish download. The route builds
 * the .zip from the same Lua sources it imports, so the suite pins the whole
 * contract: attachment headers, the folder-wrapping layout Lightroom's
 * Plug-in Manager requires, and byte-identical file contents. If the plugin
 * sources change, this fails the moment the served zip would differ. */
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/integrations/lightroom-plugin/route";
import apiClient from "../../integrations/lightroom/SnapPublish.lrplugin/ApiClient.lua?raw";
import info from "../../integrations/lightroom/SnapPublish.lrplugin/Info.lua?raw";
import json from "../../integrations/lightroom/SnapPublish.lrplugin/JSON.lua?raw";
import definition from "../../integrations/lightroom/SnapPublish.lrplugin/SnapPublishDefinition.lua?raw";
import pluginInfo from "../../integrations/lightroom/SnapPublish.lrplugin/SnapPublishPluginInfo.lua?raw";

const SOURCES: Record<string, string> = {
  "SnapPublish.lrplugin/ApiClient.lua": apiClient,
  "SnapPublish.lrplugin/Info.lua": info,
  "SnapPublish.lrplugin/JSON.lua": json,
  "SnapPublish.lrplugin/SnapPublishDefinition.lua": definition,
  "SnapPublish.lrplugin/SnapPublishPluginInfo.lua": pluginInfo,
};

describe("GET /api/integrations/lightroom-plugin", () => {
  it("serves a zip attachment with every plugin file, byte-identical to the sources", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain(
      "SnapPublish.lrplugin.zip",
    );

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes[0]).toBe(0x50); // "PK" — really a zip
    expect(bytes[1]).toBe(0x4b);

    const entries = unzipSync(bytes);
    expect(Object.keys(entries).sort()).toEqual(Object.keys(SOURCES).sort());

    const decoder = new TextDecoder();
    for (const [name, source] of Object.entries(SOURCES)) {
      expect(decoder.decode(entries[name]), name).toBe(source);
    }
  });

  it("answers without any credential — the download is deliberately public", async () => {
    // No cookie jar, no bearer token, no org context: a plugin download is
    // not studio data. The gate decision is pinned statically in
    // tests/unit/gate-matrix.test.ts (lightroom_plugin_public).
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

/* Snap Publish plugin download (WEBC-124, audit F5): serves the Lightroom
 * Classic publish plugin as a .zip built at request time from the plugin
 * sources in integrations/lightroom — the download can never drift from the
 * code, because it IS the code.
 *
 * Deliberately PUBLIC: this is a plugin download, not studio data (same
 * stance as the download-all routes — no session, no plan gate). Auth happens
 * inside the plugin itself, with the token the user mints on the very page
 * this download is linked from. Pinning that decision is the
 * lightroom_plugin_public gate in tests/unit/gate-matrix.test.ts. */
import { zipSync } from "fflate";

import apiClient from "../../../../integrations/lightroom/SnapPublish.lrplugin/ApiClient.lua?raw";
import info from "../../../../integrations/lightroom/SnapPublish.lrplugin/Info.lua?raw";
import json from "../../../../integrations/lightroom/SnapPublish.lrplugin/JSON.lua?raw";
import definition from "../../../../integrations/lightroom/SnapPublish.lrplugin/SnapPublishDefinition.lua?raw";
import pluginInfo from "../../../../integrations/lightroom/SnapPublish.lrplugin/SnapPublishPluginInfo.lua?raw";

const encoder = new TextEncoder();

// Zip layout matches the README's install instructions: Lightroom wants the
// `.lrplugin` FOLDER — the archive wraps the folder, not its loose contents.
const FILES: Record<string, Uint8Array> = {
  "SnapPublish.lrplugin/ApiClient.lua": encoder.encode(apiClient),
  "SnapPublish.lrplugin/Info.lua": encoder.encode(info),
  "SnapPublish.lrplugin/JSON.lua": encoder.encode(json),
  "SnapPublish.lrplugin/SnapPublishDefinition.lua": encoder.encode(definition),
  "SnapPublish.lrplugin/SnapPublishPluginInfo.lua": encoder.encode(pluginInfo),
};

export async function GET() {
  const zip = zipSync(FILES);
  // fflate's view is ArrayBufferLike; hand Response a plain ArrayBuffer so
  // the BodyInit types are happy without copying through Blob.
  const body = zip.buffer.slice(
    zip.byteOffset,
    zip.byteOffset + zip.byteLength,
  ) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "content-type": "application/zip",
      "content-disposition":
        'attachment; filename="SnapPublish.lrplugin.zip"',
      // Tiny static payload built from the deploy's own bundle — a short
      // browser cache is plenty; a stale zip for minutes is harmless.
      "cache-control": "public, max-age=300",
    },
  });
}

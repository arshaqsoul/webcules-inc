# Snap Publish — Lightroom Classic publish plugin

`SnapPublish.lrplugin` is a Lightroom Classic **publish service** plugin: photos
published from Lightroom land in a Snap gallery, editing a published photo marks
it "Modified" in Lightroom, and re-publishing replaces it in the gallery. It is
story 2/6 of the integrations workstream (WEB-185) and authenticates with the
scoped integration tokens shipped in v0.15.0 (WEB-186).

## What it does

- **Collections → galleries.** Each Lightroom publish collection publishes into
  the Snap gallery with the same name. The gallery is looked up by exact title
  on every publish run and created when missing (this can be turned off per
  publish service). No local cache: the mapping survives catalog moves and
  plugin reinstalls. Renaming a collection retargets it to the gallery with the
  new name.
- **Re-publish sync.** At publish time the plugin stores a deterministic
  signature of the photo's develop settings + crop + export settings — on the
  server (the `integration_publish` ledger) and in Lightroom's per-photo plugin
  metadata. Lightroom marks published photos Modified when develop settings
  change; crop and export-setting changes are caught by
  `metadataThatIsEligibleForRepublish` + `shouldRepublish`. Re-publishing
  replaces the asset bytes and refreshes the signature.
- **Unpublish.** Removing a photo from the publish collection deletes it from
  the gallery. If the photo is still live in an active client share link, the
  server refuses (409 `shared_protected`) and the plugin surfaces the error —
  removing shared photos is a studio-side decision.
- **Token auth.** The plugin stores the studio URL + an integration token
  (`snapit_…`, minted under Settings → Integrations) in Plug-in Manager, shared
  by all publish services. A "Test Connection" button calls the whoami
  endpoint. Missing scopes produce a readable error naming the scope.

Required token scopes: `galleries:read`, `galleries:write` (only if
auto-create is on), `assets:write`.

## Installing (photographers)

1. Download `SnapPublish.lrplugin.zip` from Snap → **Settings →
   Integrations** (the served zip is built from this folder; zipping it
   yourself from a repo checkout works too).
2. Lightroom Classic → File → Plug-in Manager → Add → pick `SnapPublish.zip` or
   the unzipped `.lrplugin` folder.
3. In the plugin's panel: paste your **Studio URL** and an **Integration
   token** (Snap → Settings → Integrations → mint). Click **Test Connection**.
4. Publish Services panel (left side of Library) → find **Snap Publish** →
   **Set Up**. Optionally adjust export settings (defaults: JPEG, sRGB,
   long edge 2048, quality 90).
5. Create a publish collection inside the service — its name is the Snap
   gallery it publishes to. Drag photos in and hit **Publish**.

## API surface used (all under `/api/integrations/v1`)

| Call | Verb | Scope |
| --- | --- | --- |
| `/` whoami | GET | any |
| `/galleries` list / create | GET / POST | `galleries:read` / `galleries:write` |
| `/galleries/{id}` gallery + published sync feed | GET | `galleries:read` |
| `/galleries/{id}/assets` multipart publish (upsert on external id) | POST | `assets:write` |
| `/galleries/{id}/assets/{externalId}?source=lightroom` unpublish | DELETE (POST alias) | `assets:write` |

The POST alias on the unpublish route exists because Lightroom's `LrHttp`
module cannot send DELETE.

## Files

- `Info.lua` — manifest (`LrPublishService`, `LrPluginInfoProvider`)
- `SnapPublishDefinition.lua` — the publish service: dialog, signature
  computation, `processRenderedPhotos`, `shouldRepublish`, unpublish
- `SnapPublishPluginInfo.lua` — Plug-in Manager panel (connection + test)
- `ApiClient.lua` — HTTP client for the integration API
- `JSON.lua` — self-contained JSON encode/decode (Lightroom has none)

## Maintenance notes

- Version lives in `Info.lua` (`VERSION`); keep it in lockstep with the app
  release notes (`lib/docs/content/releases.tsx`).
- The Lua targets Lightroom's embedded Lua (5.1-compatible: no bit operators,
  no `goto`); `JSON.lua`'s UTF-8 encoder is arithmetic for that reason.
- Untestable without a Lightroom install: review changes against the
  [Lightroom Classic SDK](https://opensource.adobe.com/lightroom-classic-api-docs/)
  publish-service docs, and syntax-check the Lua (`luac -p` or a 5.1 parser).

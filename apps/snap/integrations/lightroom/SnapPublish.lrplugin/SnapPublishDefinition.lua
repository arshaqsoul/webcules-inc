-- SnapPublishDefinition.lua — the LrPublishService table (WEB-185).
--
-- Model:
--   * Connection (URL + integration token) lives in app prefs, set once in
--     Plug-in Manager (SnapPublishPluginInfo).
--   * Each Lightroom publish collection maps to the Snap gallery with the
--     SAME NAME — found by exact title on every publish run, created when
--     missing (that resolve-by-name happens per run, so nothing breaks if a
--     gallery is moved, renamed server-side, or the catalog switches
--     machines). Renaming a collection therefore targets a different/new
--     gallery; that is documented behavior.
--   * Re-publish sync: the render signature (develop settings + crop +
--     export settings, hashed) is stored both in the snap publish ledger
--     (server) and in the photo's plugin metadata (client). Lightroom
--     natively marks published photos "Modified" when develop settings
--     change; shouldRepublish additionally catches crop and export-setting
--     changes via metadataThatIsEligibleForRepublish.
--   * Remote identifier format: "<galleryId>:<localCatalogId>" — deleting a
--     photo from the publish collection unpublishes it without any extra
--     lookup.
local LrDialogs = import "LrDialogs"
local LrErrors = import "LrErrors"
local LrPathUtils = import "LrPathUtils"
local LrProgressScope = import "LrProgressScope"
local LrPrefs = import "LrPrefs"
local LrView = import "LrView"

local ApiClient = require "ApiClient"

local bind = LrView.bind

local SnapPublish = {}

-- ---------------- signature ----------------

-- djb2 modulo 2^31-1 — deterministic, cheap, collisions irrelevant for
-- change detection (this is not a security boundary; the token is).
local function hash(s)
    local h = 5381
    for i = 1, #s do
        h = (h * 33 + string.byte(s, i)) % 2147483647
    end
    return string.format("%08x", h)
end

-- The part of the signature that must match for a photo to be considered
-- unchanged, independent of export settings: develop settings + crop.
local function contentSignature(photo)
    local parts = {}
    local dev = photo:getDevelopSettings() or {}
    local keys = {}
    for k in pairs(dev) do
        keys[#keys + 1] = k
    end
    table.sort(keys)
    for _, k in ipairs(keys) do
        parts[#parts + 1] = k .. "=" .. tostring(dev[k])
    end
    parts[#parts + 1] = "crop=" .. tostring(photo:getFormattedMetadata("crop") or "")
    return table.concat(parts, ";")
end

-- Full signature: content + export settings (format/quality/limits). Stored
-- at publish time so export-setting changes also invalidate.
local function renderSignature(photo, exportSettings)
    local s = contentSignature(photo)
        .. ";export="
        .. table.concat({
            tostring(exportSettings.imageFormat or ""),
            tostring(exportSettings.quality or ""),
            tostring(exportSettings.size_maxWidth or ""),
            tostring(exportSettings.size_maxHeight or ""),
        }, ",")
    return hash(s)
end

-- ---------------- service dialog ----------------

-- The service settings dialog only carries the per-service options; the
-- connection itself is app-level (Plug-in Manager) so a studio with several
-- publish services configures it exactly once.
SnapPublish.sectionsForTopOfDialog = function(f, p)
    local prefs = LrPrefs.prefsForApp("SnapPublish")
    local url = ApiClient.normalizeBaseUrl(prefs and prefs.serverUrl) or "(not configured)"
    return {
        {
            title = "Snap Gallery Options",
            rows = {
                f:row {
                    f:checkbox {
                        title = "Create the gallery when it doesn't exist yet (named after the collection)",
                        value = bind "createGalleries",
                    },
                },
                f:row {
                    f:static_text { title = "Studio: " .. url },
                },
                f:row {
                    f:static_text {
                        title = "Change the studio URL or token in Lightroom Plug-in Manager.",
                    },
                },
            },
        },
    }
end

SnapPublish.startDialog = function(propertyTable)
    if propertyTable.createGalleries == nil then
        propertyTable.createGalleries = true
    end
end

SnapPublish.exportPresetFields = {
    -- Sensible delivery defaults for gallery photos; the photographer can
    -- override per service in the normal export section of the dialog.
    { key = "imageFormat", default = "JPEG" },
    { key = "quality", default = 0.9 },
    { key = "size_resizeType", default = "longEdge" },
    { key = "size_maxWidth", default = 2048 },
    { key = "size_maxHeight", default = 2048 },
    { key = "size_doConstrain", default = true },
    { key = "colorSpace", default = "sRGB" },
}

-- ---------------- change detection (re-publish sync) ----------------

-- Crop and export-setting changes route through Lightroom's own
-- "photo needs republish" machinery; develop edits already mark published
-- photos Modified without plugin help.
SnapPublish.metadataThatIsEligibleForRepublish = { "crop", "exportSettings" }

-- Called by Lightroom when a published photo changes: answer true when our
-- stored signature no longer matches the photo's current state.
SnapPublish.shouldRepublish = function(publishSettings, photo)
    local last = photo:getPropertyForPlugin(_PLUGIN, "signature")
    if not last then
        return true -- never published through this plugin (or plugin reinstalled)
    end
    return hash(contentSignature(photo)) ~= last
end

-- ---------------- publish ----------------

SnapPublish.processRenderedPhotos = function(exportSettings, exportContext)
    local exportSession = exportContext.exportSession
    local publishSettings = exportSession.publishSettings
    local prefs = LrPrefs.prefsForApp("SnapPublish")

    -- Resolve this run's gallery: the publish collection's name is the
    -- gallery title (find-or-create), so binding survives catalog moves and
    -- plugin reinstalls without local cache files.
    local collection = exportSession:getPublishedCollection()
    local title = (collection and collection:getName()) or "Lightroom Publish"
    local resolved = ApiClient.resolveGallery(prefs, title, publishSettings.createGalleries ~= false)
    if not resolved.ok then
        LrDialogs.showError(string.format("Snap Publish could not resolve gallery “%s”:\n%s", title, tostring(resolved.message)))
        LrErrors:throwCancel()
        return
    end
    local galleryId = resolved.gallery.id

    local total = exportSession:countRenditions()
    local progress = LrProgressScope {
        title = string.format("Publishing %d photo(s) to Snap · %s", total, title),
        functionContext = exportContext,
    }
    progress:setPortionComplete(0, total)

    local done = 0
    for rendition in exportContext:renderRenditions() do
        if not rendition.wasSkipped then
            local photo = rendition.photo
            local externalId = tostring(photo.localIdentifier)
            local signature = renderSignature(photo, exportSettings)

            -- The uploaded filename/mime must describe the RENDERED file, not
            -- the catalog original: in a RAW-first workflow the original is
            -- "DSC_01234.NEF" while the rendition is a JPEG, and the server
            -- classifies asset kind by filename extension — so the original
            -- catalog name would land every photo in the RAW vault. The
            -- rendition's destination path already carries the export
            -- format's extension; the mime follows imageFormat.
            local renderedName = LrPathUtils.leafName(tostring(rendition.destinationPath))
            local mimeByFormat = { JPEG = "image/jpeg", PNG = "image/png", TIFF = "image/tiff" }
            local mimeType = (exportSettings and mimeByFormat[exportSettings.imageFormat]) or "image/jpeg"

            local result = ApiClient.publishPhoto(prefs, galleryId, {
                filePath = rendition.destinationPath,
                fileName = (renderedName ~= "" and renderedName) or ("photo-" .. externalId .. ".jpg"),
                mimeType = mimeType,
                externalId = externalId,
                signature = signature,
            })

            if result.ok then
                -- Remote identifier doubles as the unpublish address.
                photo:setRemoteIdentifier(galleryId .. ":" .. externalId)
                photo:setPropertyForPlugin(_PLUGIN, "signature", hash(contentSignature(photo)))
            else
                rendition:uploadFailed(tostring(result.message))
            end
        end
        done = done + 1
        progress:setPortionComplete(done, total)
    end

    progress:done()
end

-- Called when photos are removed from the publish collection: unpublish
-- each on the server. photoIds are the remote identifiers we stored at
-- publish time ("<galleryId>:<externalId>").
SnapPublish.deletePhotosFromPublishedCollection = function(publishSettings, arrayOfPhotoIds, deletedCallback, failureCallback)
    local prefs = LrPrefs.prefsForApp("SnapPublish")

    for _, remoteId in ipairs(arrayOfPhotoIds) do
        local galleryId, externalId = tostring(remoteId):match("^([^:]+):(.+)$")
        if not galleryId then
            failureCallback({ remoteId }, "unrecognized remote identifier (re-publish the photo, then remove it again)")
        else
            local result = ApiClient.unpublishPhoto(prefs, galleryId, externalId)
            if result.ok then
                deletedCallback({ remoteId })
            else
                -- 409 shared_protected: the photo is live in a client
                -- gallery; removing it is a studio decision, so surface it.
                failureCallback({ remoteId }, tostring(result.message))
            end
        end
    end
end

-- Snap galleries have no public comment surface in v1.
SnapPublish.canAddComments = false

return SnapPublish

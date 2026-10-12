-- ApiClient.lua — thin HTTP client for snap's integration API
-- (/api/integrations/v1), shared by the Plugin Manager connection test and
-- the publish service. All calls are synchronous (they run inside Lightroom
-- tasks) and return result tables instead of throwing:
--
--   { ok = true, ...payload }          on HTTP 200/201
--   { ok = false, status = n, message = "human readable" }
--
-- Authentication is the scoped integration token minted in the studio's
-- Settings → Integrations page (WEB-186); it travels as a Bearer header.
local LrHttp = import "LrHttp"

local JSON = require "JSON"

local ApiClient = {}

local API_PATH = "/api/integrations/v1"

-- The user pastes their studio URL (e.g. https://photos.example.com).
-- Normalize: default https:// when no scheme is present, strip trailing
-- slashes so path joins stay predictable.
function ApiClient.normalizeBaseUrl(raw)
    if not raw then return nil end
    local url = raw:gsub("^%s+", ""):gsub("%s+$", ""):gsub("/+$", "")
    if url == "" then return nil end
    if not url:find("^https?://") then
        url = "https://" .. url
    end
    return url
end

function ApiClient.apiUrl(prefs, path)
    local base = ApiClient.normalizeBaseUrl(prefs and prefs.serverUrl)
    if not base then
        return nil, "No studio URL set — open Plug-in Manager and configure Snap Publish."
    end
    if not (prefs and prefs.token) or prefs.token == "" then
        return nil, "No integration token set — create one in Settings → Integrations, then paste it in Plug-in Manager."
    end
    return base .. API_PATH .. path, nil
end

local function authHeaders(prefs)
    return {
        { field = "Authorization", value = "Bearer " .. tostring(prefs.token) },
        { field = "Accept", value = "application/json" },
    }
end

-- Decode a JSON body defensively; nil + message on anything unexpected.
local function decodeBody(body)
    if type(body) ~= "string" or body == "" then return nil end
    local ok, v = pcall(JSON.decode, body)
    if ok then return v end
    return nil
end

local function fail(status, body, fallback)
    local decoded = decodeBody(body)
    local apiError = decoded and decoded.error
    local message = fallback or "request failed"
    if apiError then
        message = string.format("%s (%s)", apiError, status)
        if decoded.scope then
            message = message .. " — token is missing scope: " .. tostring(decoded.scope)
        end
    end
    return { ok = false, status = status, message = message }
end

-- GET helper: LrHttp.get returns (body, responseHeaders).
local function get(prefs, path)
    local url, err = ApiClient.apiUrl(prefs, path)
    if not url then return { ok = false, message = err } end
    local body, hdrs = LrHttp.get(url, authHeaders(prefs))
    local status = hdrs and hdrs.status or 0
    if status == 200 then
        local decoded = decodeBody(body)
        if decoded then return { ok = true, body = decoded } end
        return fail(status, body, "unparseable response")
    end
    return fail(status, body, "GET " .. path .. " failed")
end

-- JSON POST helper.
local function postJson(prefs, path, payload)
    local url, err = ApiClient.apiUrl(prefs, path)
    if not url then return { ok = false, message = err } end
    local headers = authHeaders(prefs)
    headers[#headers + 1] = { field = "Content-Type", value = "application/json" }
    local body, hdrs = LrHttp.post(url, JSON.encode(payload), headers)
    local status = hdrs and hdrs.status or 0
    if status == 200 or status == 201 then
        local decoded = decodeBody(body)
        if decoded then return { ok = true, body = decoded } end
        return fail(status, body, "unparseable response")
    end
    return fail(status, body, "POST " .. path .. " failed")
end

-- ---- endpoint wrappers ----

-- GET / — token validity + org name + granted scopes.
function ApiClient.whoami(prefs)
    local r = get(prefs, "")
    if not r.ok then return r end
    local b = r.body or {}
    return {
        ok = true,
        organizationName = b.organization and b.organization.name,
        tokenName = b.token and b.token.name,
        scopes = b.token and b.token.scopes or {},
    }
end

-- GET /galleries — id/title list.
function ApiClient.listGalleries(prefs)
    local r = get(prefs, "/galleries")
    if not r.ok then return r end
    return { ok = true, galleries = (r.body or {}).galleries or {} }
end

-- POST /galleries — create one, return its view table.
function ApiClient.createGallery(prefs, title)
    local r = postJson(prefs, "/galleries", { title = title })
    if not r.ok then return r end
    local gallery = (r.body or {}).gallery
    if not gallery then
        return { ok = false, message = "server created a gallery but returned none" }
    end
    return { ok = true, gallery = gallery }
end

-- GET /galleries/{id}?source=lightroom — gallery + published sync feed.
function ApiClient.gallery(prefs, galleryId)
    local r = get(prefs, string.format("/galleries/%s?source=lightroom", galleryId))
    if not r.ok then return r end
    local b = r.body or {}
    return { ok = true, gallery = b.gallery, published = b.published or {} }
end

-- Find a gallery by exact title; optionally create it when missing.
-- This is the publish-collection → gallery binding: the collection name IS
-- the gallery title (see SnapPublishDefinition for the rationale).
function ApiClient.resolveGallery(prefs, title, allowCreate)
    local r = ApiClient.listGalleries(prefs)
    if not r.ok then return r end
    for _, g in ipairs(r.galleries) do
        if g.title == title then
            return { ok = true, gallery = g, created = false }
        end
    end
    if not allowCreate then
        return { ok = false, message = string.format("No Snap gallery named “%s” (auto-create is off in the publish settings).", title) }
    end
    local created = ApiClient.createGallery(prefs, title)
    if not created.ok then return created end
    return { ok = true, gallery = created.gallery, created = true }
end

-- POST /galleries/{id}/assets (multipart — LrHttp cannot PUT, and the
-- presigned browser pipeline is browser-only, so the API accepts multipart).
-- params: filePath, fileName, mimeType, externalId, signature.
function ApiClient.publishPhoto(prefs, galleryId, params)
    local url, err = ApiClient.apiUrl(prefs, string.format("/galleries/%s/assets", galleryId))
    if not url then return { ok = false, message = err } end
    local payload = {
        chunks = {
            { name = "source", value = "lightroom" },
            { name = "external_id", value = tostring(params.externalId) },
            { name = "signature", value = tostring(params.signature) },
            {
                name = "file",
                filePath = params.filePath,
                fileName = params.fileName,
                mimeType = params.mimeType or "image/jpeg",
            },
        },
    }
    local body, hdrs = LrHttp.post(url, payload, authHeaders(prefs))
    local status = hdrs and hdrs.status or 0
    if status == 200 or status == 201 then
        local decoded = decodeBody(body)
        if decoded and decoded.assetId then
            return { ok = true, created = decoded.created, assetId = decoded.assetId }
        end
        return fail(status, body, "upload accepted but response was unparseable")
    end
    return fail(status, body, "publish failed")
end

-- DELETE /galleries/{id}/assets/{externalId}?source=lightroom
-- (also exposed as POST — Lightroom's LrHttp has no DELETE verb, so the API
-- accepts POST on the same path as an alias; see the route's POST export)
function ApiClient.unpublishPhoto(prefs, galleryId, externalId)
    local url, err = ApiClient.apiUrl(
        prefs,
        string.format("/galleries/%s/assets/%s?source=lightroom", galleryId, externalId)
    )
    if not url then return { ok = false, message = err } end
    local body, hdrs = LrHttp.post(url, "", authHeaders(prefs))
    local status = hdrs and hdrs.status or 0
    if status == 200 then
        return { ok = true }
    end
    return fail(status, body, "unpublish failed")
end

return ApiClient

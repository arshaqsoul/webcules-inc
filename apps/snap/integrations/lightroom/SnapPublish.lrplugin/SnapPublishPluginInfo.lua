-- SnapPublishPluginInfo.lua — Plug-in Manager panel (WEB-185).
--
-- Connection settings are APP-level (shared by every publish service
-- instance): the studio URL and the integration token from Settings →
-- Integrations. A Test Connection button hits the whoami endpoint so the
-- photographer sees "Connected to <studio>" before ever publishing.
local LrPrefs = import "LrPrefs"
local LrTasks = import "LrTasks"
local LrView = import "LrView"

local ApiClient = require "ApiClient"

local bind = LrView.bind
local share = LrView.share

local SnapPublishPluginInfo = {}

function SnapPublishPluginInfo.startDialog(props)
    local prefs = LrPrefs.prefsForApp("SnapPublish")
    props.serverUrl = prefs.serverUrl or ""
    props.token = prefs.token or ""
    props.connectionStatus = ""
end

function SnapPublishPluginInfo.endDialog(props)
    local prefs = LrPrefs.prefsForApp("SnapPublish")
    prefs.serverUrl = props.serverUrl or ""
    prefs.token = props.token or ""
end

function SnapPublishPluginInfo.sectionsForTopOfDialog(f, props)
    return {
        {
            title = "Snap Studio Connection",
            spacing = f:control_spacing(),
            rows = {
                f:row {
                    spacing = f:control_spacing(),
                    f:static_text {
                        title = "Studio URL",
                        alignment = "right",
                        width = share "labelWidth",
                    },
                    f:edit_field {
                        value = bind "serverUrl",
                        immediate = true,
                        width_in_chars = 40,
                        placeholder_text = "https://your-snap-studio.com",
                        tooltip = "Where your Snap studio is hosted — no trailing path.",
                    },
                },
                f:row {
                    spacing = f:control_spacing(),
                    f:static_text {
                        title = "Integration token",
                        alignment = "right",
                        width = share "labelWidth",
                    },
                    f:edit_field {
                        value = bind "token",
                        immediate = true,
                        width_in_chars = 40,
                        tooltip = "Settings → Integrations → mint a token (snapit_…). It is shown exactly once.",
                    },
                },
                f:row {
                    spacing = f:control_spacing(),
                    f:push_button {
                        title = "Test Connection",
                        action = function()
                            props.connectionStatus = "Checking…"
                            LrTasks.startAsyncTask(function()
                                local r = ApiClient.whoami(props)
                                if r.ok then
                                    props.connectionStatus = string.format(
                                        "Connected to %s (token “%s”)",
                                        tostring(r.organizationName or "your studio"),
                                        tostring(r.tokenName or "integration token")
                                    )
                                else
                                    props.connectionStatus = "Failed: " .. tostring(r.message)
                                end
                            end)
                        end,
                    },
                    f:static_text { title = bind "connectionStatus" },
                },
            },
        },
        {
            title = "How publishing works",
            rows = {
                f:column {
                    spacing = 4,
                    f:static_text {
                        title = "Each Lightroom publish collection publishes into the Snap gallery of the same name —",
                        wrap = true,
                    },
                    f:static_text {
                        title = "a missing gallery is created on first publish. Editing a published photo marks it",
                        wrap = true,
                    },
                    f:static_text {
                        title = "“Modified” in Lightroom; re-publishing replaces the photo in the gallery.",
                        wrap = true,
                    },
                },
            },
        },
    }
end

return SnapPublishPluginInfo

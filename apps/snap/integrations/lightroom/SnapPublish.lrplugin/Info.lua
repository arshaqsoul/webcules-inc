-- Info.lua — plugin manifest for Snap Publish (WEB-185, Integrations 2/6).
-- Lightroom Classic reads this when loading the .lrplugin bundle from
-- Plug-in Manager. LrToolkitVersion 3 is the floor: publish services,
-- LrPublishedPhoto and the re-publish metadata hooks all arrived with SDK 3,
-- and every Classic release since still accepts it.
return {
    LrToolkitVersion = 3,
    LrPluginInfoProvider = "SnapPublishPluginInfo",
    LrPublishService = "SnapPublishDefinition",

    NAME = "Snap Publish",
    VERSION = { major = 0, minor = 16, revision = 0 },
    AUTHOR = "Webcules Inc.",
    URL = "https://webcules.com",

    -- Shown in Plug-in Manager below the plugin's sections.
    LrPluginInfoUrl = "",
}

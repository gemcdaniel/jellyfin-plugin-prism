using Jellyfin.Plugin.Prism.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.Prism;

/// <summary>
/// Main entry point for the Prism Jellyfin plugin.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public static Plugin? Instance { get; private set; }

    public override Guid Id => Guid.Parse("d8a4b2e1-7c3f-4e92-9b14-6f2c8d5a1e03");

    public override string Name => "Prism";

    public override string Description =>
        "True-black OLED UI, ClearLogo spotlights, 3-day rotating discovery & holiday picks, thematic collections, native watchlist, library infinite scroll, and LG WebOS 60fps guardrails.";

    public IEnumerable<PluginPageInfo> GetPages()
    {
        return new[]
        {
            new PluginPageInfo
            {
                Name = "PrismConfig",
                DisplayName = "Prism",
                EmbeddedResourcePath = $"{GetType().Namespace}.Configuration.configPage.html"
            }
        };
    }
}

using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.Prism.Configuration;

/// <summary>
/// Configuration options for the Prism Jellyfin plugin.
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    public bool EnablePlugin { get; set; } = true;

    public bool EnableThemeCss { get; set; } = true;

    public bool ThemeDashboard { get; set; } = true;

    public bool EnableTvGuideScrollFix { get; set; } = true;

    public bool EnableHeroSpotlight { get; set; } = true;

    public bool EnableDetailBackdrop { get; set; } = true;

    public bool EnableDynamicAmbientColor { get; set; } = true;

    public bool EnableMediaBadges { get; set; } = true;

    public bool EnableHomeSections { get; set; } = true;

    public bool EnableHolidayRow { get; set; } = true;

    public bool Enable4kShowcase { get; set; } = true;

    public bool EnableCriticallyAcclaimed { get; set; } = true;

    public bool EnableQuickWatches { get; set; } = true;

    public bool EnableSpotlightGenre { get; set; } = true;

    public int MaxItemsPerRow { get; set; } = 16;

    public bool SyncHolidayCollection { get; set; } = false;

    public string HolidayCollectionName { get; set; } = "Seasonal & Holiday Picks";

    public string TmdbApiKey { get; set; } = string.Empty;

    public int NewReleasesDays { get; set; } = 45;

    public int NewReleasesEpisodesDays { get; set; } = 14;

    public bool EnableInfiniteDiscovery { get; set; } = true;

    public bool EnableWatchlist { get; set; } = true;

    public bool EnableLibraryInfiniteScroll { get; set; } = true;

    public bool EnableDesktopHamburger { get; set; } = true;
}

using Jellyfin.Plugin.Prism.Api;
using Jellyfin.Plugin.Prism.Configuration;
using Jellyfin.Plugin.Prism.Services;
using Xunit;

namespace Jellyfin.Plugin.Prism.Tests;

public class TmdbSnapshotAndConfigTests
{
    [Fact]
    public void TmdbSnapshot_EmptyHasNoDataAndPreservesFirstRankForDuplicates()
    {
        Assert.False(TmdbSnapshot.Empty.HasAnyData);

        var data = new TmdbCacheData
        {
            TrendingMovieIds = new List<int> { 101, 202, 101, 303 },
            ThemeMovies = new Dictionary<string, List<int>>(StringComparer.OrdinalIgnoreCase)
            {
                ["time-travel"] = new List<int> { 105, 603, 105 }
            }
        };

        var snapshot = new TmdbSnapshot(data);
        Assert.True(snapshot.HasAnyData);
        Assert.Equal(0, snapshot.TrendingMovieRank[101]);
        Assert.Equal(1, snapshot.TrendingMovieRank[202]);
        Assert.Equal(3, snapshot.TrendingMovieRank[303]);
        Assert.Contains(105, snapshot.ThemeMovieSets["TIME-TRAVEL"]);
        Assert.Contains(603, snapshot.ThemeMovieSets["time-travel"]);
        Assert.Equal(2, snapshot.ThemeMovieSets["time-travel"].Count);
    }

    [Fact]
    public void PluginConfiguration_HasExpectedSafeDefaults()
    {
        var cfg = new PluginConfiguration();

        Assert.True(cfg.EnablePlugin);
        Assert.True(cfg.EnableThemeCss);
        Assert.True(cfg.ThemeDashboard);
        Assert.True(cfg.EnableDesktopHamburger);
        Assert.True(cfg.EnableInfiniteDiscovery);
        Assert.True(cfg.EnableWatchlist);
        Assert.True(cfg.EnableLibraryInfiniteScroll);
        Assert.Equal(16, cfg.MaxItemsPerRow);
        Assert.Equal(45, cfg.NewReleasesDays);
        Assert.Equal(14, cfg.NewReleasesEpisodesDays);
        Assert.Equal(string.Empty, cfg.TmdbApiKey);
    }

    [Fact]
    public void PrismClientConfigDto_NeverExposesRawTmdbApiKeyProperty()
    {
        var props = typeof(PrismClientConfigDto).GetProperties().Select(p => p.Name).ToList();

        Assert.Contains(nameof(PrismClientConfigDto.HasTmdbApiKey), props);
        Assert.DoesNotContain("TmdbApiKey", props, StringComparer.OrdinalIgnoreCase);
    }
}

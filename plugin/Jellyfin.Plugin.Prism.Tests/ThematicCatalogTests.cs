using System.Text.RegularExpressions;
using Jellyfin.Plugin.Prism.Services;
using Xunit;

namespace Jellyfin.Plugin.Prism.Tests;

public class ThematicCatalogTests
{
    [Fact]
    public void GetAll_HasTwentyEightUniqueWellFormedThemes()
    {
        var all = ThematicCatalog.GetAll();
        Assert.Equal(28, all.Count);

        var uniqueIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var hexRegex = new Regex("^#[0-9A-Fa-f]{6}$");

        foreach (var theme in all)
        {
            Assert.False(string.IsNullOrWhiteSpace(theme.Id));
            Assert.True(uniqueIds.Add(theme.Id), $"Duplicate theme id: {theme.Id}");
            Assert.False(string.IsNullOrWhiteSpace(theme.Group));
            Assert.False(string.IsNullOrWhiteSpace(theme.Name));
            Assert.Matches(hexRegex, theme.AccentHex);
            Assert.NotEmpty(theme.Tags);
            Assert.NotEmpty(theme.PreferredGenres);
        }
    }

    [Fact]
    public void GetById_MatchesCaseInsensitivelyAndHandlesNullOrMissing()
    {
        Assert.Null(ThematicCatalog.GetById(null));
        Assert.Null(ThematicCatalog.GetById("   "));
        Assert.Null(ThematicCatalog.GetById("non-existent-theme"));

        var theme = ThematicCatalog.GetById("TIME-TRAVEL");
        Assert.NotNull(theme);
        Assert.Equal("time-travel", theme!.Id);
    }

    [Fact]
    public void ScoreMetadata_EnforcesPreferredGenreGateOnOverviewOnlyMatches()
    {
        var timeTravel = ThematicCatalog.GetById("time-travel");
        Assert.NotNull(timeTravel);

        // Overview match WITHOUT a preferred genre -> rejected (prevents noisy mismatches)
        var nonPreferredGenreScore = ThematicCatalog.ScoreMetadata(
            "Ordinary Kitchen",
            "A chef deals with a paradox in dinner service.",
            Array.Empty<string>(),
            new[] { "Documentary" },
            8.0f,
            timeTravel!,
            tmdbConfirmed: false);
        Assert.Equal(0, nonPreferredGenreScore);

        // Overview match WITH a preferred genre -> accepted
        var preferredGenreScore = ThematicCatalog.ScoreMetadata(
            "Temporal Echo",
            "An engineer gets caught in a time loop every morning.",
            Array.Empty<string>(),
            new[] { "Science Fiction", "Mystery" },
            7.8f,
            timeTravel!,
            tmdbConfirmed: false);
        Assert.True(preferredGenreScore > 0);

        // Exact tag or TMDB confirmation scores higher than overview-only match
        var tagScore = ThematicCatalog.ScoreMetadata(
            "Looper",
            "Hitmen in 2044.",
            new[] { "time travel" },
            new[] { "Action" },
            7.4f,
            timeTravel!,
            tmdbConfirmed: true);
        Assert.True(tagScore > preferredGenreScore);
    }
}

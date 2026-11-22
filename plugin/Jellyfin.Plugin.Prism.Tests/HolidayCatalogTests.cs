using Jellyfin.Plugin.Prism.Services;
using Xunit;

namespace Jellyfin.Plugin.Prism.Tests;

public class HolidayCatalogTests
{
    [Theory]
    [InlineData(2026, 1, 5, "new-year-winter")]
    [InlineData(2026, 12, 30, "new-year-winter")]
    [InlineData(2026, 1, 25, "awards-season")]
    [InlineData(2026, 2, 14, "valentines")]
    [InlineData(2026, 3, 17, "st-patricks")]
    [InlineData(2026, 4, 15, "spring-adventures")]
    [InlineData(2026, 5, 4, "scifi-may4")]
    [InlineData(2026, 6, 10, "summer-blockbusters")]
    [InlineData(2026, 7, 4, "independence-day")]
    [InlineData(2026, 9, 15, "back-to-school")]
    [InlineData(2026, 10, 31, "halloween")]
    [InlineData(2026, 11, 24, "thanksgiving-autumn")]
    [InlineData(2026, 12, 24, "holiday-christmas")]
    public void GetActiveWindows_ReturnsExpectedWindowForDateIncludingYearWrap(int year, int month, int day, string expectedId)
    {
        var active = HolidayCatalog.GetActiveWindows(new DateTime(year, month, day));

        Assert.NotEmpty(active);
        Assert.True(active.Count <= 2);
        Assert.Contains(active, w => w.Id == expectedId);
    }

    [Fact]
    public void GetActiveWindows_OrdersMoreSpecificHolidayAheadOfBroadSeason()
    {
        // May 4 overlaps scifi-may4 (7 days) and spring-adventures (~60 days)
        var may4 = HolidayCatalog.GetActiveWindows(new DateTime(2026, 5, 4));
        Assert.Equal(2, may4.Count);
        Assert.Equal("scifi-may4", may4[0].Id);
        Assert.Equal("spring-adventures", may4[1].Id);

        // Feb 14 overlaps valentines (16 days) and awards-season (~54 days)
        var feb14 = HolidayCatalog.GetActiveWindows(new DateTime(2026, 2, 14));
        Assert.Equal(2, feb14.Count);
        Assert.Equal("valentines", feb14[0].Id);
        Assert.Equal("awards-season", feb14[1].Id);
    }

    [Fact]
    public void ScoreMetadata_RequiresStrongHitWhenConfiguredAndScoresTmdbAndTagsHighest()
    {
        var halloween = HolidayCatalog.GetWindowById("halloween");
        Assert.NotNull(halloween);

        var genreOnlyScore = HolidayCatalog.ScoreMetadata(
            "Quiet Corridor",
            "An ordinary evening drama with no seasonal hints.",
            Array.Empty<string>(),
            new[] { "Horror", "Thriller" },
            7.8f,
            halloween!,
            tmdbConfirmed: false);
        Assert.Equal(0, genreOnlyScore);

        var tagScore = HolidayCatalog.ScoreMetadata(
            "Autumn Night",
            "Friends gather.",
            new[] { "halloween" },
            new[] { "Horror" },
            7.5f,
            halloween!,
            tmdbConfirmed: false);
        Assert.True(tagScore > 50);

        var tmdbScore = HolidayCatalog.ScoreMetadata(
            "Trick 'r Treat",
            "An anthology set in October.",
            Array.Empty<string>(),
            new[] { "Horror" },
            7.4f,
            halloween!,
            tmdbConfirmed: true);
        Assert.True(tmdbScore >= 60);
    }

    [Fact]
    public void ScoreMetadata_UsesHighRatedFallbackForAwardsSeasonOnly()
    {
        var awards = HolidayCatalog.GetWindowById("awards-season");
        Assert.NotNull(awards);

        var acclaimedDrama = HolidayCatalog.ScoreMetadata(
            "Quiet Portrait",
            "A character study without awards keywords.",
            Array.Empty<string>(),
            new[] { "Drama" },
            8.3f,
            awards!,
            tmdbConfirmed: false);
        Assert.True(acclaimedDrama > 0);

        var lowerRatedDrama = HolidayCatalog.ScoreMetadata(
            "Quiet Portrait",
            "A character study without awards keywords.",
            Array.Empty<string>(),
            new[] { "Drama" },
            6.9f,
            awards!,
            tmdbConfirmed: false);
        Assert.Equal(0, lowerRatedDrama);
    }
}

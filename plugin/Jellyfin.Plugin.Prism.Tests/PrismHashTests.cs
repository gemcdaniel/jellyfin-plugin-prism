using Jellyfin.Plugin.Prism.Services;
using Xunit;

namespace Jellyfin.Plugin.Prism.Tests;

public class PrismHashTests
{
    [Fact]
    public void GetRotationBucket_StaysConstantWithinThreeDayWindowAndAdvancesAfterThreeDays()
    {
        var day0 = new DateTime(2026, 3, 2, 10, 0, 0, DateTimeKind.Local);
        var b0 = PrismHash.GetRotationBucket(day0);

        // Compute offset inside current 3-day bucket (DayNumber % 3)
        var dayOffsetInBucket = DateOnly.FromDateTime(day0).DayNumber % 3;
        var bucketStart = day0.AddDays(-dayOffsetInBucket);

        var startBucket = PrismHash.GetRotationBucket(bucketStart);
        Assert.Equal(startBucket, PrismHash.GetRotationBucket(bucketStart.AddDays(1)));
        Assert.Equal(startBucket, PrismHash.GetRotationBucket(bucketStart.AddDays(2).AddHours(11)));
        Assert.Equal(startBucket + 1, PrismHash.GetRotationBucket(bucketStart.AddDays(3)));
        Assert.Equal(b0, PrismHash.GetRotationBucket(day0));
    }

    [Fact]
    public void StableHash_Guid_IsDeterministicAndDiffersBySeed()
    {
        var id = Guid.Parse("a1b2c3d4-e5f6-4789-9012-abcdef123456");

        var first = PrismHash.StableHash(id, 42);
        var second = PrismHash.StableHash(id, 42);
        var otherSeed = PrismHash.StableHash(id, 43);

        Assert.Equal(first, second);
        Assert.NotEqual(first, otherSeed);
    }

    [Fact]
    public void StableHash_String_HandlesEmptyShortAndLongValuesDeterministically()
    {
        var emptyA = PrismHash.StableHash(string.Empty, 7);
        var emptyB = PrismHash.StableHash(string.Empty, 7);
        Assert.Equal(emptyA, emptyB);

        var shortA = PrismHash.StableHash("sci-fi-classics", 99);
        var shortB = PrismHash.StableHash("sci-fi-classics", 99);
        var shortOther = PrismHash.StableHash("sci-fi-classics", 100);
        Assert.Equal(shortA, shortB);
        Assert.NotEqual(shortA, shortOther);

        // Exercise heap fallback (>512 UTF-8 bytes)
        var longString = new string('x', 700);
        var longA = PrismHash.StableHash(longString, 12);
        var longB = PrismHash.StableHash(longString, 12);
        Assert.Equal(longA, longB);
        Assert.NotEqual(longA, PrismHash.StableHash(longString + "y", 12));
    }

    [Theory]
    [InlineData("Based on a True Story", "true story", true)]
    [InlineData("A winter tale for everyone", "winter", true)]
    [InlineData("Time-travel paradoxes", "time", true)]
    [InlineData("Christmas in New York", "CHRISTMAS", true)]
    [InlineData("The Interview", "winter", false)]
    [InlineData("Showcase reel", "car", false)]
    [InlineData("Catamaran", "cat", false)]
    [InlineData("", "holiday", false)]
    [InlineData("Holiday", "", false)]
    public void ContainsWholePhrase_MatchesWordBoundariesCaseInsensitively(string text, string phrase, bool expected)
    {
        Assert.Equal(expected, PrismHash.ContainsWholePhrase(text, phrase));
    }
}

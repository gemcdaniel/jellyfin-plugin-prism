using MediaBrowser.Controller.Entities;

namespace Jellyfin.Plugin.Prism.Services;

/// <summary>
/// Calendar-aware holiday and seasonal window catalog with keyword, tag, genre, episode, and TMDB scoring.
/// </summary>
public static class HolidayCatalog
{
    public sealed record HolidayWindow(
        string Id,
        string Title,
        string Subtitle,
        int StartMonth,
        int StartDay,
        int EndMonth,
        int EndDay,
        string[] Keywords,
        string[] Genres,
        string[] BoostTags,
        bool RequireKeywordMatch,
        int[] TmdbKeywordIds,
        string[] EpisodeKeywords,
        bool IncludeEpisodes,
        float? HighRatedFallbackThreshold = null);

    private static readonly IReadOnlyList<HolidayWindow> Windows = new[]
    {
        new HolidayWindow(
            Id: "new-year-winter",
            Title: "New Year & Winter Escapes",
            Subtitle: "Cozy winter favorites, snowstorms, and fresh starts",
            StartMonth: 12, StartDay: 27,
            EndMonth: 1, EndDay: 15,
            Keywords: new[] { "new year", "new years", "new year's", "winter", "snow", "blizzard", "arctic", "alpine", "ice", "mountain", "cabin", "ski", "freeze", "midnight" },
            Genres: new[] { "Adventure", "Drama", "Family", "Comedy" },
            BoostTags: new[] { "new year", "winter", "holiday" },
            RequireKeywordMatch: true,
            TmdbKeywordIds: new[] { 613, 3588, 179431 },
            EpisodeKeywords: new[] { "new year", "new years", "new year's", "midnight", "resolution", "winter", "blizzard", "snow" },
            IncludeEpisodes: true),

        new HolidayWindow(
            Id: "awards-season",
            Title: "Awards Season & Prestige Cinema",
            Subtitle: "Acclaimed dramas, biopics, and unforgettable performances",
            StartMonth: 1, StartDay: 16,
            EndMonth: 3, EndDay: 10,
            Keywords: new[] { "oscar", "academy award", "golden globe", "bafta", "cannes", "palme d'or", "sundance", "pulitzer", "biopic", "true story" },
            Genres: new[] { "Drama", "Biography", "History" },
            BoostTags: new[] { "oscar", "academy award", "award winner", "based on a true story", "biography" },
            RequireKeywordMatch: true,
            TmdbKeywordIds: new[] { 9672, 18035 },
            EpisodeKeywords: Array.Empty<string>(),
            IncludeEpisodes: false,
            HighRatedFallbackThreshold: 8.0f),

        new HolidayWindow(
            Id: "valentines",
            Title: "Valentine's & Date Night",
            Subtitle: "Romance, charm, and unforgettable love stories",
            StartMonth: 2, StartDay: 1,
            EndMonth: 2, EndDay: 16,
            Keywords: new[] { "valentine", "valentines", "valentine's", "love", "romance", "romantic", "heart", "wedding", "bride", "groom", "paris", "date", "proposal", "passion" },
            Genres: new[] { "Romance", "Comedy", "Drama" },
            BoostTags: new[] { "valentine", "valentines", "romance", "date night" },
            RequireKeywordMatch: true,
            TmdbKeywordIds: new[] { 160404, 9840, 9673 },
            EpisodeKeywords: new[] { "valentine", "valentines", "valentine's", "cupid", "date night", "romance" },
            IncludeEpisodes: true),

        new HolidayWindow(
            Id: "st-patricks",
            Title: "St. Patrick's & Irish Cinema",
            Subtitle: "Stories from the Emerald Isle and lucky classics",
            StartMonth: 3, StartDay: 1,
            EndMonth: 3, EndDay: 20,
            Keywords: new[] { "irish", "ireland", "dublin", "belfast", "celtic", "clover", "shamrock", "patrick", "leprechaun", "emerald", "luck" },
            Genres: new[] { "Drama", "Comedy", "Crime", "Music" },
            BoostTags: new[] { "irish", "ireland", "st patrick", "st. patrick" },
            RequireKeywordMatch: true,
            TmdbKeywordIds: new[] { 1252, 207883 },
            EpisodeKeywords: Array.Empty<string>(),
            IncludeEpisodes: false),

        new HolidayWindow(
            Id: "spring-adventures",
            Title: "Spring & Family Adventures",
            Subtitle: "Bright journeys, animation, and uplifting favorites",
            StartMonth: 3, StartDay: 21,
            EndMonth: 5, EndDay: 19,
            Keywords: new[] { "spring", "easter", "bloom", "garden", "island", "journey", "quest", "discovery", "nature", "magic" },
            Genres: new[] { "Family", "Animation", "Adventure", "Fantasy" },
            BoostTags: new[] { "spring", "easter", "family" },
            RequireKeywordMatch: false,
            TmdbKeywordIds: new[] { 1701, 4344, 15162 },
            EpisodeKeywords: Array.Empty<string>(),
            IncludeEpisodes: false),

        new HolidayWindow(
            Id: "scifi-may4",
            Title: "Galactic & Sci-Fi Celebration",
            Subtitle: "Space operas, starships, and far-off galaxies",
            StartMonth: 5, StartDay: 1,
            EndMonth: 5, EndDay: 7,
            Keywords: new[] { "space", "galaxy", "starship", "spacecraft", "force", "rebellion", "empire", "lightsaber", "sci-fi", "planet", "interstellar", "cosmos" },
            Genres: new[] { "Science Fiction", "Sci-Fi", "Adventure", "Action" },
            BoostTags: new[] { "space", "space opera", "star wars", "spaceship", "galaxy" },
            RequireKeywordMatch: true,
            TmdbKeywordIds: new[] { 9882, 161176, 3801 },
            EpisodeKeywords: Array.Empty<string>(),
            IncludeEpisodes: false),

        new HolidayWindow(
            Id: "summer-blockbusters",
            Title: "Summer Blockbusters",
            Subtitle: "Big-screen action, thrills, and crowd-pleasers",
            StartMonth: 5, StartDay: 20,
            EndMonth: 9, EndDay: 7,
            Keywords: new[] { "summer", "beach", "ocean", "vacation", "road trip", "heist", "expedition", "mission", "galaxy", "shark" },
            Genres: new[] { "Action", "Adventure", "Science Fiction", "Thriller" },
            BoostTags: new[] { "summer", "blockbuster" },
            RequireKeywordMatch: false,
            TmdbKeywordIds: new[] { 13088, 10051, 9748 },
            EpisodeKeywords: Array.Empty<string>(),
            IncludeEpisodes: false),

        new HolidayWindow(
            Id: "independence-day",
            Title: "Summer Thrills & Independence Day",
            Subtitle: "Fireworks, high-stakes rescues, and summer spectacles",
            StartMonth: 6, StartDay: 28,
            EndMonth: 7, EndDay: 7,
            Keywords: new[] { "independence", "fourth of july", "4th of july", "july", "fireworks", "president", "white house", "patriot", "revolution", "liberty" },
            Genres: new[] { "Action", "History", "Drama", "Thriller" },
            BoostTags: new[] { "independence day", "fourth of july", "4th of july" },
            RequireKeywordMatch: true,
            TmdbKeywordIds: new[] { 282, 4129, 10726 },
            EpisodeKeywords: Array.Empty<string>(),
            IncludeEpisodes: false),

        new HolidayWindow(
            Id: "back-to-school",
            Title: "Back to School & Campus",
            Subtitle: "Coming-of-age stories, campus comedies, and rivalries",
            StartMonth: 8, StartDay: 20,
            EndMonth: 9, EndDay: 20,
            Keywords: new[] { "high school", "college", "university", "campus", "teen", "prom", "teacher", "student", "classroom", "freshman", "graduation" },
            Genres: new[] { "Comedy", "Drama", "Romance" },
            BoostTags: new[] { "high school", "college", "coming of age", "campus" },
            RequireKeywordMatch: true,
            TmdbKeywordIds: new[] { 10683, 6270, 3616 },
            EpisodeKeywords: Array.Empty<string>(),
            IncludeEpisodes: false),

        new HolidayWindow(
            Id: "halloween",
            Title: "Halloween & Spooky Season",
            Subtitle: "Chills, haunted nights, and monster classics",
            StartMonth: 9, StartDay: 25,
            EndMonth: 11, EndDay: 2,
            Keywords: new[] { "halloween", "ghost", "haunted", "witch", "vampire", "zombie", "monster", "curse", "scream", "nightmare", "pumpkin", "spooky", "october", "slasher" },
            Genres: new[] { "Horror", "Mystery", "Thriller" },
            BoostTags: new[] { "halloween", "spooky", "horror" },
            RequireKeywordMatch: true,
            TmdbKeywordIds: new[] { 3335, 162846, 10224, 12339 },
            EpisodeKeywords: new[] { "halloween", "trick or treat", "spooky", "haunted", "pumpkin", "witch", "ghost" },
            IncludeEpisodes: true),

        new HolidayWindow(
            Id: "thanksgiving-autumn",
            Title: "Thanksgiving & Cozy Autumn",
            Subtitle: "Gatherings, road trips home, and warm autumn stories",
            StartMonth: 11, StartDay: 3,
            EndMonth: 11, EndDay: 28,
            Keywords: new[] { "thanksgiving", "autumn", "harvest", "turkey", "pilgrim", "pilgrims", "feast", "november", "plymouth", "friendsgiving", "homecoming", "reunion", "gratitude", "cranberry", "pumpkin pie", "home for the holidays" },
            Genres: new[] { "Comedy", "Family", "Drama" },
            BoostTags: new[] { "thanksgiving", "autumn", "fall" },
            RequireKeywordMatch: true,
            TmdbKeywordIds: new[] { 4543, 180340 },
            EpisodeKeywords: new[] { "thanksgiving", "turkey", "friendsgiving", "pilgrim", "harvest" },
            IncludeEpisodes: true),

        new HolidayWindow(
            Id: "holiday-christmas",
            Title: "Holiday & Christmas Classics",
            Subtitle: "Festive favorites, snowstorms, and seasonal cheer",
            StartMonth: 11, StartDay: 20,
            EndMonth: 12, EndDay: 26,
            Keywords: new[] { "christmas", "xmas", "santa", "claus", "holiday", "elf", "elves", "reindeer", "scrooge", "grinch", "north pole", "snowman", "nutcracker", "noel", "mistletoe", "yuletide", "december" },
            Genres: new[] { "Family", "Comedy", "Animation", "Romance" },
            BoostTags: new[] { "christmas", "holiday", "xmas", "festive" },
            RequireKeywordMatch: true,
            TmdbKeywordIds: new[] { 207317, 65, 1991, 207318 },
            EpisodeKeywords: new[] { "christmas", "xmas", "santa", "secret santa", "holiday", "noel", "north pole", "hanukkah" },
            IncludeEpisodes: true),
    };

    /// <summary>
    /// Returns all seasonal windows active on <paramref name="date"/> (up to 2 overlapping windows),
    /// ordered from shortest/most-specific holiday window to broader seasonal backdrops.
    /// </summary>
    public static IReadOnlyList<HolidayWindow> GetActiveWindows(DateTime date)
    {
        var active = new List<(HolidayWindow Window, int SpanDays)>();
        var current = date.Month * 100 + date.Day;

        foreach (var w in Windows)
        {
            var start = w.StartMonth * 100 + w.StartDay;
            var end = w.EndMonth * 100 + w.EndDay;

            var matches = start <= end
                ? current >= start && current <= end
                : current >= start || current <= end;

            if (matches)
            {
                active.Add((w, EstimateSpanDays(w)));
            }
        }

        return active
            .OrderBy(x => x.SpanDays)
            .Select(x => x.Window)
            .Take(2)
            .ToList();
    }

    public static HolidayWindow? GetWindowById(string id)
    {
        foreach (var w in Windows)
        {
            if (w.Id.Equals(id, StringComparison.OrdinalIgnoreCase))
            {
                return w;
            }
        }

        return null;
    }

    /// <summary>
    /// Scores how strongly <paramref name="item"/> fits <paramref name="window"/>. Returns 0 when unmatched.
    /// </summary>
    public static int ScoreItem(BaseItem item, HolidayWindow window, bool tmdbConfirmed = false)
    {
        return ScoreMetadata(
            item.Name ?? string.Empty,
            item.Overview ?? string.Empty,
            item.Tags ?? Array.Empty<string>(),
            item.Genres ?? Array.Empty<string>(),
            item.CommunityRating,
            window,
            tmdbConfirmed);
    }

    /// <summary>
    /// Scores pre-indexed item metadata against a holiday window without holding full BaseItem allocations.
    /// </summary>
    public static int ScoreMetadata(
        string title,
        string overview,
        IReadOnlyList<string> tags,
        IReadOnlyList<string> genres,
        float? communityRating,
        HolidayWindow window,
        bool tmdbConfirmed = false)
    {
        var score = 0;
        var hasStrongHit = false;

        if (tmdbConfirmed)
        {
            score += 60;
            hasStrongHit = true;
        }

        foreach (var tag in tags)
        {
            foreach (var boost in window.BoostTags)
            {
                if (PrismHash.ContainsWholePhrase(tag, boost))
                {
                    score += 45;
                    hasStrongHit = true;
                }
            }
        }

        foreach (var kw in window.Keywords)
        {
            if (PrismHash.ContainsWholePhrase(title, kw))
            {
                score += 35;
                hasStrongHit = true;
            }

            foreach (var tag in tags)
            {
                if (PrismHash.ContainsWholePhrase(tag, kw))
                {
                    score += 30;
                    hasStrongHit = true;
                    break;
                }
            }

            if (PrismHash.ContainsWholePhrase(overview, kw))
            {
                score += 12;
                hasStrongHit = true;
            }
        }

        var genreHits = 0;
        foreach (var genre in genres)
        {
            foreach (var wg in window.Genres)
            {
                if (genre.Equals(wg, StringComparison.OrdinalIgnoreCase))
                {
                    score += 8;
                    genreHits++;
                }
            }
        }

        if (window.RequireKeywordMatch && !hasStrongHit)
        {
            if (window.HighRatedFallbackThreshold.HasValue
                && communityRating.HasValue
                && communityRating.Value >= window.HighRatedFallbackThreshold.Value
                && genreHits > 0)
            {
                score += 22;
            }
            else
            {
                return 0;
            }
        }

        if (!window.RequireKeywordMatch && !hasStrongHit && score < 16)
        {
            return 0;
        }

        if (communityRating.HasValue && communityRating.Value >= 7.0f)
        {
            score += 4;
        }

        return score;
    }

    /// <summary>
    /// Scores whether an Episode matches a holiday window's episode-specific keywords/tags.
    /// </summary>
    public static int ScoreEpisode(BaseItem episode, HolidayWindow window)
    {
        if (!window.IncludeEpisodes || window.EpisodeKeywords.Length == 0)
        {
            return 0;
        }

        var score = 0;
        var title = episode.Name ?? string.Empty;
        var overview = episode.Overview ?? string.Empty;
        var tags = episode.Tags ?? Array.Empty<string>();

        foreach (var tag in tags)
        {
            foreach (var boost in window.BoostTags)
            {
                if (PrismHash.ContainsWholePhrase(tag, boost))
                {
                    score += 40;
                }
            }
        }

        foreach (var kw in window.EpisodeKeywords)
        {
            if (PrismHash.ContainsWholePhrase(title, kw))
            {
                score += 45;
            }

            foreach (var tag in tags)
            {
                if (PrismHash.ContainsWholePhrase(tag, kw))
                {
                    score += 30;
                    break;
                }
            }

            if (PrismHash.ContainsWholePhrase(overview, kw))
            {
                score += 14;
            }
        }

        return score;
    }

    private static int EstimateSpanDays(HolidayWindow w)
    {
        // Use a non-leap reference year for ordering specificity; handle year-wrap cleanly.
        var start = new DateOnly(2025, w.StartMonth, Math.Min(w.StartDay, DateTime.DaysInMonth(2025, w.StartMonth)));
        var endYear = (w.StartMonth * 100 + w.StartDay) > (w.EndMonth * 100 + w.EndDay) ? 2026 : 2025;
        var end = new DateOnly(endYear, w.EndMonth, Math.Min(w.EndDay, DateTime.DaysInMonth(endYear, w.EndMonth)));
        return Math.Max(1, end.DayNumber - start.DayNumber + 1);
    }
}

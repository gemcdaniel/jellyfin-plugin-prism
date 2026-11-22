namespace Jellyfin.Plugin.Prism.Services;

/// <summary>
/// Curated KefinTweaks-inspired Thematic Picks catalog built from library tags, fallback keywords, and TMDB keyword IDs.
/// </summary>
public static class ThematicCatalog
{
    public sealed record ThematicTheme(
        string Id,
        string Group,
        string Name,
        string Subtitle,
        string AccentHex,
        string[] Tags,
        string[] FallbackKeywords,
        string[] PreferredGenres,
        int[] TmdbKeywordIds);

    private static readonly IReadOnlyList<ThematicTheme> Themes = new[]
    {
        // Story Origins
        new ThematicTheme(
            Id: "true-story",
            Group: "Story Origins",
            Name: "Based on a True Story",
            Subtitle: "Real events, remarkable lives, and gripping true accounts",
            AccentHex: "#38BDF8",
            Tags: new[] { "based on a true story", "based on true story", "true story" },
            FallbackKeywords: new[] { "true story", "real life", "real-life", "true account", "historical account" },
            PreferredGenres: new[] { "Drama", "Biography", "History", "Crime" },
            TmdbKeywordIds: new[] { 9672 }),

        new ThematicTheme(
            Id: "based-on-novel",
            Group: "Story Origins",
            Name: "Based on a Novel",
            Subtitle: "Page-to-screen adaptations and literary classics",
            AccentHex: "#A78BFA",
            Tags: new[] { "based on novel or book", "based on a novel", "based on novel", "literature" },
            FallbackKeywords: new[] { "adapted from", "bestselling novel", "novel by" },
            PreferredGenres: new[] { "Drama", "Mystery", "Romance", "Adventure", "Fantasy" },
            TmdbKeywordIds: new[] { 818 }),

        new ThematicTheme(
            Id: "comic-book",
            Group: "Story Origins",
            Name: "Based on a Comic Book",
            Subtitle: "Graphic novels, capes, and iconic comic worlds",
            AccentHex: "#F43F5E",
            Tags: new[] { "based on comic", "comic book", "graphic novel", "superhero" },
            FallbackKeywords: new[] { "comic book", "graphic novel", "superhero", "marvel", "dc comics" },
            PreferredGenres: new[] { "Action", "Adventure", "Science Fiction", "Animation" },
            TmdbKeywordIds: new[] { 9717, 9715 }),

        new ThematicTheme(
            Id: "video-game",
            Group: "Story Origins",
            Name: "Based on a Video Game",
            Subtitle: "High-score quests and interactive worlds brought to life",
            AccentHex: "#22D3EE",
            Tags: new[] { "based on video game", "video game", "gaming" },
            FallbackKeywords: new[] { "video game", "arcade", "gamer" },
            PreferredGenres: new[] { "Action", "Adventure", "Animation", "Fantasy" },
            TmdbKeywordIds: new[] { 41645 }),

        new ThematicTheme(
            Id: "biography",
            Group: "Story Origins",
            Name: "Biographies & Icons",
            Subtitle: "Portraits of pioneers, legends, and cultural figures",
            AccentHex: "#F59E0B",
            Tags: new[] { "biography", "biopic", "memoir" },
            FallbackKeywords: new[] { "biography", "biopic", "life story", "memoir" },
            PreferredGenres: new[] { "Biography", "Drama", "History", "Music", "Documentary" },
            TmdbKeywordIds: new[] { 5565 }),

        // Core Concepts
        new ThematicTheme(
            Id: "time-travel",
            Group: "Core Concepts",
            Name: "Time Travel & Loops",
            Subtitle: "Timeline twists, paradoxes, and second chances",
            AccentHex: "#00D4FF",
            Tags: new[] { "time travel", "time loop", "temporal" },
            FallbackKeywords: new[] { "time travel", "time loop", "time machine", "timeline", "paradox", "back in time" },
            PreferredGenres: new[] { "Science Fiction", "Sci-Fi", "Fantasy", "Mystery", "Comedy" },
            TmdbKeywordIds: new[] { 4379, 256183 }),

        new ThematicTheme(
            Id: "dystopia",
            Group: "Core Concepts",
            Name: "Dystopia & Post-Apocalyptic",
            Subtitle: "Fractured futures, wastelands, and rebellion",
            AccentHex: "#FB7185",
            Tags: new[] { "dystopia", "post-apocalyptic future", "post-apocalyptic", "apocalypse" },
            FallbackKeywords: new[] { "dystopia", "dystopian", "post-apocalyptic", "wasteland", "apocalypse", "totalitarian" },
            PreferredGenres: new[] { "Science Fiction", "Sci-Fi", "Action", "Thriller", "Drama" },
            TmdbKeywordIds: new[] { 4565, 4458 }),

        new ThematicTheme(
            Id: "cyberpunk",
            Group: "Core Concepts",
            Name: "Cyberpunk & Virtual Worlds",
            Subtitle: "Neon megacities, hackers, and digital frontiers",
            AccentHex: "#C084FC",
            Tags: new[] { "cyberpunk", "virtual reality", "hacker", "cyberspace" },
            FallbackKeywords: new[] { "cyberpunk", "virtual reality", "cyberspace", "hacker", "simulation", "neon" },
            PreferredGenres: new[] { "Science Fiction", "Sci-Fi", "Action", "Thriller", "Animation" },
            TmdbKeywordIds: new[] { 12190, 4563 }),

        new ThematicTheme(
            Id: "artificial-intelligence",
            Group: "Core Concepts",
            Name: "Artificial Intelligence",
            Subtitle: "Sentient machines, androids, and silicon minds",
            AccentHex: "#2DD4BF",
            Tags: new[] { "artificial intelligence", "ai", "android", "robot" },
            FallbackKeywords: new[] { "artificial intelligence", "android", "sentient", "cyborg", "robot", "humanoid" },
            PreferredGenres: new[] { "Science Fiction", "Sci-Fi", "Thriller", "Drama" },
            TmdbKeywordIds: new[] { 310 }),

        new ThematicTheme(
            Id: "multiverse",
            Group: "Core Concepts",
            Name: "Parallel Realities",
            Subtitle: "Alternate dimensions, multiverses, and strange worlds",
            AccentHex: "#818CF8",
            Tags: new[] { "parallel universe", "alternative reality", "multiverse", "alternate history" },
            FallbackKeywords: new[] { "parallel universe", "alternate reality", "multiverse", "alternate dimension" },
            PreferredGenres: new[] { "Science Fiction", "Sci-Fi", "Fantasy", "Adventure", "Action" },
            TmdbKeywordIds: new[] { 9887, 179101 }),

        new ThematicTheme(
            Id: "supernatural",
            Group: "Core Concepts",
            Name: "Supernatural & Myth",
            Subtitle: "Ghosts, folklore, magic, and ancient powers",
            AccentHex: "#A855F7",
            Tags: new[] { "supernatural", "ghost", "magic", "witchcraft", "mythology", "vampire" },
            FallbackKeywords: new[] { "supernatural", "haunting", "mythology", "sorcery", "paranormal", "vampire" },
            PreferredGenres: new[] { "Fantasy", "Horror", "Mystery", "Thriller", "Drama" },
            TmdbKeywordIds: new[] { 6152, 162846 }),

        new ThematicTheme(
            Id: "monsters-kaiju",
            Group: "Core Concepts",
            Name: "Aliens & Giant Monsters",
            Subtitle: "First contact, kaiju clashes, and cosmic creatures",
            AccentHex: "#34D399",
            Tags: new[] { "alien", "kaiju", "monster", "extraterrestrial" },
            FallbackKeywords: new[] { "alien", "extraterrestrial", "kaiju", "giant monster", "invasion", "ufo" },
            PreferredGenres: new[] { "Science Fiction", "Sci-Fi", "Action", "Horror", "Adventure" },
            TmdbKeywordIds: new[] { 9951, 1299 }),

        // Crime & Intrigue
        new ThematicTheme(
            Id: "heist",
            Group: "Crime & Intrigue",
            Name: "Heists & Masterminds",
            Subtitle: "Impossible vaults, slick crews, and high-wire capers",
            AccentHex: "#FBBF24",
            Tags: new[] { "heist", "bank robbery", "caper", "con artist" },
            FallbackKeywords: new[] { "heist", "robbery", "vault", "mastermind", "con artist", "caper" },
            PreferredGenres: new[] { "Crime", "Thriller", "Action", "Comedy" },
            TmdbKeywordIds: new[] { 10051 }),

        new ThematicTheme(
            Id: "true-crime",
            Group: "Crime & Intrigue",
            Name: "True Crime & Cold Cases",
            Subtitle: "Investigations, forensic trails, and notorious cases",
            AccentHex: "#EF4444",
            Tags: new[] { "true crime", "serial killer", "cold case", "investigation" },
            FallbackKeywords: new[] { "true crime", "serial killer", "cold case", "homicide", "detective" },
            PreferredGenres: new[] { "Crime", "Documentary", "Drama", "Mystery", "Thriller" },
            TmdbKeywordIds: new[] { 10714, 156764 }),

        new ThematicTheme(
            Id: "organized-crime",
            Group: "Crime & Intrigue",
            Name: "Organized Crime & Noir",
            Subtitle: "Syndicates, underworld alliances, and shadow streets",
            AccentHex: "#94A3B8",
            Tags: new[] { "organized crime", "mafia", "gangster", "neo-noir", "film noir" },
            FallbackKeywords: new[] { "mafia", "mobster", "cartel", "syndicate", "crime family", "noir" },
            PreferredGenres: new[] { "Crime", "Drama", "Thriller", "Mystery" },
            TmdbKeywordIds: new[] { 10391, 3149 }),

        new ThematicTheme(
            Id: "whodunit",
            Group: "Crime & Intrigue",
            Name: "Whodunit & Murder Mysteries",
            Subtitle: "Locked rooms, suspect lists, and clever sleuths",
            AccentHex: "#38BDF8",
            Tags: new[] { "whodunit", "murder mystery", "detective", "murder" },
            FallbackKeywords: new[] { "whodunit", "murder mystery", "sleuth", "suspects", "detective" },
            PreferredGenres: new[] { "Mystery", "Crime", "Thriller", "Comedy" },
            TmdbKeywordIds: new[] { 10183 }),

        new ThematicTheme(
            Id: "espionage",
            Group: "Crime & Intrigue",
            Name: "Espionage & Spycraft",
            Subtitle: "Double agents, covert missions, and shadow ops",
            AccentHex: "#0EA5E9",
            Tags: new[] { "spy", "espionage", "secret agent", "cia", "mi6" },
            FallbackKeywords: new[] { "espionage", "secret agent", "undercover", "intelligence agency", "operative" },
            PreferredGenres: new[] { "Action", "Thriller", "Drama", "Mystery" },
            TmdbKeywordIds: new[] { 470, 1589 }),

        // Tone & Style
        new ThematicTheme(
            Id: "dark-comedy",
            Group: "Tone & Style",
            Name: "Dark & Satirical Comedy",
            Subtitle: "Sharp wit, pitch-black laughs, and biting satire",
            AccentHex: "#F472B6",
            Tags: new[] { "dark comedy", "black comedy", "satire", "absurdist" },
            FallbackKeywords: new[] { "dark comedy", "black comedy", "satire", "satirical", "gallows humor" },
            PreferredGenres: new[] { "Comedy", "Drama", "Crime" },
            TmdbKeywordIds: new[] { 9714, 210024 }),

        new ThematicTheme(
            Id: "psychological-thriller",
            Group: "Tone & Style",
            Name: "Psychological Thrillers",
            Subtitle: "Mind games, paranoia, and unreliable narrators",
            AccentHex: "#7C5CFF",
            Tags: new[] { "psychological thriller", "unreliable narrator", "mind game", "paranoia" },
            FallbackKeywords: new[] { "psychological", "paranoia", "unreliable", "obsession", "mind game" },
            PreferredGenres: new[] { "Thriller", "Mystery", "Drama", "Horror" },
            TmdbKeywordIds: new[] { 12565 }),

        new ThematicTheme(
            Id: "slow-burn",
            Group: "Tone & Style",
            Name: "Atmospheric & Slow Burn",
            Subtitle: "Mood-driven cinema, rich tension, and lingering dread",
            AccentHex: "#64748B",
            Tags: new[] { "slow burn", "atmospheric", "neo-western", "minimalist" },
            FallbackKeywords: new[] { "atmospheric", "slow-burn", "haunting", "meditative", "bleak" },
            PreferredGenres: new[] { "Drama", "Horror", "Mystery", "Thriller" },
            TmdbKeywordIds: new[] { 186764 }),

        new ThematicTheme(
            Id: "coming-of-age",
            Group: "Tone & Style",
            Name: "Coming of Age",
            Subtitle: "Growing up, first loves, and defining summers",
            AccentHex: "#FB923C",
            Tags: new[] { "coming of age", "adolescence", "youth", "teenager" },
            FallbackKeywords: new[] { "coming-of-age", "coming of age", "teenager", "growing up", "high school" },
            PreferredGenres: new[] { "Drama", "Comedy", "Romance" },
            TmdbKeywordIds: new[] { 10683 }),

        new ThematicTheme(
            Id: "feel-good",
            Group: "Tone & Style",
            Name: "Underdogs & Feel-Good",
            Subtitle: "Heartfelt triumphs, friendship, and crowd-pleasing spirit",
            AccentHex: "#4ADE80",
            Tags: new[] { "underdog", "friendship", "feel-good", "uplifting", "mentor" },
            FallbackKeywords: new[] { "underdog", "championship", "uplifting", "heartwarming", "friendship" },
            PreferredGenres: new[] { "Comedy", "Drama", "Family", "Sport" },
            TmdbKeywordIds: new[] { 6075, 9713 }),

        // Settings & Journeys
        new ThematicTheme(
            Id: "space-voyages",
            Group: "Settings & Journeys",
            Name: "Deep Space & Starships",
            Subtitle: "Orbital survival, cosmic expeditions, and star systems",
            AccentHex: "#00D4FF",
            Tags: new[] { "space", "spacecraft", "space station", "spaceship", "astronaut" },
            FallbackKeywords: new[] { "spacecraft", "astronaut", "space station", "interstellar", "orbit", "mars" },
            PreferredGenres: new[] { "Science Fiction", "Sci-Fi", "Adventure", "Drama", "Thriller" },
            TmdbKeywordIds: new[] { 9882, 1432 }),

        new ThematicTheme(
            Id: "road-trip",
            Group: "Settings & Journeys",
            Name: "Road Trips & Odysseys",
            Subtitle: "Open highways, cross-country detours, and wild companions",
            AccentHex: "#FACC15",
            Tags: new[] { "road trip", "journey", "cross country" },
            FallbackKeywords: new[] { "road trip", "cross-country", "highway", "motel", "odyssey" },
            PreferredGenres: new[] { "Comedy", "Adventure", "Drama" },
            TmdbKeywordIds: new[] { 7312 }),

        new ThematicTheme(
            Id: "period-piece",
            Group: "Settings & Journeys",
            Name: "Period Pieces & Historical",
            Subtitle: "Lavish eras, bygone courts, and historical turning points",
            AccentHex: "#D97706",
            Tags: new[] { "period piece", "period drama", "victorian era", "medieval", "historical" },
            FallbackKeywords: new[] { "century", "victorian", "medieval", "kingdom", "monarch", "dynasty" },
            PreferredGenres: new[] { "History", "Drama", "Romance", "War" },
            TmdbKeywordIds: new[] { 15060, 1405 }),

        new ThematicTheme(
            Id: "westerns",
            Group: "Settings & Journeys",
            Name: "Frontier & Westerns",
            Subtitle: "Dusty trails, outlaws, and modern frontier justice",
            AccentHex: "#B45309",
            Tags: new[] { "western", "frontier", "outlaw", "cowboy" },
            FallbackKeywords: new[] { "frontier", "sheriff", "outlaw", "cowboy", "ranch", "gunslinger" },
            PreferredGenres: new[] { "Western", "Drama", "Action" },
            TmdbKeywordIds: new[] { 952, 155477 }),

        new ThematicTheme(
            Id: "workplace-culture",
            Group: "Settings & Journeys",
            Name: "Workplace & Newsrooms",
            Subtitle: "Office politics, kitchens, courts, and late-night desks",
            AccentHex: "#60A5FA",
            Tags: new[] { "workplace", "workplace comedy", "journalism", "courtroom" },
            FallbackKeywords: new[] { "newsroom", "journalist", "courtroom", "office", "chef", "restaurant" },
            PreferredGenres: new[] { "Comedy", "Drama", "Thriller" },
            TmdbKeywordIds: new[] { 1438, 13005 }),

        new ThematicTheme(
            Id: "isolated-survival",
            Group: "Settings & Journeys",
            Name: "Islands & Isolated Survival",
            Subtitle: "Remote outposts, uncharted islands, and survival odds",
            AccentHex: "#10B981",
            Tags: new[] { "island", "survival", "shipwreck", "wilderness" },
            FallbackKeywords: new[] { "stranded", "survival", "remote island", "shipwreck", "wilderness" },
            PreferredGenres: new[] { "Adventure", "Thriller", "Drama", "Horror" },
            TmdbKeywordIds: new[] { 10349, 2041 }),
    };

    public static IReadOnlyList<ThematicTheme> GetAll() => Themes;

    public static ThematicTheme? GetById(string? id)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return null;
        }

        foreach (var theme in Themes)
        {
            if (theme.Id.Equals(id, StringComparison.OrdinalIgnoreCase))
            {
                return theme;
            }
        }

        return null;
    }

    public static int ScoreMetadata(
        string title,
        string overview,
        IReadOnlyList<string> tags,
        IReadOnlyList<string> genres,
        float? communityRating,
        ThematicTheme theme,
        bool tmdbConfirmed = false)
    {
        var score = 0;
        var hasTagOrTitleOrTmdb = false;
        var hasOverviewHit = false;

        if (tmdbConfirmed)
        {
            score += 45;
            hasTagOrTitleOrTmdb = true;
        }

        foreach (var tag in tags)
        {
            foreach (var themeTag in theme.Tags)
            {
                if (PrismHash.ContainsWholePhrase(tag, themeTag))
                {
                    score += 50;
                    hasTagOrTitleOrTmdb = true;
                    break;
                }
            }
        }

        foreach (var kw in theme.FallbackKeywords)
        {
            if (PrismHash.ContainsWholePhrase(title, kw))
            {
                score += 24;
                hasTagOrTitleOrTmdb = true;
            }

            if (PrismHash.ContainsWholePhrase(overview, kw))
            {
                score += 14;
                hasOverviewHit = true;
            }
        }

        if (!hasTagOrTitleOrTmdb && !hasOverviewHit)
        {
            return 0;
        }

        var genreMatchCount = 0;
        foreach (var genre in genres)
        {
            foreach (var preferred in theme.PreferredGenres)
            {
                if (genre.Equals(preferred, StringComparison.OrdinalIgnoreCase))
                {
                    genreMatchCount++;
                    score += 5;
                    break;
                }
            }
        }

        // Overview-only matches require at least one preferred genre so descriptions don't produce noisy mismatches.
        if (!hasTagOrTitleOrTmdb && genreMatchCount == 0)
        {
            return 0;
        }

        if (communityRating.HasValue && communityRating.Value >= 7.2f)
        {
            score += 3;
        }

        return score;
    }
}

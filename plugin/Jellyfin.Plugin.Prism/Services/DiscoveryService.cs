using Jellyfin.Data.Enums;
using Jellyfin.Plugin.Prism.Configuration;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Prism.Services;

/// <summary>
/// Builds and paginates personalized Infinite Discovery sections (similar items, watchlisted/favorited seeds,
/// popular genres, studios, top people, thematic deep dives, watch again, and inline discovery spotlights).
/// </summary>
public sealed class DiscoveryService
{
    private readonly LibraryIndexService _libraryIndex;
    private readonly HomeSectionService _homeSectionService;
    private readonly TmdbService _tmdbService;
    private readonly IMemoryCache _cache;
    private readonly ILogger<DiscoveryService> _logger;

    private enum SlotKind
    {
        SimilarSeed,
        PersonSeeded,
        GenreMovies,
        GenreSeries,
        GenreTopRated,
        Studio,
        TopPerson,
        Thematic,
        WatchAgain
    }

    private sealed record DiscoverySlot(
        string Id,
        string Title,
        string Subtitle,
        string Badge,
        SlotKind Kind,
        bool SpotlightEligible,
        Guid SeedItemId = default,
        string? Key = null,
        PersonKind PersonRole = PersonKind.Unknown);

    public DiscoveryService(
        LibraryIndexService libraryIndex,
        HomeSectionService homeSectionService,
        TmdbService tmdbService,
        IMemoryCache cache,
        ILogger<DiscoveryService> logger)
    {
        _libraryIndex = libraryIndex;
        _homeSectionService = homeSectionService;
        _tmdbService = tmdbService;
        _cache = cache;
        _logger = logger;
    }

    public PrismDiscoveryResponse GetDiscoveryPage(Guid userId, int page, int pageSize)
    {
        var cfg = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        var clampedPage = Math.Max(0, page);
        var clampedPageSize = Math.Clamp(pageSize, 1, 8);
        var now = DateTime.Now;
        var bucket = PrismHash.GetRotationBucket(now);

        if (!cfg.EnablePlugin || !cfg.EnableInfiniteDiscovery)
        {
            return new PrismDiscoveryResponse
            {
                Page = clampedPage,
                PageSize = clampedPageSize,
                HasMore = false,
                TotalSections = 0,
                RotationBucket = bucket
            };
        }

        var snapshot = _libraryIndex.GetSnapshot();
        var ctx = _libraryIndex.GetUserContext(userId);
        if (ctx.VisibleItems.Count < 4)
        {
            return new PrismDiscoveryResponse
            {
                Page = clampedPage,
                PageSize = clampedPageSize,
                HasMore = false,
                TotalSections = 0,
                RotationBucket = bucket
            };
        }

        var tmdbVersion = _tmdbService.CacheVersion;
        var cfgVersion = _homeSectionService.ConfigVersion;
        var deckKey = $"prism_disc_deck_{userId:N}_{bucket}_{snapshot.Version}_{ctx.UserVersion}_{tmdbVersion}_{cfgVersion}";

        if (!_cache.TryGetValue(deckKey, out List<DiscoverySlot>? deck) || deck == null)
        {
            deck = BuildDeck(cfg, ctx, snapshot, bucket);
            _cache.Set(deckKey, deck, TimeSpan.FromMinutes(15));
        }

        var maxItems = Math.Clamp(cfg.MaxItemsPerRow, 4, 40);
        var startIdx = clampedPage * clampedPageSize;
        var sections = new List<PrismSectionDto>(clampedPageSize);

        if (startIdx < deck.Count)
        {
            var slice = deck.Skip(startIdx).Take(clampedPageSize).ToList();
            for (var i = 0; i < slice.Count; i++)
            {
                var globalIndex = startIdx + i;
                var slot = slice[i];
                var dto = MaterializeSlot(slot, globalIndex, ctx, snapshot, bucket, maxItems);
                if (dto != null)
                {
                    sections.Add(dto);
                }
            }
        }

        return new PrismDiscoveryResponse
        {
            Page = clampedPage,
            PageSize = clampedPageSize,
            HasMore = startIdx + clampedPageSize < deck.Count,
            TotalSections = deck.Count,
            RotationBucket = bucket,
            Sections = sections
        };
    }

    private List<DiscoverySlot> BuildDeck(
        PluginConfiguration cfg,
        UserLibraryContext ctx,
        LibraryIndexSnapshot snapshot,
        int bucket)
    {
        var bucketA = new List<DiscoverySlot>();
        var bucketB = new List<DiscoverySlot>();
        var bucketC = new List<DiscoverySlot>();
        var bucketD = new List<DiscoverySlot>();
        var bucketE = new List<DiscoverySlot>();

        var usedSeedIds = new HashSet<Guid>();
        var usedPersonNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // Bucket A1: Recently Watched Similar (up to 4)
        var recentPicks = ctx.WatchedRecent
            .Select(x => x.Item)
            .OrderBy(x => PrismHash.StableHash(x.Id, bucket + 201))
            .Take(12)
            .ToList();

        var recentAdded = 0;
        foreach (var seed in recentPicks)
        {
            if (recentAdded >= 4) break;
            if (!usedSeedIds.Add(seed.Id)) continue;

            var similar = _libraryIndex.ComputeSimilarItems(seed, ctx, snapshot, 6, bucket + 203);
            if (similar.Count < 3) continue;

            bucketA.Add(new DiscoverySlot(
                Id: $"disc-sim-watched-{seed.Id:N}",
                Title: $"Because You Watched {seed.Name}",
                Subtitle: "Personalized picks matching genre, tags, and cast",
                Badge: "For You",
                Kind: SlotKind.SimilarSeed,
                SpotlightEligible: true,
                SeedItemId: seed.Id));
            recentAdded++;
        }

        // Bucket A2: Favorited Similar (up to 3)
        var favSeeds = ctx.FavoriteIds
            .Select(id => snapshot.ById.TryGetValue(id, out var item) ? item : null)
            .Where(item => item != null && ctx.AllowedIds.Contains(item.Id))
            .Cast<IndexedItem>()
            .OrderBy(x => PrismHash.StableHash(x.Id, bucket + 211))
            .Take(10)
            .ToList();

        var favAdded = 0;
        foreach (var seed in favSeeds)
        {
            if (favAdded >= 3) break;
            if (!usedSeedIds.Add(seed.Id)) continue;

            var similar = _libraryIndex.ComputeSimilarItems(seed, ctx, snapshot, 6, bucket + 213);
            if (similar.Count < 3) continue;

            bucketA.Add(new DiscoverySlot(
                Id: $"disc-sim-fav-{seed.Id:N}",
                Title: $"Because You Favorited {seed.Name}",
                Subtitle: "Inspired by your favorites",
                Badge: "Favorite Match",
                Kind: SlotKind.SimilarSeed,
                SpotlightEligible: true,
                SeedItemId: seed.Id));
            favAdded++;
        }

        // Bucket A3: Watchlist Similar (up to 3)
        if (cfg.EnableWatchlist && ctx.WatchlistIds.Count > 0)
        {
            var wlSeeds = ctx.WatchlistIds
                .Select(id => snapshot.ById.TryGetValue(id, out var item) ? item : null)
                .Where(item => item != null && ctx.AllowedIds.Contains(item.Id))
                .Cast<IndexedItem>()
                .OrderBy(x => PrismHash.StableHash(x.Id, bucket + 221))
                .Take(8)
                .ToList();

            var wlAdded = 0;
            foreach (var seed in wlSeeds)
            {
                if (wlAdded >= 3) break;
                if (!usedSeedIds.Add(seed.Id)) continue;

                var similar = _libraryIndex.ComputeSimilarItems(seed, ctx, snapshot, 6, bucket + 223);
                if (similar.Count < 3) continue;

                bucketA.Add(new DiscoverySlot(
                    Id: $"disc-sim-wl-{seed.Id:N}",
                    Title: $"Because {seed.Name} Is on Your Watchlist",
                    Subtitle: "Similar titles to queue up next",
                    Badge: "Watchlist Match",
                    Kind: SlotKind.SimilarSeed,
                    SpotlightEligible: false,
                    SeedItemId: seed.Id));
                wlAdded++;
            }
        }

        // Bucket A4: Watch-History People ("Starring X" / "Directed by Y" because you watched Z)
        var historyPersonAdded = 0;
        foreach (var recent in ctx.WatchedRecent.Take(15))
        {
            if (historyPersonAdded >= 3) break;
            if (!snapshot.PeopleByItem.TryGetValue(recent.Item.Id, out var credits)) continue;

            var candidateCredit = credits
                .Where(c => c.Kind is PersonKind.Director or PersonKind.Actor)
                .OrderByDescending(c => c.Kind == PersonKind.Director)
                .ThenBy(c => PrismHash.StableHash(c.Name, bucket + 229))
                .FirstOrDefault(c =>
                {
                    if (usedPersonNames.Contains(c.Name)) return false;
                    if (!snapshot.PeopleByName.TryGetValue(c.Name, out var agg)) return false;
                    var visibleCount = agg.AllItemIds.Count(id => ctx.AllowedIds.Contains(id) && id != recent.Item.Id);
                    return visibleCount >= 3;
                });

            if (candidateCredit == null) continue;
            usedPersonNames.Add(candidateCredit.Name);

            var verb = candidateCredit.Kind == PersonKind.Director ? "Directed by" : "Starring";
            bucketA.Add(new DiscoverySlot(
                Id: $"disc-person-seed-{PrismHash.StableHash(candidateCredit.Name, 1):x8}",
                Title: $"{verb} {candidateCredit.Name}",
                Subtitle: $"Because you recently watched {recent.Item.Name}",
                Badge: candidateCredit.Kind == PersonKind.Director ? "Director" : "Cast",
                Kind: SlotKind.PersonSeeded,
                SpotlightEligible: false,
                SeedItemId: recent.Item.Id,
                Key: candidateCredit.Name,
                PersonRole: candidateCredit.Kind));
            historyPersonAdded++;
        }

        // Bucket B: Popular Genres & Genre Spotlights
        var homeGenreSkip = ResolveHomeSpotlightGenre(ctx, bucket);
        var genreCandidates = snapshot.ByGenre
            .Select(kvp =>
            {
                var visible = kvp.Value.Where(i => ctx.AllowedIds.Contains(i.Id)).ToList();
                var movieCount = visible.Count(i => i.Kind == BaseItemKind.Movie);
                var seriesCount = visible.Count(i => i.Kind == BaseItemKind.Series);
                var affinity = ctx.UserGenreCounts.TryGetValue(kvp.Key, out var uCount) ? uCount : 0;
                return (Genre: kvp.Key, MovieCount: movieCount, SeriesCount: seriesCount, Total: visible.Count, Affinity: affinity);
            })
            .Where(g => g.MovieCount >= 6 || g.SeriesCount >= 5)
            .OrderByDescending(g => g.Affinity > 0 ? 1 : 0)
            .ThenBy(g => PrismHash.StableHash(g.Genre, bucket + 241))
            .ToList();

        foreach (var g in genreCandidates.Take(10))
        {
            if (g.MovieCount >= 6)
            {
                bucketB.Add(new DiscoverySlot(
                    Id: $"disc-genre-movies-{PrismHash.StableHash(g.Genre, 2):x8}",
                    Title: $"{g.Genre} Movies",
                    Subtitle: "Explore feature films in this genre",
                    Badge: "Genre",
                    Kind: SlotKind.GenreMovies,
                    SpotlightEligible: true,
                    Key: g.Genre));
            }

            if (g.SeriesCount >= 5)
            {
                bucketB.Add(new DiscoverySlot(
                    Id: $"disc-genre-series-{PrismHash.StableHash(g.Genre, 3):x8}",
                    Title: $"{g.Genre} Series",
                    Subtitle: "TV shows in this genre",
                    Badge: "Genre TV",
                    Kind: SlotKind.GenreSeries,
                    SpotlightEligible: false,
                    Key: g.Genre));
            }

            if (g.Total >= 6 && !string.Equals(g.Genre, homeGenreSkip, StringComparison.OrdinalIgnoreCase))
            {
                bucketB.Add(new DiscoverySlot(
                    Id: $"disc-genre-top-{PrismHash.StableHash(g.Genre, 4):x8}",
                    Title: $"Top Rated {g.Genre}",
                    Subtitle: $"Highest-rated {g.Genre} picks across your library",
                    Badge: "Top Genre",
                    Kind: SlotKind.GenreTopRated,
                    SpotlightEligible: true,
                    Key: g.Genre));
            }
        }

        // Bucket C: Popular Studios / Networks
        var studioCandidates = snapshot.ByStudio
            .Select(kvp =>
            {
                var visibleCount = kvp.Value.Count(i => ctx.AllowedIds.Contains(i.Id));
                var affinity = ctx.UserStudioCounts.TryGetValue(kvp.Key, out var uCount) ? uCount : 0;
                return (Studio: kvp.Key, Count: visibleCount, Affinity: affinity);
            })
            .Where(s => s.Count >= 5)
            .OrderByDescending(s => s.Affinity > 0 ? 1 : 0)
            .ThenByDescending(s => s.Count)
            .ThenBy(s => PrismHash.StableHash(s.Studio, bucket + 251))
            .Take(8)
            .ToList();

        foreach (var s in studioCandidates)
        {
            bucketC.Add(new DiscoverySlot(
                Id: $"disc-studio-{PrismHash.StableHash(s.Studio, 5):x8}",
                Title: $"From {s.Studio}",
                Subtitle: $"{s.Count} movies and series in your library",
                Badge: "Studio",
                Kind: SlotKind.Studio,
                SpotlightEligible: true,
                Key: s.Studio));
        }

        // Bucket D: Top People in Library (Actors, Directors, Writers)
        foreach (var actor in snapshot.TopActors
            .Where(p => !usedPersonNames.Contains(p.Name) && p.ActorItemIds.Count(id => ctx.AllowedIds.Contains(id)) >= 4)
            .OrderBy(p => PrismHash.StableHash(p.Name, bucket + 263))
            .Take(4))
        {
            usedPersonNames.Add(actor.Name);
            bucketD.Add(new DiscoverySlot(
                Id: $"disc-top-actor-{PrismHash.StableHash(actor.Name, 6):x8}",
                Title: $"Starring {actor.Name}",
                Subtitle: "Popular cast featured across your library",
                Badge: "Top Actor",
                Kind: SlotKind.TopPerson,
                SpotlightEligible: false,
                Key: actor.Name,
                PersonRole: PersonKind.Actor));
        }

        foreach (var dir in snapshot.TopDirectors
            .Where(p => !usedPersonNames.Contains(p.Name) && p.DirectorItemIds.Count(id => ctx.AllowedIds.Contains(id)) >= 3)
            .OrderBy(p => PrismHash.StableHash(p.Name, bucket + 271))
            .Take(3))
        {
            usedPersonNames.Add(dir.Name);
            bucketD.Add(new DiscoverySlot(
                Id: $"disc-top-director-{PrismHash.StableHash(dir.Name, 7):x8}",
                Title: $"Directed by {dir.Name}",
                Subtitle: "Filmmaker spotlight from your collection",
                Badge: "Top Director",
                Kind: SlotKind.TopPerson,
                SpotlightEligible: false,
                Key: dir.Name,
                PersonRole: PersonKind.Director));
        }

        foreach (var writer in snapshot.TopWriters
            .Where(p => !usedPersonNames.Contains(p.Name) && p.WriterItemIds.Count(id => ctx.AllowedIds.Contains(id)) >= 3)
            .OrderBy(p => PrismHash.StableHash(p.Name, bucket + 277))
            .Take(2))
        {
            usedPersonNames.Add(writer.Name);
            bucketD.Add(new DiscoverySlot(
                Id: $"disc-top-writer-{PrismHash.StableHash(writer.Name, 8):x8}",
                Title: $"Written by {writer.Name}",
                Subtitle: "Distinctive voices and screenplays",
                Badge: "Top Writer",
                Kind: SlotKind.TopPerson,
                SpotlightEligible: false,
                Key: writer.Name,
                PersonRole: PersonKind.Writer));
        }

        // Bucket E: Thematic Deep Dives + Watch Again
        var tmdb = _tmdbService.GetCachedSnapshot();
        var populatedThemes = new List<(ThematicCatalog.ThematicTheme Theme, int Count)>();

        foreach (var theme in ThematicCatalog.GetAll())
        {
            tmdb.ThemeMovieSets.TryGetValue(theme.Id, out var tmdbMovies);
            tmdb.ThemeTvSets.TryGetValue(theme.Id, out var tmdbTv);

            var count = 0;
            foreach (var item in ctx.VisibleItems)
            {
                var confirmed = item.TmdbId.HasValue && (item.Kind == BaseItemKind.Series
                    ? tmdbTv?.Contains(item.TmdbId.Value) == true
                    : tmdbMovies?.Contains(item.TmdbId.Value) == true);
                if (ThematicCatalog.ScoreMetadata(item.Name, item.Overview, item.Tags, item.Genres, item.CommunityRating, theme, confirmed) > 0)
                {
                    count++;
                }
            }

            if (count >= 4)
            {
                populatedThemes.Add((theme, count));
            }
        }

        // Exclude the single theme featured directly on Home (same order seed as HomeSectionService)
        var orderedThemes = populatedThemes
            .OrderBy(t => PrismHash.StableHash(t.Theme.Id, bucket + 33))
            .Skip(1)
            .Take(6)
            .ToList();

        foreach (var t in orderedThemes)
        {
            bucketE.Add(new DiscoverySlot(
                Id: $"disc-theme-{t.Theme.Id}",
                Title: t.Theme.Name,
                Subtitle: t.Theme.Subtitle,
                Badge: "Thematic",
                Kind: SlotKind.Thematic,
                SpotlightEligible: true,
                Key: t.Theme.Id));
        }

        if (ctx.WatchAgainCandidates.Count >= 3)
        {
            bucketE.Add(new DiscoverySlot(
                Id: "disc-watch-again",
                Title: "Watch Again",
                Subtitle: "Favorites & standout titles you watched a while ago",
                Badge: "Rewatch",
                Kind: SlotKind.WatchAgain,
                SpotlightEligible: false));
        }

        // Deterministically shuffle within buckets and round-robin interleave A, B, C, D, E
        bucketA = bucketA.OrderBy(s => PrismHash.StableHash(s.Id, bucket + 307)).ToList();
        bucketB = bucketB.OrderBy(s => PrismHash.StableHash(s.Id, bucket + 311)).ToList();
        bucketC = bucketC.OrderBy(s => PrismHash.StableHash(s.Id, bucket + 313)).ToList();
        bucketD = bucketD.OrderBy(s => PrismHash.StableHash(s.Id, bucket + 317)).ToList();
        bucketE = bucketE.OrderBy(s => PrismHash.StableHash(s.Id, bucket + 331)).ToList();

        var queues = new[] { bucketA, bucketB, bucketC, bucketD, bucketE };
        var indices = new int[queues.Length];
        var deck = new List<DiscoverySlot>(40);

        while (deck.Count < 40)
        {
            var addedThisRound = false;
            for (var q = 0; q < queues.Length && deck.Count < 40; q++)
            {
                if (indices[q] < queues[q].Count)
                {
                    deck.Add(queues[q][indices[q]++]);
                    addedThisRound = true;
                }
            }

            if (!addedThisRound)
            {
                break;
            }
        }

        _logger.LogDebug("Built Discovery deck for user {UserId}: {Count} slots", ctx.UserId, deck.Count);
        return deck;
    }

    private PrismSectionDto? MaterializeSlot(
        DiscoverySlot slot,
        int globalIndex,
        UserLibraryContext ctx,
        LibraryIndexSnapshot snapshot,
        int bucket,
        int maxItems)
    {
        var items = ResolveSlotItems(slot, ctx, snapshot, bucket, maxItems);
        if (items.Count < 3)
        {
            return null;
        }

        var useSpotlight = (globalIndex % 4 == 2)
            && (slot.SpotlightEligible || items.Count(i => i.HasBackdrop) >= 3);

        if (useSpotlight)
        {
            var spotlightItems = items.Where(i => i.HasBackdrop).Take(6).ToList();
            if (spotlightItems.Count >= 3)
            {
                return new PrismSectionDto
                {
                    Id = slot.Id,
                    Title = slot.Title,
                    Subtitle = slot.Subtitle,
                    Badge = slot.Badge,
                    RenderMode = "Spotlight",
                    CardFormat = "Backdrop",
                    Items = spotlightItems
                        .Select(m => _homeSectionService.ToDto(m, ctx, _homeSectionService.GetMediaInfo(m), "Backdrop", slot.Badge))
                        .ToList()
                };
            }
        }

        return new PrismSectionDto
        {
            Id = slot.Id,
            Title = slot.Title,
            Subtitle = slot.Subtitle,
            Badge = slot.Badge,
            RenderMode = "Row",
            CardFormat = "Portrait",
            Items = items
                .Select(m => _homeSectionService.ToDto(m, ctx, _homeSectionService.GetMediaInfo(m)))
                .ToList()
        };
    }

    private List<IndexedItem> ResolveSlotItems(
        DiscoverySlot slot,
        UserLibraryContext ctx,
        LibraryIndexSnapshot snapshot,
        int bucket,
        int maxItems)
    {
        switch (slot.Kind)
        {
            case SlotKind.SimilarSeed:
                {
                    if (!snapshot.ById.TryGetValue(slot.SeedItemId, out var seed))
                    {
                        return new List<IndexedItem>();
                    }

                    return _libraryIndex.ComputeSimilarItems(seed, ctx, snapshot, maxItems, bucket + 401);
                }

            case SlotKind.PersonSeeded:
            case SlotKind.TopPerson:
                {
                    if (string.IsNullOrEmpty(slot.Key) || !snapshot.PeopleByName.TryGetValue(slot.Key, out var agg))
                    {
                        return new List<IndexedItem>();
                    }

                    var idSet = slot.PersonRole switch
                    {
                        PersonKind.Director => agg.DirectorItemIds,
                        PersonKind.Writer or PersonKind.Creator => agg.WriterItemIds,
                        PersonKind.Actor => agg.ActorItemIds,
                        _ => agg.AllItemIds
                    };

                    return idSet
                        .Where(id => id != slot.SeedItemId && ctx.AllowedIds.Contains(id))
                        .Select(id => snapshot.ById.TryGetValue(id, out var it) ? it : null)
                        .Where(it => it != null)
                        .Cast<IndexedItem>()
                        .OrderByDescending(i => !ctx.PlayedIds.Contains(i.Id))
                        .ThenByDescending(i => i.CommunityRating ?? 0f)
                        .ThenBy(i => PrismHash.StableHash(i.Id, bucket + 409))
                        .Take(maxItems)
                        .ToList();
                }

            case SlotKind.GenreMovies:
            case SlotKind.GenreSeries:
            case SlotKind.GenreTopRated:
                {
                    if (string.IsNullOrEmpty(slot.Key) || !snapshot.ByGenre.TryGetValue(slot.Key, out var list))
                    {
                        return new List<IndexedItem>();
                    }

                    IEnumerable<IndexedItem> query = list.Where(i => ctx.AllowedIds.Contains(i.Id));
                    if (slot.Kind == SlotKind.GenreMovies)
                    {
                        query = query.Where(i => i.Kind == BaseItemKind.Movie);
                    }
                    else if (slot.Kind == SlotKind.GenreSeries)
                    {
                        query = query.Where(i => i.Kind == BaseItemKind.Series);
                    }

                    if (slot.Kind == SlotKind.GenreTopRated)
                    {
                        return query
                            .OrderByDescending(i => i.CommunityRating ?? 0f)
                            .ThenBy(i => PrismHash.StableHash(i.Id, bucket + 419))
                            .Take(maxItems)
                            .ToList();
                    }

                    return query
                        .OrderByDescending(i => !ctx.PlayedIds.Contains(i.Id))
                        .ThenBy(i => PrismHash.StableHash(i.Id, bucket + 421))
                        .Take(maxItems)
                        .ToList();
                }

            case SlotKind.Studio:
                {
                    if (string.IsNullOrEmpty(slot.Key) || !snapshot.ByStudio.TryGetValue(slot.Key, out var list))
                    {
                        return new List<IndexedItem>();
                    }

                    return list
                        .Where(i => ctx.AllowedIds.Contains(i.Id))
                        .OrderByDescending(i => i.CommunityRating ?? 0f)
                        .ThenBy(i => PrismHash.StableHash(i.Id, bucket + 431))
                        .Take(maxItems)
                        .ToList();
                }

            case SlotKind.Thematic:
                {
                    var theme = ThematicCatalog.GetById(slot.Key);
                    if (theme == null)
                    {
                        return new List<IndexedItem>();
                    }

                    var tmdb = _tmdbService.GetCachedSnapshot();
                    tmdb.ThemeMovieSets.TryGetValue(theme.Id, out var tmdbMovies);
                    tmdb.ThemeTvSets.TryGetValue(theme.Id, out var tmdbTv);

                    return ctx.VisibleItems
                        .Select(item =>
                        {
                            var confirmed = item.TmdbId.HasValue && (item.Kind == BaseItemKind.Series
                                ? tmdbTv?.Contains(item.TmdbId.Value) == true
                                : tmdbMovies?.Contains(item.TmdbId.Value) == true);
                            return new
                            {
                                Item = item,
                                Score = ThematicCatalog.ScoreMetadata(item.Name, item.Overview, item.Tags, item.Genres, item.CommunityRating, theme, confirmed)
                            };
                        })
                        .Where(x => x.Score > 0)
                        .OrderByDescending(x => x.Score)
                        .ThenBy(x => PrismHash.StableHash(x.Item.Id, bucket + 439))
                        .Take(maxItems)
                        .Select(x => x.Item)
                        .ToList();
                }

            case SlotKind.WatchAgain:
                return ctx.WatchAgainCandidates
                    .OrderBy(i => PrismHash.StableHash(i.Id, bucket + 443))
                    .Take(maxItems)
                    .ToList();

            default:
                return new List<IndexedItem>();
        }
    }

    private static string? ResolveHomeSpotlightGenre(UserLibraryContext ctx, int bucket)
    {
        var genreGroups = ctx.VisibleItems
            .SelectMany(item => item.Genres.Select(g => new { Genre = g, Item = item }))
            .GroupBy(x => x.Genre, StringComparer.OrdinalIgnoreCase)
            .Where(g => g.Count() >= 6)
            .OrderBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (genreGroups.Count == 0)
        {
            return null;
        }

        return genreGroups[Math.Abs(bucket) % genreGroups.Count].Key;
    }
}

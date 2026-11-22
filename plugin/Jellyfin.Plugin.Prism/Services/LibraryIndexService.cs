using System.Collections.Concurrent;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Prism.Services;

public sealed record PersonCredit(Guid PersonId, string Name, PersonKind Kind);

public sealed class PersonAggregate
{
    public PersonAggregate(Guid personId, string name)
    {
        PersonId = personId;
        Name = name;
    }

    public Guid PersonId { get; set; }
    public string Name { get; }
    public HashSet<Guid> ActorItemIds { get; } = new();
    public HashSet<Guid> DirectorItemIds { get; } = new();
    public HashSet<Guid> WriterItemIds { get; } = new();
    public HashSet<Guid> AllItemIds { get; } = new();
}

public sealed class IndexedItem
{
    public required Guid Id { get; init; }
    public required BaseItemKind Kind { get; init; }
    public required string Name { get; init; }
    public required string Overview { get; init; }
    public int? ProductionYear { get; init; }
    public DateTime? PremiereDate { get; init; }
    public DateTime DateCreated { get; init; }
    public float? CommunityRating { get; init; }
    public long? RunTimeTicks { get; init; }
    public int Width { get; init; }
    public required string[] Genres { get; init; }
    public required string[] Tags { get; init; }
    public required string[] Studios { get; init; }
    public int? TmdbId { get; init; }
    public string? ImdbId { get; init; }
    public bool HasPrimary { get; init; }
    public string? PrimaryImageTag { get; init; }
    public bool HasBackdrop { get; init; }
    public int BackdropCount { get; init; }
    public required string[] BackdropImageTags { get; init; }
    public bool HasLogo { get; init; }
    public string? LogoImageTag { get; init; }
    public required HashSet<string> GenreSet { get; init; }
    public required HashSet<string> TagSet { get; init; }
    public required HashSet<string> StudioSet { get; init; }
}

public sealed class LibraryIndexSnapshot
{
    public required long Version { get; init; }
    public required IReadOnlyList<IndexedItem> AllItems { get; init; }
    public required Dictionary<Guid, IndexedItem> ById { get; init; }
    public required Dictionary<int, List<IndexedItem>> ByTmdbMovieId { get; init; }
    public required Dictionary<int, List<IndexedItem>> ByTmdbSeriesId { get; init; }
    public required Dictionary<string, List<IndexedItem>> ByImdbId { get; init; }
    public required Dictionary<string, List<IndexedItem>> ByGenre { get; init; }
    public required Dictionary<string, List<IndexedItem>> ByStudio { get; init; }
    public required Dictionary<string, List<IndexedItem>> ByTag { get; init; }
    public required Dictionary<Guid, List<PersonCredit>> PeopleByItem { get; init; }
    public required Dictionary<string, PersonAggregate> PeopleByName { get; init; }
    public required List<PersonAggregate> TopActors { get; init; }
    public required List<PersonAggregate> TopDirectors { get; init; }
    public required List<PersonAggregate> TopWriters { get; init; }
}

public sealed class UserLibraryContext
{
    public required Guid UserId { get; init; }
    public required long LibraryVersion { get; init; }
    public required long UserVersion { get; init; }
    public required HashSet<Guid> AllowedIds { get; init; }
    public List<BaseItem>? IncludedHomeParents { get; init; }
    public required List<IndexedItem> VisibleItems { get; init; }
    public required HashSet<Guid> PlayedIds { get; init; }
    public required HashSet<Guid> FavoriteIds { get; init; }
    public required HashSet<Guid> WatchlistIds { get; init; }
    public required List<(IndexedItem Item, DateTime LastPlayed)> WatchedRecent { get; init; }
    public required List<IndexedItem> WatchAgainCandidates { get; init; }
    public required Dictionary<string, int> UserGenreCounts { get; init; }
    public required Dictionary<string, int> UserStudioCounts { get; init; }
}

/// <summary>
/// Maintains a shared in-memory index of library Movies & Series plus per-user UserData contexts
/// using batch Jellyfin database queries and debounced event-driven cache busting.
/// </summary>
public sealed class LibraryIndexService : IDisposable
{
    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _userManager;
    private readonly IUserDataManager _userDataManager;
    private readonly IMemoryCache _cache;
    private readonly ILogger<LibraryIndexService> _logger;

    private readonly object _snapshotBuildLock = new();
    private readonly object _dirtyTimerLock = new();
    private readonly ConcurrentDictionary<Guid, long> _userVersions = new();

    private Timer? _dirtyTimer;
    private volatile LibraryIndexSnapshot? _snapshot;
    private volatile bool _snapshotDirty = true;
    private long _libraryVersion = 1;

    public LibraryIndexService(
        ILibraryManager libraryManager,
        IUserManager userManager,
        IUserDataManager userDataManager,
        IMemoryCache cache,
        ILogger<LibraryIndexService> logger)
    {
        _libraryManager = libraryManager;
        _userManager = userManager;
        _userDataManager = userDataManager;
        _cache = cache;
        _logger = logger;
    }

    public long GetLibraryVersion() => Interlocked.Read(ref _libraryVersion);

    public long GetUserVersion(Guid userId) => _userVersions.TryGetValue(userId, out var ver) ? ver : 0;

    public void BumpUserVersion(Guid userId)
    {
        if (userId == Guid.Empty)
        {
            return;
        }

        _userVersions.AddOrUpdate(userId, 1, static (_, old) => old + 1);
    }

    public void MarkLibraryDirtyDebounced()
    {
        lock (_dirtyTimerLock)
        {
            _dirtyTimer ??= new Timer(_ =>
            {
                _snapshotDirty = true;
                Interlocked.Increment(ref _libraryVersion);
            }, null, Timeout.Infinite, Timeout.Infinite);

            _dirtyTimer.Change(TimeSpan.FromSeconds(3), Timeout.InfiniteTimeSpan);
        }
    }

    public LibraryIndexSnapshot GetSnapshot()
    {
        var current = _snapshot;
        if (current != null && !_snapshotDirty)
        {
            return current;
        }

        lock (_snapshotBuildLock)
        {
            current = _snapshot;
            if (current != null && !_snapshotDirty)
            {
                return current;
            }

            var built = BuildSnapshot(GetLibraryVersion());
            _snapshot = built;
            _snapshotDirty = false;
            return built;
        }
    }

    public UserLibraryContext GetUserContext(Guid userId)
    {
        var snapshot = GetSnapshot();
        var userVer = GetUserVersion(userId);
        var cacheKey = $"prism_user_ctx_{userId:N}_{snapshot.Version}_{userVer}";

        if (_cache.TryGetValue(cacheKey, out UserLibraryContext? cached) && cached != null)
        {
            return cached;
        }

        var ctx = BuildUserContext(userId, snapshot, userVer);
        _cache.Set(cacheKey, ctx, TimeSpan.FromMinutes(10));
        return ctx;
    }

    public List<IndexedItem> ComputeSimilarItems(
        IndexedItem seed,
        UserLibraryContext ctx,
        LibraryIndexSnapshot snapshot,
        int limit,
        int rotationSeed,
        bool preferUnwatched = true)
    {
        snapshot.PeopleByItem.TryGetValue(seed.Id, out var seedPeople);
        var seedDirectorsAndWriters = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var seedActors = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (seedPeople != null)
        {
            foreach (var p in seedPeople)
            {
                if (string.IsNullOrWhiteSpace(p.Name))
                {
                    continue;
                }

                if (p.Kind is PersonKind.Director or PersonKind.Writer or PersonKind.Creator)
                {
                    seedDirectorsAndWriters.Add(p.Name);
                }
                else if (p.Kind == PersonKind.Actor)
                {
                    seedActors.Add(p.Name);
                }
            }
        }

        var scored = new List<(IndexedItem Item, int Score)>();

        foreach (var candidate in ctx.VisibleItems)
        {
            if (candidate.Id == seed.Id)
            {
                continue;
            }

            var score = 0;

            if (candidate.Kind == seed.Kind)
            {
                score += 4;
            }

            foreach (var g in candidate.Genres)
            {
                if (seed.GenreSet.Contains(g))
                {
                    score += 3;
                }
            }

            foreach (var t in candidate.Tags)
            {
                if (seed.TagSet.Contains(t))
                {
                    score += 6;
                }
            }

            foreach (var s in candidate.Studios)
            {
                if (seed.StudioSet.Contains(s))
                {
                    score += 2;
                }
            }

            if (seedDirectorsAndWriters.Count > 0 || seedActors.Count > 0)
            {
                if (snapshot.PeopleByItem.TryGetValue(candidate.Id, out var candPeople))
                {
                    foreach (var p in candPeople)
                    {
                        if (string.IsNullOrWhiteSpace(p.Name))
                        {
                            continue;
                        }

                        if (p.Kind is PersonKind.Director or PersonKind.Writer or PersonKind.Creator
                            && seedDirectorsAndWriters.Contains(p.Name))
                        {
                            score += 8;
                        }
                        else if (p.Kind == PersonKind.Actor && seedActors.Contains(p.Name))
                        {
                            score += 4;
                        }
                    }
                }
            }

            if (seed.ProductionYear.HasValue && candidate.ProductionYear.HasValue
                && Math.Abs(seed.ProductionYear.Value - candidate.ProductionYear.Value) <= 10)
            {
                score += 1;
            }

            if (score < 6)
            {
                continue;
            }

            if (preferUnwatched && !ctx.PlayedIds.Contains(candidate.Id))
            {
                score += 5;
            }

            if (candidate.CommunityRating.HasValue && candidate.CommunityRating.Value >= 7.2f)
            {
                score += 2;
            }

            scored.Add((candidate, score));
        }

        return scored
            .OrderByDescending(x => x.Score)
            .ThenBy(x => PrismHash.StableHash(x.Item.Id, rotationSeed))
            .Take(limit)
            .Select(x => x.Item)
            .ToList();
    }

    private LibraryIndexSnapshot BuildSnapshot(long version)
    {
        var baseItems = _libraryManager.GetItemList(new InternalItemsQuery
        {
            IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Series },
            Recursive = true,
            IsVirtualItem = false
        });

        var allItems = new List<IndexedItem>(baseItems.Count);
        var byId = new Dictionary<Guid, IndexedItem>(baseItems.Count);
        var byTmdbMovieId = new Dictionary<int, List<IndexedItem>>();
        var byTmdbSeriesId = new Dictionary<int, List<IndexedItem>>();
        var byImdbId = new Dictionary<string, List<IndexedItem>>(StringComparer.OrdinalIgnoreCase);
        var byGenre = new Dictionary<string, List<IndexedItem>>(StringComparer.OrdinalIgnoreCase);
        var byStudio = new Dictionary<string, List<IndexedItem>>(StringComparer.OrdinalIgnoreCase);
        var byTag = new Dictionary<string, List<IndexedItem>>(StringComparer.OrdinalIgnoreCase);
        var itemIds = new List<Guid>(baseItems.Count);

        foreach (var item in baseItems)
        {
            if (!item.HasImage(ImageType.Primary))
            {
                continue;
            }

            var kind = item.GetBaseItemKind();
            var genres = item.Genres ?? Array.Empty<string>();
            var tags = item.Tags ?? Array.Empty<string>();
            var studios = item.Studios ?? Array.Empty<string>();

            var primaryInfo = item.GetImageInfo(ImageType.Primary, 0);
            var backdropInfos = item.GetImages(ImageType.Backdrop).Take(4).ToList();
            var backdropTags = backdropInfos.Select(b => b.DateModified.Ticks.ToString()).ToArray();
            var logoInfo = item.HasImage(ImageType.Logo) ? item.GetImageInfo(ImageType.Logo, 0) : null;

            int? tmdbId = null;
            string? imdbId = null;
            if (item.ProviderIds != null)
            {
                foreach (var kvp in item.ProviderIds)
                {
                    if (kvp.Key.Equals("Tmdb", StringComparison.OrdinalIgnoreCase)
                        && int.TryParse(kvp.Value, out var parsedTmdb)
                        && parsedTmdb > 0)
                    {
                        tmdbId = parsedTmdb;
                    }
                    else if (kvp.Key.Equals("Imdb", StringComparison.OrdinalIgnoreCase)
                        && !string.IsNullOrWhiteSpace(kvp.Value))
                    {
                        imdbId = kvp.Value.Trim();
                    }
                }
            }

            var indexed = new IndexedItem
            {
                Id = item.Id,
                Kind = kind,
                Name = item.Name ?? string.Empty,
                Overview = item.Overview ?? string.Empty,
                ProductionYear = item.ProductionYear,
                PremiereDate = item.PremiereDate,
                DateCreated = item.DateCreated,
                CommunityRating = item.CommunityRating,
                RunTimeTicks = item.RunTimeTicks,
                Width = item.Width,
                Genres = genres,
                Tags = tags,
                Studios = studios,
                TmdbId = tmdbId,
                ImdbId = imdbId,
                HasPrimary = true,
                PrimaryImageTag = primaryInfo?.DateModified.Ticks.ToString(),
                HasBackdrop = backdropTags.Length > 0,
                BackdropCount = backdropTags.Length,
                BackdropImageTags = backdropTags,
                HasLogo = logoInfo != null,
                LogoImageTag = logoInfo?.DateModified.Ticks.ToString(),
                GenreSet = new HashSet<string>(genres, StringComparer.OrdinalIgnoreCase),
                TagSet = new HashSet<string>(tags, StringComparer.OrdinalIgnoreCase),
                StudioSet = new HashSet<string>(studios, StringComparer.OrdinalIgnoreCase)
            };

            allItems.Add(indexed);
            byId[indexed.Id] = indexed;
            itemIds.Add(indexed.Id);

            if (tmdbId.HasValue)
            {
                var targetMap = kind == BaseItemKind.Series ? byTmdbSeriesId : byTmdbMovieId;
                if (!targetMap.TryGetValue(tmdbId.Value, out var list))
                {
                    list = new List<IndexedItem>(1);
                    targetMap[tmdbId.Value] = list;
                }

                list.Add(indexed);
            }

            if (!string.IsNullOrEmpty(imdbId))
            {
                if (!byImdbId.TryGetValue(imdbId, out var list))
                {
                    list = new List<IndexedItem>(1);
                    byImdbId[imdbId] = list;
                }

                list.Add(indexed);
            }

            foreach (var g in genres)
            {
                if (string.IsNullOrWhiteSpace(g)) continue;
                if (!byGenre.TryGetValue(g, out var list))
                {
                    list = new List<IndexedItem>();
                    byGenre[g] = list;
                }

                list.Add(indexed);
            }

            foreach (var s in studios)
            {
                if (string.IsNullOrWhiteSpace(s)) continue;
                if (!byStudio.TryGetValue(s, out var list))
                {
                    list = new List<IndexedItem>();
                    byStudio[s] = list;
                }

                list.Add(indexed);
            }

            foreach (var t in tags)
            {
                if (string.IsNullOrWhiteSpace(t)) continue;
                if (!byTag.TryGetValue(t, out var list))
                {
                    list = new List<IndexedItem>();
                    byTag[t] = list;
                }

                list.Add(indexed);
            }
        }

        // Batch fetch people across all items in chunks of 500 to avoid N+1 DB calls.
        var peopleByItem = new Dictionary<Guid, List<PersonCredit>>(allItems.Count);
        var peopleByName = new Dictionary<string, PersonAggregate>(StringComparer.OrdinalIgnoreCase);

        const int chunkSize = 500;
        for (var i = 0; i < itemIds.Count; i += chunkSize)
        {
            var count = Math.Min(chunkSize, itemIds.Count - i);
            var chunk = itemIds.GetRange(i, count);
            try
            {
                var batch = _libraryManager.GetPeopleByItems(chunk);
                foreach (var kvp in batch)
                {
                    var credits = new List<PersonCredit>(Math.Min(16, kvp.Value.Count));
                    foreach (var p in kvp.Value)
                    {
                        if (string.IsNullOrWhiteSpace(p.Name))
                        {
                            continue;
                        }

                        var trimmedName = p.Name.Trim();
                        if (credits.Count < 16 || p.Type is PersonKind.Director or PersonKind.Writer or PersonKind.Creator)
                        {
                            credits.Add(new PersonCredit(p.Id, trimmedName, p.Type));
                        }

                        if (!peopleByName.TryGetValue(trimmedName, out var agg))
                        {
                            agg = new PersonAggregate(p.Id, trimmedName);
                            peopleByName[trimmedName] = agg;
                        }
                        else if (agg.PersonId == Guid.Empty && p.Id != Guid.Empty)
                        {
                            agg.PersonId = p.Id;
                        }

                        agg.AllItemIds.Add(kvp.Key);
                        if (p.Type == PersonKind.Actor)
                        {
                            agg.ActorItemIds.Add(kvp.Key);
                        }
                        else if (p.Type == PersonKind.Director)
                        {
                            agg.DirectorItemIds.Add(kvp.Key);
                        }
                        else if (p.Type is PersonKind.Writer or PersonKind.Creator)
                        {
                            agg.WriterItemIds.Add(kvp.Key);
                        }
                    }

                    if (credits.Count > 0)
                    {
                        peopleByItem[kvp.Key] = credits;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to batch-load people chunk at offset {Offset}", i);
            }
        }

        var topActors = peopleByName.Values
            .Where(p => p.ActorItemIds.Count >= 3)
            .OrderByDescending(p => p.ActorItemIds.Count)
            .Take(80)
            .ToList();

        var topDirectors = peopleByName.Values
            .Where(p => p.DirectorItemIds.Count >= 2)
            .OrderByDescending(p => p.DirectorItemIds.Count)
            .Take(60)
            .ToList();

        var topWriters = peopleByName.Values
            .Where(p => p.WriterItemIds.Count >= 2)
            .OrderByDescending(p => p.WriterItemIds.Count)
            .Take(60)
            .ToList();

        _logger.LogDebug(
            "Built Prism library index v{Version}: {Items} items, {Genres} genres, {Studios} studios, {People} people",
            version, allItems.Count, byGenre.Count, byStudio.Count, peopleByName.Count);

        return new LibraryIndexSnapshot
        {
            Version = version,
            AllItems = allItems,
            ById = byId,
            ByTmdbMovieId = byTmdbMovieId,
            ByTmdbSeriesId = byTmdbSeriesId,
            ByImdbId = byImdbId,
            ByGenre = byGenre,
            ByStudio = byStudio,
            ByTag = byTag,
            PeopleByItem = peopleByItem,
            PeopleByName = peopleByName,
            TopActors = topActors,
            TopDirectors = topDirectors,
            TopWriters = topWriters
        };
    }

    public List<BaseItem>? GetHomeIncludedParents(User? user)
    {
        if (user == null)
        {
            return null;
        }

        var excluded = _userManager.GetUserDto(user, null)?.Configuration?.LatestItemsExcludes;
        if (excluded == null || excluded.Length == 0)
        {
            return null;
        }

        var root = _libraryManager.GetUserRootFolder();
        if (root == null)
        {
            return null;
        }

        var excludedSet = excluded.ToHashSet();
        return root.GetChildren(user, true)
            .Where(i => i is Folder && !excludedSet.Contains(i.Id))
            .ToList();
    }

    private UserLibraryContext BuildUserContext(Guid userId, LibraryIndexSnapshot snapshot, long userVersion)
    {
        var user = userId != Guid.Empty ? _userManager.GetUserById(userId) : null;
        var includedParents = GetHomeIncludedParents(user);
        if (includedParents is { Count: 0 })
        {
            return new UserLibraryContext
            {
                UserId = userId,
                LibraryVersion = snapshot.Version,
                UserVersion = userVersion,
                AllowedIds = new HashSet<Guid>(),
                IncludedHomeParents = includedParents,
                VisibleItems = new List<IndexedItem>(),
                PlayedIds = new HashSet<Guid>(),
                FavoriteIds = new HashSet<Guid>(),
                WatchlistIds = new HashSet<Guid>(),
                WatchedRecent = new List<(IndexedItem Item, DateTime LastPlayed)>(),
                WatchAgainCandidates = new List<IndexedItem>(),
                UserGenreCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase),
                UserStudioCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
            };
        }

        var visibleQuery = new InternalItemsQuery(user)
        {
            IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Series },
            Recursive = true,
            IsVirtualItem = false
        };

        var visibleBaseItems = includedParents != null
            ? _libraryManager.GetItemList(visibleQuery, includedParents)
            : _libraryManager.GetItemList(visibleQuery);

        var allowedIds = new HashSet<Guid>(visibleBaseItems.Count);
        var visibleItems = new List<IndexedItem>(visibleBaseItems.Count);
        var indexedBaseItems = new List<BaseItem>(visibleBaseItems.Count);

        foreach (var item in visibleBaseItems)
        {
            if (snapshot.ById.TryGetValue(item.Id, out var indexed))
            {
                allowedIds.Add(item.Id);
                visibleItems.Add(indexed);
                indexedBaseItems.Add(item);
            }
        }

        var playedIds = new HashSet<Guid>();
        var favoriteIds = new HashSet<Guid>();
        var watchlistIds = new HashSet<Guid>();
        var watchedRecent = new List<(IndexedItem Item, DateTime LastPlayed)>();
        var watchAgain = new List<IndexedItem>();
        var userGenreCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var userStudioCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        if (user != null && indexedBaseItems.Count > 0)
        {
            var userDataMap = _userDataManager.GetUserDataBatch(indexedBaseItems, user);
            var rewatchCutoff = DateTime.UtcNow.AddDays(-120);

            foreach (var indexed in visibleItems)
            {
                if (!userDataMap.TryGetValue(indexed.Id, out var ud) || ud == null)
                {
                    continue;
                }

                if (ud.IsFavorite)
                {
                    favoriteIds.Add(indexed.Id);
                }

                if (ud.Likes == true)
                {
                    watchlistIds.Add(indexed.Id);
                }

                if (ud.Played)
                {
                    playedIds.Add(indexed.Id);
                    var playedDate = ud.LastPlayedDate ?? indexed.DateCreated;
                    watchedRecent.Add((indexed, playedDate));

                    if (playedDate <= rewatchCutoff && (ud.IsFavorite || (indexed.CommunityRating ?? 0f) >= 7.2f))
                    {
                        watchAgain.Add(indexed);
                    }
                }

                if (ud.Played || ud.IsFavorite || ud.Likes == true)
                {
                    var weight = ud.IsFavorite ? 3 : 1;
                    foreach (var g in indexed.Genres)
                    {
                        userGenreCounts[g] = userGenreCounts.TryGetValue(g, out var c) ? c + weight : weight;
                    }

                    foreach (var s in indexed.Studios)
                    {
                        userStudioCounts[s] = userStudioCounts.TryGetValue(s, out var c) ? c + weight : weight;
                    }
                }
            }
        }

        watchedRecent.Sort((a, b) => b.LastPlayed.CompareTo(a.LastPlayed));
        watchAgain = watchAgain
            .OrderByDescending(i => favoriteIds.Contains(i.Id))
            .ThenByDescending(i => i.CommunityRating ?? 0f)
            .ToList();

        return new UserLibraryContext
        {
            UserId = userId,
            LibraryVersion = snapshot.Version,
            UserVersion = userVersion,
            AllowedIds = allowedIds,
            IncludedHomeParents = includedParents,
            VisibleItems = visibleItems,
            PlayedIds = playedIds,
            FavoriteIds = favoriteIds,
            WatchlistIds = watchlistIds,
            WatchedRecent = watchedRecent,
            WatchAgainCandidates = watchAgain,
            UserGenreCounts = userGenreCounts,
            UserStudioCounts = userStudioCounts
        };
    }

    public void Dispose()
    {
        lock (_dirtyTimerLock)
        {
            _dirtyTimer?.Dispose();
            _dirtyTimer = null;
        }
    }
}

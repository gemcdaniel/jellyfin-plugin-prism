using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using Jellyfin.Plugin.Prism.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Entities;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Prism.Services;

/// <summary>
/// Computes and caches Home Spotlight items, New Releases, Watchlist, Seasonal/Holiday rows &amp; episodes,
/// TMDB-backed trending picks, Thematic Picks, Watchlist toggles, and media quality badges.
/// </summary>
public class HomeSectionService
{
    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _userManager;
    private readonly IUserDataManager _userDataManager;
    private readonly IMediaSourceManager _mediaSourceManager;
    private readonly LibraryIndexService _libraryIndex;
    private readonly TmdbService _tmdbService;
    private readonly IMemoryCache _cache;
    private readonly ILogger<HomeSectionService> _logger;
    private long _configVersion;

    public HomeSectionService(
        ILibraryManager libraryManager,
        IUserManager userManager,
        IUserDataManager userDataManager,
        IMediaSourceManager mediaSourceManager,
        LibraryIndexService libraryIndex,
        TmdbService tmdbService,
        IMemoryCache cache,
        ILogger<HomeSectionService> logger)
    {
        _libraryManager = libraryManager;
        _userManager = userManager;
        _userDataManager = userDataManager;
        _mediaSourceManager = mediaSourceManager;
        _libraryIndex = libraryIndex;
        _tmdbService = tmdbService;
        _cache = cache;
        _logger = logger;

        if (Plugin.Instance != null)
        {
            Plugin.Instance.ConfigurationChanged += (_, _) => Interlocked.Increment(ref _configVersion);
        }
    }

    public long ConfigVersion => Interlocked.Read(ref _configVersion);

    public void InvalidateMediaInfo(Guid itemId)
    {
        if (itemId != Guid.Empty)
        {
            _cache.Remove($"prism_media_info_{itemId:N}");
        }
    }

    public PrismHomeResponse GetHomeSections(Guid userId)
    {
        var now = DateTime.Now;
        var bucket = PrismHash.GetRotationBucket(now);
        var snapshot = _libraryIndex.GetSnapshot();
        var ctx = _libraryIndex.GetUserContext(userId);
        var tmdbVersion = _tmdbService.CacheVersion;
        var cfgVersion = ConfigVersion;

        var cacheKey = $"prism_home_{userId:N}_{bucket}_{snapshot.Version}_{ctx.UserVersion}_{tmdbVersion}_{cfgVersion}";

        if (_cache.TryGetValue(cacheKey, out PrismHomeResponse? cached) && cached != null)
        {
            return cached;
        }

        var response = BuildHomeSections(userId, now, bucket, snapshot, ctx, tmdbVersion, cfgVersion);
        _cache.Set(cacheKey, response, TimeSpan.FromMinutes(15));
        return response;
    }

    public List<BaseItem> GetActiveHolidayItems(User? user, DateTime now, int maxItems)
    {
        var windows = HolidayCatalog.GetActiveWindows(now);
        if (windows.Count == 0)
        {
            return new List<BaseItem>();
        }

        var primaryWindow = windows[0];
        var tmdb = _tmdbService.GetCachedSnapshot();
        tmdb.HolidayMovieSets.TryGetValue(primaryWindow.Id, out var tmdbMovieHits);
        tmdb.HolidayTvSets.TryGetValue(primaryWindow.Id, out var tmdbTvHits);

        var query = new InternalItemsQuery(user)
        {
            IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Series },
            Recursive = true,
            IsVirtualItem = false
        };

        var items = _libraryManager.GetItemList(query)
            .Where(item => item.HasImage(ImageType.Primary))
            .ToList();

        return items
            .Select(item =>
            {
                var tmdbConfirmed = TryGetTmdbId(item, out var tid) && (item.GetBaseItemKind() == BaseItemKind.Series
                    ? tmdbTvHits?.Contains(tid) == true
                    : tmdbMovieHits?.Contains(tid) == true);
                return new { Item = item, Score = HolidayCatalog.ScoreItem(item, primaryWindow, tmdbConfirmed) };
            })
            .Where(x => x.Score > 0)
            .OrderByDescending(x => x.Score)
            .ThenByDescending(x => x.Item.CommunityRating ?? 0f)
            .Take(maxItems)
            .Select(x => x.Item)
            .ToList();
    }

    public PrismThemeDetailResponse? GetThemeItems(Guid userId, string themeId)
    {
        var theme = ThematicCatalog.GetById(themeId);
        if (theme == null)
        {
            return null;
        }

        var now = DateTime.Now;
        var bucket = PrismHash.GetRotationBucket(now);
        var snapshot = _libraryIndex.GetSnapshot();
        var ctx = _libraryIndex.GetUserContext(userId);
        var tmdb = _tmdbService.GetCachedSnapshot();

        tmdb.ThemeMovieSets.TryGetValue(theme.Id, out var tmdbMovies);
        tmdb.ThemeTvSets.TryGetValue(theme.Id, out var tmdbTv);

        var matched = ctx.VisibleItems
            .Select(item => new
            {
                Item = item,
                Score = ScoreThemeItem(item, theme, tmdbMovies, tmdbTv)
            })
            .Where(x => x.Score > 0)
            .OrderByDescending(x => x.Score)
            .ThenByDescending(x => x.Item.CommunityRating ?? 0f)
            .ThenBy(x => PrismHash.StableHash(x.Item.Id, bucket + 5))
            .Take(48)
            .Select(x => ToDto(x.Item, ctx, GetMediaInfo(x.Item)))
            .ToList();

        return new PrismThemeDetailResponse
        {
            Id = theme.Id,
            Group = theme.Group,
            Name = theme.Name,
            Subtitle = theme.Subtitle,
            AccentHex = theme.AccentHex,
            Items = matched
        };
    }

    public PrismWatchlistResponse GetWatchlistIds(Guid userId)
    {
        var ctx = _libraryIndex.GetUserContext(userId);
        return new PrismWatchlistResponse
        {
            Ids = ctx.WatchlistIds.Select(id => id.ToString("N")).ToList()
        };
    }

    public PrismWatchlistToggleResponse? ToggleWatchlist(Guid userId, Guid itemId, bool? desiredState)
    {
        var user = _userManager.GetUserById(userId);
        var item = _libraryManager.GetItemById(itemId);
        if (user == null || item == null)
        {
            return null;
        }

        var userData = _userDataManager.GetUserData(user, item);
        var currentlyLiked = userData?.Likes == true;
        var nextLiked = desiredState ?? !currentlyLiked;

        if (userData != null)
        {
            userData.Likes = nextLiked ? true : null;
            _userDataManager.SaveUserData(user, item, userData, UserDataSaveReason.UpdateUserRating, CancellationToken.None);
        }
        else
        {
            _userDataManager.SaveUserData(
                user,
                item,
                new UpdateUserItemDataDto { Likes = nextLiked },
                UserDataSaveReason.UpdateUserRating);
        }

        _libraryIndex.BumpUserVersion(userId);

        return new PrismWatchlistToggleResponse
        {
            ItemId = item.Id.ToString("N"),
            IsWatchlisted = nextLiked
        };
    }

    public sealed record MediaMetadataInfo(bool Is4k, bool IsHdr, List<string> Badges);

    public Dictionary<string, List<string>> GetBadgesBatch(IEnumerable<Guid> itemIds)
    {
        var result = new Dictionary<string, List<string>>();
        foreach (var id in itemIds.Where(x => x != Guid.Empty).Distinct().Take(120))
        {
            var item = _libraryManager.GetItemById(id);
            if (item == null)
            {
                continue;
            }

            var info = GetMediaInfo(item);
            if (info.Badges.Count > 0)
            {
                result[id.ToString("N")] = info.Badges;
            }
        }

        return result;
    }

    public MediaMetadataInfo GetMediaInfo(IndexedItem item)
    {
        var cacheKey = $"prism_media_info_{item.Id:N}";
        if (_cache.TryGetValue(cacheKey, out MediaMetadataInfo? cached) && cached != null)
        {
            return cached;
        }

        var baseItem = _libraryManager.GetItemById(item.Id);
        if (baseItem == null)
        {
            return new MediaMetadataInfo(item.Width >= 3800, false, item.Width >= 3800 ? new List<string> { "4K" } : new List<string>());
        }

        var info = InspectMediaInfo(baseItem);
        _cache.Set(cacheKey, info, TimeSpan.FromHours(4));
        return info;
    }

    public MediaMetadataInfo GetMediaInfo(BaseItem item)
    {
        var cacheKey = $"prism_media_info_{item.Id:N}";
        if (_cache.TryGetValue(cacheKey, out MediaMetadataInfo? cached) && cached != null)
        {
            return cached;
        }

        var info = InspectMediaInfo(item);
        _cache.Set(cacheKey, info, TimeSpan.FromHours(4));
        return info;
    }

    public PrismItemDto ToDto(
        IndexedItem item,
        UserLibraryContext ctx,
        MediaMetadataInfo info,
        string cardFormat = "Portrait",
        string? reasonTag = null)
    {
        return new PrismItemDto
        {
            Id = item.Id.ToString("N"),
            Name = item.Name,
            Type = item.Kind.ToString(),
            ProductionYear = item.ProductionYear,
            CommunityRating = item.CommunityRating.HasValue ? MathF.Round(item.CommunityRating.Value, 1) : null,
            RunTimeMinutes = item.RunTimeTicks.HasValue
                ? (int)Math.Round(item.RunTimeTicks.Value / (double)TimeSpan.TicksPerMinute)
                : null,
            Is4k = info.Is4k,
            IsHdr = info.IsHdr,
            Badges = info.Badges,
            Overview = item.Overview,
            HasPrimary = item.HasPrimary,
            HasBackdrop = item.HasBackdrop,
            PrimaryImageTag = item.PrimaryImageTag,
            BackdropImageTag = item.BackdropImageTags.Length > 0 ? item.BackdropImageTags[0] : null,
            HasLogo = item.HasLogo,
            LogoImageTag = item.LogoImageTag,
            BackdropCount = item.BackdropCount,
            BackdropImageTags = item.BackdropImageTags.ToList(),
            IsWatchlisted = ctx.WatchlistIds.Contains(item.Id),
            IsFavorite = ctx.FavoriteIds.Contains(item.Id),
            IsPlayed = ctx.PlayedIds.Contains(item.Id),
            ReasonTag = reasonTag,
            CardFormat = cardFormat
        };
    }

    private PrismHomeResponse BuildHomeSections(
        Guid userId,
        DateTime now,
        int bucket,
        LibraryIndexSnapshot snapshot,
        UserLibraryContext ctx,
        long tmdbVersion,
        long cfgVersion)
    {
        var cfg = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        var maxItems = Math.Clamp(cfg.MaxItemsPerRow, 4, 40);
        var user = userId != Guid.Empty ? _userManager.GetUserById(userId) : null;
        var tmdb = _tmdbService.GetCachedSnapshot();

        var response = new PrismHomeResponse
        {
            CacheVersion = $"{bucket}-{snapshot.Version}-{ctx.UserVersion}-{tmdbVersion}-{cfgVersion}",
            RotationBucket = bucket,
            DiscoveryAvailable = cfg.EnableInfiniteDiscovery && ctx.VisibleItems.Count >= 4
        };

        if (ctx.VisibleItems.Count == 0)
        {
            return response;
        }

        var heroHolidayPicks = new List<(IndexedItem Item, string Reason)>();
        var heroTrendingPicks = new List<(IndexedItem Item, string Reason)>();
        var heroNewReleasePicks = new List<(IndexedItem Item, string Reason)>();
        var heroTopRatedPicks = new List<(IndexedItem Item, string Reason)>();

        if (cfg.EnableHomeSections)
        {
            // 1. New Release Movies & Recently Aired Episodes
            var movieDays = Math.Clamp(cfg.NewReleasesDays, 7, 180);
            var movieCutoff = now.Date.AddDays(-movieDays);
            var newMovies = ctx.VisibleItems
                .Where(x => x.Kind == BaseItemKind.Movie
                    && x.PremiereDate.HasValue
                    && x.PremiereDate.Value >= movieCutoff
                    && x.PremiereDate.Value <= now.AddDays(1))
                .OrderByDescending(x => x.PremiereDate)
                .ThenByDescending(x => x.DateCreated)
                .Take(maxItems)
                .ToList();

            if (newMovies.Count < 3)
            {
                var fallbackCutoff = now.Date.AddDays(-Math.Max(movieDays * 2, 90));
                newMovies = ctx.VisibleItems
                    .Where(x => x.Kind == BaseItemKind.Movie
                        && x.PremiereDate.HasValue
                        && x.PremiereDate.Value >= fallbackCutoff
                        && x.PremiereDate.Value <= now.AddDays(1))
                    .OrderByDescending(x => x.PremiereDate)
                    .ThenByDescending(x => x.DateCreated)
                    .Take(maxItems)
                    .ToList();
            }

            if (newMovies.Count >= 3)
            {
                foreach (var m in newMovies.Where(m => m.HasBackdrop).Take(2))
                {
                    heroNewReleasePicks.Add((m, "New Release"));
                }

                response.Sections.Add(new PrismSectionDto
                {
                    Id = "new-releases-movies",
                    Title = "New Release Movies",
                    Subtitle = $"Premiered in the last {movieDays} days",
                    Badge = "New Releases",
                    RenderMode = "Row",
                    CardFormat = "Portrait",
                    Items = newMovies.Select(m => ToDto(m, ctx, GetMediaInfo(m))).ToList()
                });
            }

            var episodeDtos = BuildRecentlyAiredEpisodeDtos(user, ctx.IncludedHomeParents, now, Math.Clamp(cfg.NewReleasesEpisodesDays, 3, 60), maxItems);
            if (episodeDtos.Count >= 3)
            {
                response.Sections.Add(new PrismSectionDto
                {
                    Id = "new-releases-episodes",
                    Title = "Recently Aired Episodes",
                    Subtitle = "Latest TV episodes added to your library",
                    Badge = "New Episodes",
                    RenderMode = "Row",
                    CardFormat = "Thumb",
                    Items = episodeDtos
                });
            }

            // 2. Native Watchlist Row (UserData.Likes)
            if (cfg.EnableWatchlist && ctx.WatchlistIds.Count > 0)
            {
                var watchlistItems = ctx.VisibleItems
                    .Where(x => ctx.WatchlistIds.Contains(x.Id))
                    .OrderByDescending(x => x.DateCreated)
                    .Take(maxItems)
                    .ToList();

                if (watchlistItems.Count > 0)
                {
                    response.Sections.Add(new PrismSectionDto
                    {
                        Id = "prism-watchlist",
                        Title = "Your Watchlist",
                        Subtitle = "Saved for later — automatically clears when watched",
                        Badge = "Watchlist",
                        RenderMode = "Row",
                        CardFormat = "Portrait",
                        Items = watchlistItems.Select(m => ToDto(m, ctx, GetMediaInfo(m))).ToList()
                    });
                }
            }

            // 3. Seasonal & Holiday Picks (+ Holiday Episodes when active)
            if (cfg.EnableHolidayRow)
            {
                var windows = HolidayCatalog.GetActiveWindows(now);
                foreach (var window in windows)
                {
                    tmdb.HolidayMovieSets.TryGetValue(window.Id, out var tmdbMovieHits);
                    tmdb.HolidayTvSets.TryGetValue(window.Id, out var tmdbTvHits);

                    var matches = ctx.VisibleItems
                        .Select(item =>
                        {
                            var confirmed = item.TmdbId.HasValue && (item.Kind == BaseItemKind.Series
                                ? tmdbTvHits?.Contains(item.TmdbId.Value) == true
                                : tmdbMovieHits?.Contains(item.TmdbId.Value) == true);
                            return new
                            {
                                Item = item,
                                Score = HolidayCatalog.ScoreMetadata(
                                    item.Name,
                                    item.Overview,
                                    item.Tags,
                                    item.Genres,
                                    item.CommunityRating,
                                    window,
                                    confirmed)
                            };
                        })
                        .Where(x => x.Score > 0)
                        .OrderByDescending(x => x.Score)
                        .ThenByDescending(x => x.Item.CommunityRating ?? 0f)
                        .ThenBy(x => PrismHash.StableHash(x.Item.Id, bucket + 11))
                        .Take(maxItems)
                        .Select(x => x.Item)
                        .ToList();

                    if (matches.Count >= 3)
                    {
                        foreach (var m in matches.Where(m => m.HasBackdrop).Take(2))
                        {
                            heroHolidayPicks.Add((m, window.Title));
                        }

                        response.Sections.Add(new PrismSectionDto
                        {
                            Id = $"holiday-{window.Id}",
                            Title = window.Title,
                            Subtitle = window.Subtitle,
                            Badge = "Seasonal",
                            RenderMode = "Row",
                            CardFormat = "Portrait",
                            Items = matches.Select(m => ToDto(m, ctx, GetMediaInfo(m))).ToList()
                        });
                    }

                    if (window.IncludeEpisodes && user != null)
                    {
                        var holidayEps = BuildHolidayEpisodeDtos(user, ctx.IncludedHomeParents, window, snapshot.Version, ctx.UserVersion, bucket, maxItems);
                        if (holidayEps.Count >= 3)
                        {
                            response.Sections.Add(new PrismSectionDto
                            {
                                Id = $"holiday-episodes-{window.Id}",
                                Title = $"{window.Title} Episodes",
                                Subtitle = "Holiday TV specials from your series",
                                Badge = "Seasonal TV",
                                RenderMode = "Row",
                                CardFormat = "Thumb",
                                Items = holidayEps
                            });
                        }
                    }
                }
            }

            // 4. TMDB Trending in Library
            var trendingInLibrary = ResolveTmdbRankedItems(ctx, snapshot, tmdb.TrendingMovieRank, tmdb.TrendingTvRank, maxItems);
            if (trendingInLibrary.Count >= 3)
            {
                foreach (var m in trendingInLibrary.Where(m => m.HasBackdrop).Take(2))
                {
                    heroTrendingPicks.Add((m, "Trending Now"));
                }

                response.Sections.Add(new PrismSectionDto
                {
                    Id = "tmdb-trending",
                    Title = "Trending in Your Library",
                    Subtitle = "Matches with this week's TMDB trending movies & shows",
                    Badge = "TMDB Trending",
                    RenderMode = "Row",
                    CardFormat = "Portrait",
                    Items = trendingInLibrary.Select(m => ToDto(m, ctx, GetMediaInfo(m))).ToList()
                });
            }

            // 5. Thematic Picks Tile Strip + Featured Rotating Theme Row
            var populatedThemes = BuildPopulatedThemes(ctx, tmdb, bucket);
            if (populatedThemes.Count >= 2)
            {
                var tileDtos = new List<PrismItemDto>(Math.Min(10, populatedThemes.Count));
                foreach (var entry in populatedThemes.Take(10))
                {
                    var lead = entry.Items.FirstOrDefault(i => i.HasBackdrop) ?? entry.Items[0];
                    tileDtos.Add(new PrismItemDto
                    {
                        Id = lead.Id.ToString("N"),
                        Name = entry.Theme.Name,
                        Subtitle = entry.Theme.Group,
                        Type = "ThematicTheme",
                        ThemeId = entry.Theme.Id,
                        AccentHex = entry.Theme.AccentHex,
                        ItemCount = entry.TotalCount,
                        HasPrimary = lead.HasPrimary,
                        PrimaryImageTag = lead.PrimaryImageTag,
                        HasBackdrop = lead.HasBackdrop,
                        BackdropImageTag = lead.BackdropImageTags.Length > 0 ? lead.BackdropImageTags[0] : null,
                        CardFormat = "Tile"
                    });
                }

                response.Sections.Add(new PrismSectionDto
                {
                    Id = "thematic-picks-grid",
                    Title = "Thematic Picks",
                    Subtitle = "Explore collections curated from your library themes & tags",
                    Badge = "Themes",
                    RenderMode = "ThematicGrid",
                    CardFormat = "Tile",
                    Items = tileDtos
                });

                var featured = populatedThemes[0];
                response.Sections.Add(new PrismSectionDto
                {
                    Id = "thematic-featured",
                    Title = featured.Theme.Name,
                    Subtitle = featured.Theme.Subtitle,
                    Badge = "Thematic Pick",
                    RenderMode = "Row",
                    CardFormat = "Portrait",
                    Items = featured.Items.Take(maxItems).Select(m => ToDto(m, ctx, GetMediaInfo(m))).ToList()
                });
            }

            // 6. Always-on 4K HDR Showcase + 2 Rotating Curated Showcases every 3 days
            if (cfg.Enable4kShowcase)
            {
                var uhdPool = ctx.VisibleItems
                    .Where(item => item.Width >= 3800)
                    .OrderByDescending(item => item.DateCreated)
                    .Take(Math.Max(maxItems * 2, 32))
                    .ToList();

                if (uhdPool.Count < maxItems)
                {
                    var hdPool = ctx.VisibleItems
                        .Where(item => item.Kind == BaseItemKind.Movie && item.Width >= 1900 && item.Width < 3800)
                        .OrderByDescending(item => item.DateCreated)
                        .Take(24);
                    uhdPool.AddRange(hdPool);
                }

                var uhdItems = uhdPool
                    .Select(item => new { Item = item, Flags = GetMediaInfo(item) })
                    .Where(x => x.Flags.Is4k || x.Flags.IsHdr)
                    .OrderByDescending(x => x.Flags.Is4k && x.Flags.IsHdr)
                    .ThenByDescending(x => x.Item.DateCreated)
                    .Take(maxItems)
                    .ToList();

                if (uhdItems.Count >= 3)
                {
                    foreach (var x in uhdItems.Where(x => x.Item.HasBackdrop).Take(2))
                    {
                        heroTopRatedPicks.Add((x.Item, "4K HDR"));
                    }

                    response.Sections.Add(new PrismSectionDto
                    {
                        Id = "4k-hdr-showcase",
                        Title = "4K & HDR Showcase",
                        Subtitle = "Reference quality on your OLED display",
                        Badge = "4K HDR",
                        RenderMode = "Row",
                        CardFormat = "Portrait",
                        Items = uhdItems.Select(x => ToDto(x.Item, ctx, x.Flags)).ToList()
                    });
                }
            }

            var curatedPool = BuildCuratedRotatingCandidates(cfg, ctx, snapshot, tmdb, now, bucket, maxItems);
            foreach (var candidate in curatedPool
                .OrderBy(s => PrismHash.StableHash(s.Id, bucket + 77))
                .Take(2))
            {
                foreach (var indexed in candidate.Items.Where(i => i.HasBackdrop).Take(1))
                {
                    heroTopRatedPicks.Add((indexed, candidate.Title));
                }

                response.Sections.Add(new PrismSectionDto
                {
                    Id = candidate.Id,
                    Title = candidate.Title,
                    Subtitle = candidate.Subtitle,
                    Badge = candidate.Badge,
                    RenderMode = "Row",
                    CardFormat = "Portrait",
                    Items = candidate.Items.Select(m => ToDto(m, ctx, GetMediaInfo(m))).ToList()
                });
            }
        }

        // 7. Hero Spotlight (up to 6 backdrop-backed items, preferring ClearLogo / multi-backdrop)
        if (cfg.EnableHeroSpotlight)
        {
            var recentWithBackdrop = ctx.VisibleItems
                .Where(x => x.HasBackdrop)
                .OrderByDescending(x => x.DateCreated)
                .Take(8)
                .Select(x => (Item: x, Reason: "Recently Added"));

            var combined = heroHolidayPicks
                .Concat(heroTrendingPicks)
                .Concat(heroNewReleasePicks)
                .Concat(heroTopRatedPicks)
                .Concat(recentWithBackdrop)
                .Where(x => x.Item.HasBackdrop)
                .DistinctBy(x => x.Item.Id)
                .OrderByDescending(x => x.Item.HasLogo || x.Item.BackdropCount >= 2)
                .ThenBy(x => PrismHash.StableHash(x.Item.Id, bucket + 19))
                .Take(6)
                .Select(x => ToDto(x.Item, ctx, GetMediaInfo(x.Item), "Backdrop", x.Reason))
                .ToList();

            response.HeroItems = combined;
        }

        return response;
    }

    private IReadOnlyList<BaseItem> QueryWithHomeParents(InternalItemsQuery query, List<BaseItem>? includedParents)
    {
        return includedParents != null
            ? _libraryManager.GetItemList(query, includedParents)
            : _libraryManager.GetItemList(query);
    }

    private List<PrismItemDto> BuildRecentlyAiredEpisodeDtos(User? user, List<BaseItem>? includedParents, DateTime now, int days, int maxItems)
    {
        if (includedParents is { Count: 0 })
        {
            return new List<PrismItemDto>();
        }

        var cutoff = now.Date.AddDays(-days);
        var query = new InternalItemsQuery(user)
        {
            IncludeItemTypes = new[] { BaseItemKind.Episode },
            MinPremiereDate = cutoff,
            MaxPremiereDate = now.AddDays(1),
            Recursive = true,
            IsVirtualItem = false,
            OrderBy = new[] { (ItemSortBy.PremiereDate, SortOrder.Descending), (ItemSortBy.DateCreated, SortOrder.Descending) },
            Limit = 80
        };

        var episodes = QueryWithHomeParents(query, includedParents);

        if (episodes.Count < 3)
        {
            var fallbackCutoff = now.Date.AddDays(-Math.Max(days * 2, 30));
            var fallbackQuery = new InternalItemsQuery(user)
            {
                IncludeItemTypes = new[] { BaseItemKind.Episode },
                MinPremiereDate = fallbackCutoff,
                MaxPremiereDate = now.AddDays(1),
                Recursive = true,
                IsVirtualItem = false,
                OrderBy = new[] { (ItemSortBy.PremiereDate, SortOrder.Descending), (ItemSortBy.DateCreated, SortOrder.Descending) },
                Limit = 80
            };

            episodes = QueryWithHomeParents(fallbackQuery, includedParents);
        }

        return MapDeduplicatedEpisodeDtos(episodes.OfType<Episode>(), maxItems);
    }

    private List<PrismItemDto> BuildHolidayEpisodeDtos(
        User user,
        List<BaseItem>? includedParents,
        HolidayCatalog.HolidayWindow window,
        long libVersion,
        long userVersion,
        int bucket,
        int maxItems)
    {
        if (includedParents is { Count: 0 })
        {
            return new List<PrismItemDto>();
        }

        var cacheKey = $"prism_holiday_eps_{user.Id:N}_{window.Id}_{bucket}_{libVersion}_{userVersion}";
        if (_cache.TryGetValue(cacheKey, out List<PrismItemDto>? cached) && cached != null)
        {
            return cached;
        }

        var tagTerms = window.BoostTags.Concat(window.EpisodeKeywords).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        var candidates = new Dictionary<Guid, BaseItem>();

        var taggedQuery = new InternalItemsQuery(user)
        {
            IncludeItemTypes = new[] { BaseItemKind.Episode },
            Tags = tagTerms,
            Recursive = true,
            IsVirtualItem = false,
            Limit = 60
        };

        var taggedEps = QueryWithHomeParents(taggedQuery, includedParents);

        foreach (var ep in taggedEps)
        {
            candidates.TryAdd(ep.Id, ep);
        }

        if (candidates.Count < 16 && window.EpisodeKeywords.Length > 0)
        {
            var searchQuery = new InternalItemsQuery(user)
            {
                IncludeItemTypes = new[] { BaseItemKind.Episode },
                SearchTerm = window.EpisodeKeywords[0],
                Recursive = true,
                IsVirtualItem = false,
                Limit = 60
            };

            var searchedEps = QueryWithHomeParents(searchQuery, includedParents);

            foreach (var ep in searchedEps)
            {
                candidates.TryAdd(ep.Id, ep);
            }
        }

        var rankedEpisodes = candidates.Values
            .OfType<Episode>()
            .Select(ep => new { Episode = ep, Score = HolidayCatalog.ScoreEpisode(ep, window) })
            .Where(x => x.Score > 0)
            .OrderByDescending(x => x.Score)
            .ThenBy(x => PrismHash.StableHash(x.Episode.Id, bucket + 23))
            .Select(x => x.Episode);

        var dtos = MapDeduplicatedEpisodeDtos(rankedEpisodes, maxItems);
        _cache.Set(cacheKey, dtos, TimeSpan.FromMinutes(60));
        return dtos;
    }

    private List<PrismItemDto> MapDeduplicatedEpisodeDtos(IEnumerable<Episode> episodes, int maxItems)
    {
        var seenSeries = new HashSet<Guid>();
        var dtos = new List<PrismItemDto>(maxItems);

        foreach (var ep in episodes)
        {
            var seriesKey = ep.SeriesId != Guid.Empty ? ep.SeriesId : ep.Id;
            if (!seenSeries.Add(seriesKey))
            {
                continue;
            }

            var hasPrimary = ep.HasImage(ImageType.Primary);
            var primaryInfo = hasPrimary ? ep.GetImageInfo(ImageType.Primary, 0) : null;
            var series = ep.Series;
            var epBackdropInfo = ep.HasImage(ImageType.Backdrop) ? ep.GetImageInfo(ImageType.Backdrop, 0) : null;
            var seriesBackdropInfo = series != null && series.HasImage(ImageType.Backdrop)
                ? series.GetImageInfo(ImageType.Backdrop, 0)
                : null;
            var fallbackPrimary = !hasPrimary && seriesBackdropInfo != null;

            if (!hasPrimary && !fallbackPrimary)
            {
                continue;
            }

            var seasonNum = ep.ParentIndexNumber ?? 0;
            var epNum = ep.IndexNumber ?? 0;
            var epTitle = ep.Name ?? string.Empty;
            var subtitle = seasonNum > 0 && epNum > 0
                ? $"S{seasonNum:D2}E{epNum:D2} · {epTitle}"
                : epTitle;

            var info = GetMediaInfo(ep);
            dtos.Add(new PrismItemDto
            {
                Id = ep.Id.ToString("N"),
                Name = !string.IsNullOrWhiteSpace(ep.SeriesName) ? ep.SeriesName : epTitle,
                Subtitle = subtitle,
                SeriesId = ep.SeriesId != Guid.Empty ? ep.SeriesId.ToString("N") : null,
                SeriesName = ep.SeriesName,
                Type = nameof(BaseItemKind.Episode),
                ProductionYear = ep.ProductionYear ?? ep.PremiereDate?.Year,
                CommunityRating = ep.CommunityRating.HasValue ? MathF.Round(ep.CommunityRating.Value, 1) : null,
                RunTimeMinutes = ep.RunTimeTicks.HasValue
                    ? (int)Math.Round(ep.RunTimeTicks.Value / (double)TimeSpan.TicksPerMinute)
                    : null,
                Is4k = info.Is4k,
                IsHdr = info.IsHdr,
                Badges = info.Badges,
                Overview = ep.Overview ?? string.Empty,
                HasPrimary = hasPrimary,
                PrimaryImageTag = primaryInfo?.DateModified.Ticks.ToString(),
                HasBackdrop = epBackdropInfo != null || seriesBackdropInfo != null,
                BackdropImageTag = (epBackdropInfo ?? seriesBackdropInfo)?.DateModified.Ticks.ToString(),
                CardFormat = "Thumb"
            });

            if (dtos.Count >= maxItems)
            {
                break;
            }
        }

        return dtos;
    }

    private static List<IndexedItem> ResolveTmdbRankedItems(
        UserLibraryContext ctx,
        LibraryIndexSnapshot snapshot,
        Dictionary<int, int> movieRank,
        Dictionary<int, int> tvRank,
        int maxItems)
    {
        var matches = new List<(IndexedItem Item, int Rank)>();

        foreach (var kvp in movieRank)
        {
            if (snapshot.ByTmdbMovieId.TryGetValue(kvp.Key, out var list))
            {
                foreach (var item in list)
                {
                    if (ctx.AllowedIds.Contains(item.Id))
                    {
                        matches.Add((item, kvp.Value));
                    }
                }
            }
        }

        foreach (var kvp in tvRank)
        {
            if (snapshot.ByTmdbSeriesId.TryGetValue(kvp.Key, out var list))
            {
                foreach (var item in list)
                {
                    if (ctx.AllowedIds.Contains(item.Id))
                    {
                        matches.Add((item, kvp.Value));
                    }
                }
            }
        }

        return matches
            .OrderBy(x => x.Rank)
            .DistinctBy(x => x.Item.Id)
            .Take(maxItems)
            .Select(x => x.Item)
            .ToList();
    }

    private static int ScoreThemeItem(
        IndexedItem item,
        ThematicCatalog.ThematicTheme theme,
        HashSet<int>? tmdbMovies,
        HashSet<int>? tmdbTv)
    {
        var tmdbConfirmed = item.TmdbId.HasValue && (item.Kind == BaseItemKind.Series
            ? tmdbTv?.Contains(item.TmdbId.Value) == true
            : tmdbMovies?.Contains(item.TmdbId.Value) == true);

        return ThematicCatalog.ScoreMetadata(
            item.Name,
            item.Overview,
            item.Tags,
            item.Genres,
            item.CommunityRating,
            theme,
            tmdbConfirmed);
    }

    private sealed record PopulatedTheme(ThematicCatalog.ThematicTheme Theme, List<IndexedItem> Items, int TotalCount);

    private static List<PopulatedTheme> BuildPopulatedThemes(UserLibraryContext ctx, TmdbSnapshot tmdb, int bucket)
    {
        var results = new List<PopulatedTheme>();

        foreach (var theme in ThematicCatalog.GetAll())
        {
            tmdb.ThemeMovieSets.TryGetValue(theme.Id, out var tmdbMovies);
            tmdb.ThemeTvSets.TryGetValue(theme.Id, out var tmdbTv);

            var scored = new List<(IndexedItem Item, int Score)>();
            foreach (var item in ctx.VisibleItems)
            {
                var score = ScoreThemeItem(item, theme, tmdbMovies, tmdbTv);
                if (score > 0)
                {
                    scored.Add((item, score));
                }
            }

            if (scored.Count < 3)
            {
                continue;
            }

            var ordered = scored
                .OrderByDescending(x => x.Score)
                .ThenByDescending(x => x.Item.CommunityRating ?? 0f)
                .ThenBy(x => PrismHash.StableHash(x.Item.Id, bucket + 31))
                .Select(x => x.Item)
                .ToList();

            results.Add(new PopulatedTheme(theme, ordered, scored.Count));
        }

        return results
            .OrderBy(r => PrismHash.StableHash(r.Theme.Id, bucket + 33))
            .ToList();
    }

    private sealed record CuratedCandidate(string Id, string Title, string Subtitle, string Badge, List<IndexedItem> Items);

    private static List<CuratedCandidate> BuildCuratedRotatingCandidates(
        PluginConfiguration cfg,
        UserLibraryContext ctx,
        LibraryIndexSnapshot snapshot,
        TmdbSnapshot tmdb,
        DateTime now,
        int bucket,
        int maxItems)
    {
        var pool = new List<CuratedCandidate>();

        if (cfg.EnableCriticallyAcclaimed)
        {
            var acclaimed = ctx.VisibleItems
                .Where(x => (x.CommunityRating ?? 0f) >= 7.8f)
                .OrderByDescending(x => x.CommunityRating ?? 0f)
                .ThenBy(x => PrismHash.StableHash(x.Id, bucket))
                .Take(maxItems)
                .ToList();

            if (acclaimed.Count >= 3)
            {
                pool.Add(new CuratedCandidate(
                    "critically-acclaimed",
                    "Critically Acclaimed",
                    "Top-rated movies and series in your library",
                    "Top Rated",
                    acclaimed));
            }
        }

        if (cfg.EnableQuickWatches)
        {
            const long minTicks = 40L * 60L * TimeSpan.TicksPerSecond;
            const long maxTicks = 100L * 60L * TimeSpan.TicksPerSecond;

            var quick = ctx.VisibleItems
                .Where(x => x.Kind == BaseItemKind.Movie
                    && x.RunTimeTicks.HasValue
                    && x.RunTimeTicks.Value >= minTicks
                    && x.RunTimeTicks.Value <= maxTicks)
                .OrderBy(x => PrismHash.StableHash(x.Id, bucket + 17))
                .Take(maxItems)
                .ToList();

            if (quick.Count >= 3)
            {
                pool.Add(new CuratedCandidate(
                    "quick-watches",
                    "Quick Watches",
                    "Feature films under 100 minutes",
                    "< 100m",
                    quick));
            }
        }

        var popularTmdb = ResolveTmdbRankedItems(ctx, snapshot, tmdb.PopularMovieRank, tmdb.PopularTvRank, maxItems);
        if (popularTmdb.Count >= 3)
        {
            pool.Add(new CuratedCandidate(
                "tmdb-popular",
                "Popular on TMDB",
                "In-theater and widely watched hits in your library",
                "Popular",
                popularTmdb));
        }

        // Decade flashback (rotates every 3 days)
        var decades = new[] { 1970, 1980, 1990, 2000, 2010 }
            .OrderBy(d => PrismHash.StableHash($"decade-{d}", bucket + 53))
            .ToList();

        foreach (var decade in decades)
        {
            var decadeItems = ctx.VisibleItems
                .Where(x => x.ProductionYear.HasValue
                    && x.ProductionYear.Value >= decade
                    && x.ProductionYear.Value < decade + 10
                    && (x.CommunityRating ?? 0f) >= 6.8f)
                .OrderByDescending(x => x.CommunityRating ?? 0f)
                .ThenBy(x => PrismHash.StableHash(x.Id, bucket + 59))
                .Take(maxItems)
                .ToList();

            if (decadeItems.Count >= 4)
            {
                pool.Add(new CuratedCandidate(
                    $"decade-{decade}s",
                    $"{decade}s Essentials",
                    $"Standout cinema & TV from the {decade}s",
                    "Flashback",
                    decadeItems));
                break;
            }
        }

        // Unwatched Hidden Gems
        var hiddenGems = ctx.VisibleItems
            .Where(x => !ctx.PlayedIds.Contains(x.Id)
                && (x.CommunityRating ?? 0f) >= 7.4f
                && x.ProductionYear.HasValue
                && x.ProductionYear.Value <= now.Year - 5)
            .OrderBy(x => PrismHash.StableHash(x.Id, bucket + 67))
            .Take(maxItems)
            .ToList();

        if (hiddenGems.Count >= 4)
        {
            pool.Add(new CuratedCandidate(
                "hidden-gems",
                "Unwatched Hidden Gems",
                "Highly rated library classics you haven't watched yet",
                "Hidden Gems",
                hiddenGems));
        }

        if (cfg.EnableSpotlightGenre)
        {
            var genreGroups = ctx.VisibleItems
                .SelectMany(item => item.Genres.Select(g => new { Genre = g, Item = item }))
                .GroupBy(x => x.Genre, StringComparer.OrdinalIgnoreCase)
                .Where(g => g.Count() >= 6)
                .OrderBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (genreGroups.Count > 0)
            {
                var chosen = genreGroups[Math.Abs(bucket) % genreGroups.Count];
                var spotlightItems = chosen
                    .Select(x => x.Item)
                    .DistinctBy(x => x.Id)
                    .OrderByDescending(x => x.CommunityRating ?? 0f)
                    .ThenBy(x => PrismHash.StableHash(x.Id, bucket + 31))
                    .Take(maxItems)
                    .ToList();

                pool.Add(new CuratedCandidate(
                    "spotlight-genre",
                    $"Spotlight: {chosen.Key}",
                    "Rotating genre highlight",
                    "Genre Pick",
                    spotlightItems));
            }
        }

        return pool;
    }

    private MediaMetadataInfo InspectMediaInfo(BaseItem item)
    {
        BaseItem? target = item;
        var kind = item.GetBaseItemKind();
        if (kind is BaseItemKind.Series or BaseItemKind.Season)
        {
            target = _libraryManager.GetItemList(new InternalItemsQuery
            {
                AncestorIds = new[] { item.Id },
                IncludeItemTypes = new[] { BaseItemKind.Episode },
                Recursive = true,
                Limit = 1,
                OrderBy = new[] { (ItemSortBy.DateCreated, SortOrder.Descending) }
            }).FirstOrDefault();

            if (target == null)
            {
                return new MediaMetadataInfo(false, false, new List<string>());
            }
        }

        var is4k = target.Width >= 3800;
        var isHdr = false;
        var hasDv = false;
        var hasHdr10Plus = false;
        var hasAtmos = false;
        var hasDtsX = false;

        if (target is Video)
        {
            try
            {
                var streams = _mediaSourceManager.GetMediaStreams(target.Id);
                foreach (var s in streams)
                {
                    if (s.Type == MediaStreamType.Video)
                    {
                        if ((s.Width ?? 0) >= 3800)
                        {
                            is4k = true;
                        }

                        if (s.VideoRangeType is VideoRangeType.DOVI
                            or VideoRangeType.DOVIWithHDR10
                            or VideoRangeType.DOVIWithHLG
                            or VideoRangeType.DOVIWithSDR
                            or VideoRangeType.DOVIWithEL
                            or VideoRangeType.DOVIWithHDR10Plus
                            or VideoRangeType.DOVIWithELHDR10Plus)
                        {
                            hasDv = true;
                            isHdr = true;
                        }
                        else if (s.VideoRangeType == VideoRangeType.HDR10Plus)
                        {
                            hasHdr10Plus = true;
                            isHdr = true;
                        }

                        if (s.VideoRange == VideoRange.HDR)
                        {
                            isHdr = true;
                        }
                    }
                    else if (s.Type == MediaStreamType.Audio)
                    {
                        if (s.AudioSpatialFormat == AudioSpatialFormat.DolbyAtmos
                            || (s.Profile?.Contains("Atmos", StringComparison.OrdinalIgnoreCase) ?? false)
                            || (s.Title?.Contains("Atmos", StringComparison.OrdinalIgnoreCase) ?? false))
                        {
                            hasAtmos = true;
                        }
                        else if (s.AudioSpatialFormat == AudioSpatialFormat.DTSX
                            || (s.Profile?.Contains("DTS:X", StringComparison.OrdinalIgnoreCase) ?? false)
                            || (s.Title?.Contains("DTS:X", StringComparison.OrdinalIgnoreCase) ?? false))
                        {
                            hasDtsX = true;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Unable to inspect media streams for {ItemId}", target.Id);
            }
        }

        var badges = new List<string>(2);
        if (is4k)
        {
            badges.Add("4K");
        }

        if (hasDv)
        {
            badges.Add("DV");
        }
        else if (hasHdr10Plus)
        {
            badges.Add("HDR10+");
        }
        else if (isHdr)
        {
            badges.Add("HDR");
        }

        if (badges.Count < 2)
        {
            if (hasAtmos)
            {
                badges.Add("ATMOS");
            }
            else if (hasDtsX)
            {
                badges.Add("DTS:X");
            }
        }

        return new MediaMetadataInfo(is4k, isHdr, badges);
    }

    private static bool TryGetTmdbId(BaseItem item, out int tmdbId)
    {
        tmdbId = 0;
        if (item.ProviderIds == null)
        {
            return false;
        }

        foreach (var kvp in item.ProviderIds)
        {
            if (kvp.Key.Equals("Tmdb", StringComparison.OrdinalIgnoreCase)
                && int.TryParse(kvp.Value, out tmdbId)
                && tmdbId > 0)
            {
                return true;
            }
        }

        return false;
    }
}

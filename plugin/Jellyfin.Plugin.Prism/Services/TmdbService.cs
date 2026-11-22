using System.Net.Http.Headers;
using System.Text.Json;
using Jellyfin.Plugin.Prism.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Net;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Prism.Services;

public sealed class TmdbCacheData
{
    public DateTimeOffset LastUpdatedUtc { get; set; } = DateTimeOffset.MinValue;
    public int RotationBucket { get; set; }
    public List<int> TrendingMovieIds { get; set; } = new();
    public List<int> TrendingTvIds { get; set; } = new();
    public List<int> PopularMovieIds { get; set; } = new();
    public List<int> PopularTvIds { get; set; } = new();
    public Dictionary<string, List<int>> HolidayMovies { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, List<int>> HolidayTv { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, List<int>> ThemeMovies { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, List<int>> ThemeTv { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class TmdbSnapshot
{
    public static readonly TmdbSnapshot Empty = new(new TmdbCacheData());

    public TmdbSnapshot(TmdbCacheData data)
    {
        Data = data;
        TrendingMovieRank = BuildRankMap(data.TrendingMovieIds);
        TrendingTvRank = BuildRankMap(data.TrendingTvIds);
        PopularMovieRank = BuildRankMap(data.PopularMovieIds);
        PopularTvRank = BuildRankMap(data.PopularTvIds);
        HolidayMovieSets = BuildSetMap(data.HolidayMovies);
        HolidayTvSets = BuildSetMap(data.HolidayTv);
        ThemeMovieSets = BuildSetMap(data.ThemeMovies);
        ThemeTvSets = BuildSetMap(data.ThemeTv);
    }

    public TmdbCacheData Data { get; }
    public Dictionary<int, int> TrendingMovieRank { get; }
    public Dictionary<int, int> TrendingTvRank { get; }
    public Dictionary<int, int> PopularMovieRank { get; }
    public Dictionary<int, int> PopularTvRank { get; }
    public Dictionary<string, HashSet<int>> HolidayMovieSets { get; }
    public Dictionary<string, HashSet<int>> HolidayTvSets { get; }
    public Dictionary<string, HashSet<int>> ThemeMovieSets { get; }
    public Dictionary<string, HashSet<int>> ThemeTvSets { get; }

    public bool HasAnyData =>
        TrendingMovieRank.Count > 0
        || TrendingTvRank.Count > 0
        || PopularMovieRank.Count > 0
        || PopularTvRank.Count > 0
        || HolidayMovieSets.Count > 0
        || ThemeMovieSets.Count > 0;

    private static Dictionary<int, int> BuildRankMap(List<int> ids)
    {
        var map = new Dictionary<int, int>(ids.Count);
        for (var i = 0; i < ids.Count; i++)
        {
            map.TryAdd(ids[i], i);
        }

        return map;
    }

    private static Dictionary<string, HashSet<int>> BuildSetMap(Dictionary<string, List<int>> source)
    {
        var result = new Dictionary<string, HashSet<int>>(source.Count, StringComparer.OrdinalIgnoreCase);
        foreach (var kvp in source)
        {
            result[kvp.Key] = kvp.Value.ToHashSet();
        }

        return result;
    }
}

/// <summary>
/// Polls TMDB endpoints in the background and persists results to disk so Home/Discovery requests never block on external I/O.
/// </summary>
public class TmdbService
{
    private const string BaseUrl = "https://api.themoviedb.org/3";
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = false
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<TmdbService> _logger;
    private readonly string _cacheFilePath;
    private readonly SemaphoreSlim _refreshLock = new(1, 1);
    private readonly object _snapshotLock = new();

    private TmdbSnapshot? _snapshot;
    private long _cacheVersion;
    private int _backgroundQueued;

    public TmdbService(
        IHttpClientFactory httpClientFactory,
        IApplicationPaths applicationPaths,
        ILogger<TmdbService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _cacheFilePath = Path.Combine(applicationPaths.CachePath, "Prism", "tmdb-cache.json");
    }

    public long CacheVersion => Interlocked.Read(ref _cacheVersion);

    public bool IsConfigured => !string.IsNullOrWhiteSpace(GetApiKey());

    public static bool IsBearerToken(string? key)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return false;
        }

        var trimmed = key.Trim();
        return trimmed.Length > 60 && trimmed.StartsWith("eyJ", StringComparison.Ordinal);
    }

    public TmdbSnapshot GetCachedSnapshot()
    {
        lock (_snapshotLock)
        {
            if (_snapshot != null)
            {
                return _snapshot;
            }

            _snapshot = LoadFromDisk();
            return _snapshot;
        }
    }

    public bool IsStale(TimeSpan maxAge)
    {
        var snap = GetCachedSnapshot();
        if (snap.Data.LastUpdatedUtc == DateTimeOffset.MinValue)
        {
            return true;
        }

        if (DateTimeOffset.UtcNow - snap.Data.LastUpdatedUtc > maxAge)
        {
            return true;
        }

        var currentBucket = PrismHash.GetRotationBucket(DateTime.Now);
        return snap.Data.RotationBucket != currentBucket;
    }

    public void TriggerBackgroundRefreshIfNeeded(bool force = false)
    {
        if (!IsConfigured)
        {
            return;
        }

        if (!force && !IsStale(TimeSpan.FromHours(12)))
        {
            return;
        }

        if (Interlocked.CompareExchange(ref _backgroundQueued, 1, 0) != 0)
        {
            return;
        }

        _ = Task.Run(async () =>
        {
            try
            {
                await RefreshAsync(CancellationToken.None).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Background TMDB refresh encountered an unexpected error.");
            }
            finally
            {
                Interlocked.Exchange(ref _backgroundQueued, 0);
            }
        });
    }

    public async Task RefreshAsync(CancellationToken cancellationToken)
    {
        var apiKey = GetApiKey();
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogDebug("TMDB API key not configured; skipping TMDB refresh.");
            return;
        }

        await _refreshLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var previous = GetCachedSnapshot().Data;
            var now = DateTime.Now;
            var bucket = PrismHash.GetRotationBucket(now);

            var next = new TmdbCacheData
            {
                LastUpdatedUtc = DateTimeOffset.UtcNow,
                RotationBucket = bucket,
                TrendingMovieIds = new List<int>(previous.TrendingMovieIds),
                TrendingTvIds = new List<int>(previous.TrendingTvIds),
                PopularMovieIds = new List<int>(previous.PopularMovieIds),
                PopularTvIds = new List<int>(previous.PopularTvIds),
                HolidayMovies = new Dictionary<string, List<int>>(previous.HolidayMovies, StringComparer.OrdinalIgnoreCase),
                HolidayTv = new Dictionary<string, List<int>>(previous.HolidayTv, StringComparer.OrdinalIgnoreCase),
                ThemeMovies = new Dictionary<string, List<int>>(StringComparer.OrdinalIgnoreCase),
                ThemeTv = new Dictionary<string, List<int>>(StringComparer.OrdinalIgnoreCase)
            };

            var anyUpdated = false;

            var trendingMovies = await FetchPagedIdsAsync(apiKey, "/trending/movie/week", 2, cancellationToken).ConfigureAwait(false);
            if (trendingMovies.Count > 0)
            {
                next.TrendingMovieIds = trendingMovies;
                anyUpdated = true;
            }

            var trendingTv = await FetchPagedIdsAsync(apiKey, "/trending/tv/week", 2, cancellationToken).ConfigureAwait(false);
            if (trendingTv.Count > 0)
            {
                next.TrendingTvIds = trendingTv;
                anyUpdated = true;
            }

            var nowPlayingMovies = await FetchPagedIdsAsync(apiKey, "/movie/now_playing", 1, cancellationToken).ConfigureAwait(false);
            var popularMovies = await FetchPagedIdsAsync(apiKey, "/movie/popular", 1, cancellationToken).ConfigureAwait(false);
            if (nowPlayingMovies.Count > 0 || popularMovies.Count > 0)
            {
                next.PopularMovieIds = nowPlayingMovies.Concat(popularMovies).Distinct().ToList();
                anyUpdated = true;
            }

            var popularTv = await FetchPagedIdsAsync(apiKey, "/tv/popular", 1, cancellationToken).ConfigureAwait(false);
            if (popularTv.Count > 0)
            {
                next.PopularTvIds = popularTv;
                anyUpdated = true;
            }

            // Active holiday windows
            var activeWindows = HolidayCatalog.GetActiveWindows(now);
            foreach (var window in activeWindows)
            {
                if (window.TmdbKeywordIds.Length == 0)
                {
                    continue;
                }

                var kwParam = string.Join("|", window.TmdbKeywordIds);
                var movieHolidays = await FetchPagedIdsAsync(
                    apiKey,
                    $"/discover/movie?with_keywords={Uri.EscapeDataString(kwParam)}&sort_by=vote_count.desc",
                    2,
                    cancellationToken).ConfigureAwait(false);
                if (movieHolidays.Count > 0)
                {
                    next.HolidayMovies[window.Id] = movieHolidays;
                    anyUpdated = true;
                }

                var tvHolidays = await FetchPagedIdsAsync(
                    apiKey,
                    $"/discover/tv?with_keywords={Uri.EscapeDataString(kwParam)}&sort_by=vote_count.desc",
                    1,
                    cancellationToken).ConfigureAwait(false);
                if (tvHolidays.Count > 0)
                {
                    next.HolidayTv[window.Id] = tvHolidays;
                    anyUpdated = true;
                }
            }

            // Top 3 rotating Thematic themes for the current 3-day bucket
            var rotatingThemes = ThematicCatalog.GetAll()
                .Where(t => t.TmdbKeywordIds.Length > 0)
                .OrderBy(t => PrismHash.StableHash(t.Id, bucket + 101))
                .Take(3)
                .ToList();

            foreach (var theme in rotatingThemes)
            {
                var kwParam = string.Join("|", theme.TmdbKeywordIds);
                var themeMovies = await FetchPagedIdsAsync(
                    apiKey,
                    $"/discover/movie?with_keywords={Uri.EscapeDataString(kwParam)}&sort_by=vote_count.desc",
                    1,
                    cancellationToken).ConfigureAwait(false);
                if (themeMovies.Count > 0)
                {
                    next.ThemeMovies[theme.Id] = themeMovies;
                    anyUpdated = true;
                }

                var themeTv = await FetchPagedIdsAsync(
                    apiKey,
                    $"/discover/tv?with_keywords={Uri.EscapeDataString(kwParam)}&sort_by=vote_count.desc",
                    1,
                    cancellationToken).ConfigureAwait(false);
                if (themeTv.Count > 0)
                {
                    next.ThemeTv[theme.Id] = themeTv;
                    anyUpdated = true;
                }
            }

            if (!anyUpdated)
            {
                _logger.LogWarning("TMDB refresh completed without updating any datasets; keeping existing cache.");
                return;
            }

            SaveToDisk(next);
            lock (_snapshotLock)
            {
                _snapshot = new TmdbSnapshot(next);
            }

            Interlocked.Increment(ref _cacheVersion);
            _logger.LogInformation(
                "TMDB cache refreshed (bucket={Bucket}, trendingMovies={TM}, trendingTv={TT}, popularMovies={PM}, holidays={H}, themes={Th})",
                bucket,
                next.TrendingMovieIds.Count,
                next.TrendingTvIds.Count,
                next.PopularMovieIds.Count,
                next.HolidayMovies.Count,
                next.ThemeMovies.Count);
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    private static string GetApiKey()
    {
        return (Plugin.Instance?.Configuration ?? new PluginConfiguration()).TmdbApiKey?.Trim() ?? string.Empty;
    }

    private async Task<List<int>> FetchPagedIdsAsync(string apiKey, string relativePathAndQuery, int pages, CancellationToken ct)
    {
        var ids = new List<int>();
        for (var page = 1; page <= pages; page++)
        {
            var sep = relativePathAndQuery.Contains('?') ? '&' : '?';
            var path = $"{relativePathAndQuery}{sep}page={page}";
            var pageIds = await FetchSinglePageIdsAsync(apiKey, path, ct).ConfigureAwait(false);
            if (pageIds.Count == 0)
            {
                break;
            }

            ids.AddRange(pageIds);
        }

        return ids.Distinct().ToList();
    }

    private async Task<List<int>> FetchSinglePageIdsAsync(string apiKey, string relativePathAndQuery, CancellationToken ct)
    {
        var isBearer = IsBearerToken(apiKey);
        var url = $"{BaseUrl}{relativePathAndQuery}";
        if (!isBearer)
        {
            var sep = url.Contains('?') ? '&' : '?';
            url = $"{url}{sep}api_key={Uri.EscapeDataString(apiKey)}";
        }

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeoutCts.CancelAfter(TimeSpan.FromSeconds(10));

        try
        {
            var client = _httpClientFactory.CreateClient(NamedClient.Default);
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            if (isBearer)
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            }

            using var response = await client.SendAsync(request, timeoutCts.Token).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("TMDB request {Path} failed with status {Status}", relativePathAndQuery, (int)response.StatusCode);
                return new List<int>();
            }

            await using var stream = await response.Content.ReadAsStreamAsync(timeoutCts.Token).ConfigureAwait(false);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: timeoutCts.Token).ConfigureAwait(false);

            var ids = new List<int>();
            if (doc.RootElement.TryGetProperty("results", out var results) && results.ValueKind == JsonValueKind.Array)
            {
                foreach (var entry in results.EnumerateArray())
                {
                    if (entry.TryGetProperty("id", out var idProp) && idProp.TryGetInt32(out var id) && id > 0)
                    {
                        ids.Add(id);
                    }
                }
            }

            return ids;
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            _logger.LogWarning("TMDB request {Path} timed out after 10s.", relativePathAndQuery);
            return new List<int>();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "TMDB request {Path} failed.", relativePathAndQuery);
            return new List<int>();
        }
    }

    private TmdbSnapshot LoadFromDisk()
    {
        try
        {
            if (!File.Exists(_cacheFilePath))
            {
                return TmdbSnapshot.Empty;
            }

            var json = File.ReadAllText(_cacheFilePath);
            var data = JsonSerializer.Deserialize<TmdbCacheData>(json, JsonOptions);
            return data != null ? new TmdbSnapshot(data) : TmdbSnapshot.Empty;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read cached TMDB file {Path}; starting with empty cache.", _cacheFilePath);
            return TmdbSnapshot.Empty;
        }
    }

    private void SaveToDisk(TmdbCacheData data)
    {
        try
        {
            var dir = Path.GetDirectoryName(_cacheFilePath);
            if (!string.IsNullOrEmpty(dir))
            {
                Directory.CreateDirectory(dir);
            }

            var tmpPath = $"{_cacheFilePath}.tmp";
            var json = JsonSerializer.Serialize(data, JsonOptions);
            File.WriteAllText(tmpPath, json);
            File.Move(tmpPath, _cacheFilePath, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to persist TMDB cache file {Path}.", _cacheFilePath);
        }
    }
}

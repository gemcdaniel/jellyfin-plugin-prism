using System.Collections.Concurrent;
using Jellyfin.Data.Enums;
using Jellyfin.Data.Events;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Plugin.Prism.Configuration;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Plugins;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Prism.Services;

/// <summary>
/// Hooks Jellyfin library &amp; user-data events to bust Prism caches cleanly, auto-remove watched items from
/// the native Watchlist (UserData.Likes), and trigger background TMDB polling when configured.
/// </summary>
public sealed class PrismLifecycleService : IHostedService, IDisposable
{
    private readonly ILibraryManager _libraryManager;
    private readonly IUserDataManager _userDataManager;
    private readonly IUserManager _userManager;
    private readonly LibraryIndexService _libraryIndex;
    private readonly HomeSectionService _homeSectionService;
    private readonly TmdbService _tmdbService;
    private readonly ILogger<PrismLifecycleService> _logger;

    private readonly ConcurrentDictionary<(Guid UserId, Guid ItemId), byte> _autoRemoveGuard = new();
    private CancellationTokenSource? _warmupCts;
    private string _lastTmdbKey = string.Empty;
    private bool _subscribed;

    public PrismLifecycleService(
        ILibraryManager libraryManager,
        IUserDataManager userDataManager,
        IUserManager userManager,
        LibraryIndexService libraryIndex,
        HomeSectionService homeSectionService,
        TmdbService tmdbService,
        ILogger<PrismLifecycleService> logger)
    {
        _libraryManager = libraryManager;
        _userDataManager = userDataManager;
        _userManager = userManager;
        _libraryIndex = libraryIndex;
        _homeSectionService = homeSectionService;
        _tmdbService = tmdbService;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (!_subscribed)
        {
            _libraryManager.ItemAdded += OnLibraryItemChanged;
            _libraryManager.ItemUpdated += OnLibraryItemChanged;
            _libraryManager.ItemRemoved += OnLibraryItemChanged;
            _userDataManager.UserDataSaved += OnUserDataSaved;
            _userManager.OnUserUpdated += OnUserUpdated;

            if (Plugin.Instance != null)
            {
                _lastTmdbKey = (Plugin.Instance.Configuration?.TmdbApiKey ?? string.Empty).Trim();
                Plugin.Instance.ConfigurationChanged += OnConfigurationChanged;
            }

            _subscribed = true;
        }

        _tmdbService.TriggerBackgroundRefreshIfNeeded(force: false);
        StartBackgroundWarmup();
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _warmupCts?.Cancel();
        Unsubscribe();
        return Task.CompletedTask;
    }

    private void StartBackgroundWarmup()
    {
        _warmupCts?.Cancel();
        _warmupCts?.Dispose();
        _warmupCts = new CancellationTokenSource();
        var token = _warmupCts.Token;

        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(5), token).ConfigureAwait(false);
                if (token.IsCancellationRequested)
                {
                    return;
                }

                _libraryIndex.GetSnapshot();
                foreach (var user in _userManager.GetUsers().Take(5))
                {
                    if (token.IsCancellationRequested)
                    {
                        break;
                    }

                    _homeSectionService.GetHomeSections(user.Id);
                }

                _logger.LogDebug("Prism startup background warmup completed.");
            }
            catch (OperationCanceledException)
            {
                // Ignore cancellation during host shutdown
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Prism background warmup skipped.");
            }
        }, CancellationToken.None);
    }

    private void OnUserUpdated(object? sender, GenericEventArgs<User> e)
    {
        if (e.Argument != null)
        {
            _libraryIndex.BumpUserVersion(e.Argument.Id);
        }
    }

    private void OnLibraryItemChanged(object? sender, ItemChangeEventArgs e)
    {
        var item = e.Item;
        if (item == null)
        {
            return;
        }

        var kind = item.GetBaseItemKind();
        if (kind is not (BaseItemKind.Movie or BaseItemKind.Series or BaseItemKind.Episode))
        {
            return;
        }

        _homeSectionService.InvalidateMediaInfo(item.Id);
        if (kind is BaseItemKind.Movie or BaseItemKind.Series)
        {
            _libraryIndex.MarkLibraryDirtyDebounced();
        }
        else
        {
            // Episodes affect Recently Aired Episodes & Series badges; mark dirty cleanly.
            _libraryIndex.MarkLibraryDirtyDebounced();
        }
    }

    private void OnUserDataSaved(object? sender, UserDataSaveEventArgs e)
    {
        if (e.SaveReason is UserDataSaveReason.PlaybackProgress or UserDataSaveReason.PlaybackStart)
        {
            return;
        }

        _libraryIndex.BumpUserVersion(e.UserId);

        var cfg = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        if (!cfg.EnablePlugin || !cfg.EnableWatchlist)
        {
            return;
        }

        if (e.Item == null || e.UserData == null)
        {
            return;
        }

        if (!e.UserData.Played || e.UserData.Likes != true)
        {
            return;
        }

        if (e.SaveReason is not (UserDataSaveReason.PlaybackFinished or UserDataSaveReason.TogglePlayed))
        {
            return;
        }

        var key = (e.UserId, e.Item.Id);
        if (!_autoRemoveGuard.TryAdd(key, 0))
        {
            return;
        }

        try
        {
            var user = _userManager.GetUserById(e.UserId);
            if (user == null)
            {
                return;
            }

            e.UserData.Likes = null;
            _userDataManager.SaveUserData(user, e.Item, e.UserData, UserDataSaveReason.UpdateUserRating, CancellationToken.None);
            _libraryIndex.BumpUserVersion(e.UserId);
            _logger.LogDebug("Auto-removed watched item {ItemId} from Watchlist for user {UserId}", e.Item.Id, e.UserId);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to auto-remove item {ItemId} from Watchlist", e.Item.Id);
        }
        finally
        {
            _autoRemoveGuard.TryRemove(key, out _);
        }
    }

    private void OnConfigurationChanged(object? sender, BasePluginConfiguration updatedConfig)
    {
        var currentKey = (updatedConfig as PluginConfiguration)?.TmdbApiKey?.Trim()
            ?? (Plugin.Instance?.Configuration?.TmdbApiKey ?? string.Empty).Trim();
        if (!string.IsNullOrEmpty(currentKey) && !string.Equals(currentKey, _lastTmdbKey, StringComparison.Ordinal))
        {
            _lastTmdbKey = currentKey;
            _tmdbService.TriggerBackgroundRefreshIfNeeded(force: true);
        }
        else
        {
            _lastTmdbKey = currentKey;
        }
    }

    private void Unsubscribe()
    {
        if (!_subscribed)
        {
            return;
        }

        _libraryManager.ItemAdded -= OnLibraryItemChanged;
        _libraryManager.ItemUpdated -= OnLibraryItemChanged;
        _libraryManager.ItemRemoved -= OnLibraryItemChanged;
        _userDataManager.UserDataSaved -= OnUserDataSaved;
        _userManager.OnUserUpdated -= OnUserUpdated;

        if (Plugin.Instance != null)
        {
            Plugin.Instance.ConfigurationChanged -= OnConfigurationChanged;
        }

        _subscribed = false;
    }

    public void Dispose()
    {
        _warmupCts?.Cancel();
        _warmupCts?.Dispose();
        _warmupCts = null;
        Unsubscribe();
    }
}

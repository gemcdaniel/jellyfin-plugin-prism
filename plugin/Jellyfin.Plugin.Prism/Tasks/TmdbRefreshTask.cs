using Jellyfin.Plugin.Prism.Services;
using MediaBrowser.Model.Tasks;

namespace Jellyfin.Plugin.Prism.Tasks;

/// <summary>
/// Scheduled task that refreshes TMDB Trending, Popular, Holiday, and Thematic matches in the background.
/// </summary>
public class TmdbRefreshTask : IScheduledTask
{
    private readonly TmdbService _tmdbService;

    public TmdbRefreshTask(TmdbService tmdbService)
    {
        _tmdbService = tmdbService;
    }

    public string Name => "Refresh Prism TMDB Dynamic & Holiday Feeds";

    public string Key => "PrismTmdbRefresh";

    public string Description =>
        "Polls TMDB trending, popular, active holiday, and rotating theme lists in the background and matches them against your library.";

    public string Category => "Prism";

    public async Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
    {
        progress.Report(10);
        if (!_tmdbService.IsConfigured)
        {
            progress.Report(100);
            return;
        }

        await _tmdbService.RefreshAsync(cancellationToken).ConfigureAwait(false);
        progress.Report(100);
    }

    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
    {
        return new[]
        {
            new TaskTriggerInfo
            {
                Type = TaskTriggerInfoType.IntervalTrigger,
                IntervalTicks = TimeSpan.FromHours(12).Ticks
            }
        };
    }
}

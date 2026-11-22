using Jellyfin.Data.Enums;
using Jellyfin.Plugin.Prism.Configuration;
using Jellyfin.Plugin.Prism.Services;
using MediaBrowser.Controller.Collections;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Prism.Tasks;

/// <summary>
/// Optional scheduled task that syncs active seasonal/holiday picks into a native Jellyfin BoxSet
/// so native clients (including Android TV) display the holiday collection.
/// </summary>
public class HolidayCollectionTask : IScheduledTask
{
    private readonly ILibraryManager _libraryManager;
    private readonly ICollectionManager _collectionManager;
    private readonly HomeSectionService _homeSectionService;
    private readonly ILogger<HolidayCollectionTask> _logger;

    public HolidayCollectionTask(
        ILibraryManager libraryManager,
        ICollectionManager collectionManager,
        HomeSectionService homeSectionService,
        ILogger<HolidayCollectionTask> logger)
    {
        _libraryManager = libraryManager;
        _collectionManager = collectionManager;
        _homeSectionService = homeSectionService;
        _logger = logger;
    }

    public string Name => "Sync Prism Seasonal Holiday Collection";

    public string Key => "PrismHolidayCollectionSync";

    public string Description =>
        "Creates or updates the configured seasonal/holiday collection so native clients such as Android TV surface active holiday picks.";

    public string Category => "Prism";

    public async Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
    {
        var cfg = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        if (!cfg.EnablePlugin || !cfg.SyncHolidayCollection)
        {
            progress.Report(100);
            return;
        }

        progress.Report(10);
        var collectionName = string.IsNullOrWhiteSpace(cfg.HolidayCollectionName)
            ? "Seasonal & Holiday Picks"
            : cfg.HolidayCollectionName.Trim();

        var maxItems = Math.Clamp(cfg.MaxItemsPerRow, 4, 40);
        var desiredItems = _homeSectionService.GetActiveHolidayItems(null, DateTime.Now, maxItems);
        var desiredIds = desiredItems.Select(i => i.Id).ToHashSet();

        progress.Report(45);

        var existingBoxSet = _libraryManager.GetItemList(new InternalItemsQuery
        {
            IncludeItemTypes = new[] { BaseItemKind.BoxSet },
            Name = collectionName,
            Recursive = true
        }).OfType<BoxSet>().FirstOrDefault();

        if (existingBoxSet == null)
        {
            if (desiredIds.Count == 0)
            {
                _logger.LogInformation("No matching seasonal items found; skipping creation of {Name}", collectionName);
                progress.Report(100);
                return;
            }

            await _collectionManager.CreateCollectionAsync(new CollectionCreationOptions
            {
                Name = collectionName,
                ItemIdList = desiredIds.Select(id => id.ToString("N")).ToArray(),
                IsLocked = false
            }).ConfigureAwait(false);

            _logger.LogInformation("Created Prism seasonal collection {Name} with {Count} items", collectionName, desiredIds.Count);
            progress.Report(100);
            return;
        }

        var currentIds = existingBoxSet.GetLinkedChildren().Select(c => c.Id).ToHashSet();
        var toAdd = desiredIds.Where(id => !currentIds.Contains(id)).ToArray();
        var toRemove = currentIds.Where(id => !desiredIds.Contains(id)).ToArray();

        if (toRemove.Length > 0)
        {
            await _collectionManager.RemoveFromCollectionAsync(existingBoxSet.Id, toRemove).ConfigureAwait(false);
        }

        if (toAdd.Length > 0)
        {
            await _collectionManager.AddToCollectionAsync(existingBoxSet.Id, toAdd).ConfigureAwait(false);
        }

        _logger.LogInformation(
            "Updated Prism seasonal collection {Name}: +{Added} / -{Removed} ({Total} items)",
            collectionName, toAdd.Length, toRemove.Length, desiredIds.Count);

        progress.Report(100);
    }

    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
    {
        return new[]
        {
            new TaskTriggerInfo
            {
                Type = TaskTriggerInfoType.DailyTrigger,
                TimeOfDayTicks = TimeSpan.FromHours(3).Ticks
            }
        };
    }
}

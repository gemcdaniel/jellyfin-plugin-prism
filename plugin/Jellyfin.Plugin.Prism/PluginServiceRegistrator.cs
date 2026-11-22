using Jellyfin.Plugin.Prism.Middleware;
using Jellyfin.Plugin.Prism.Services;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.Prism;

/// <summary>
/// Registers Prism middleware, services, and lifecycle hooks with Jellyfin's DI container.
/// </summary>
public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddTransient<IStartupFilter, PrismStartupFilter>();
        serviceCollection.AddSingleton<TmdbService>();
        serviceCollection.AddSingleton<LibraryIndexService>();
        serviceCollection.AddSingleton<HomeSectionService>();
        serviceCollection.AddSingleton<DiscoveryService>();
        serviceCollection.AddHostedService<PrismLifecycleService>();
    }
}

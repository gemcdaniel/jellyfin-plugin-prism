using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;

namespace Jellyfin.Plugin.Prism.Middleware;

/// <summary>
/// Registers <see cref="PrismIndexMiddleware"/> early in the ASP.NET Core pipeline.
/// </summary>
public class PrismStartupFilter : IStartupFilter
{
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
    {
        return app =>
        {
            app.UseMiddleware<PrismIndexMiddleware>();
            next(app);
        };
    }
}

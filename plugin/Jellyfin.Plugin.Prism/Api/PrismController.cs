using System.Reflection;
using System.Security.Claims;
using Jellyfin.Plugin.Prism.Configuration;
using Jellyfin.Plugin.Prism.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Prism.Api;

public sealed class PrismClientConfigDto
{
    public bool EnablePlugin { get; set; }
    public bool EnableThemeCss { get; set; }
    public bool ThemeDashboard { get; set; }
    public bool EnableTvGuideScrollFix { get; set; }
    public bool EnableHeroSpotlight { get; set; }
    public bool EnableDetailBackdrop { get; set; }
    public bool EnableDynamicAmbientColor { get; set; }
    public bool EnableMediaBadges { get; set; }
    public bool EnableHomeSections { get; set; }
    public bool EnableInfiniteDiscovery { get; set; }
    public bool EnableWatchlist { get; set; }
    public bool EnableLibraryInfiniteScroll { get; set; }
    public bool EnableDesktopHamburger { get; set; }
    public bool HasTmdbApiKey { get; set; }
}

public sealed class PrismBadgeBatchRequest
{
    public List<string> Ids { get; set; } = new();
}

[ApiController]
[Route("Prism")]
public class PrismController : ControllerBase
{
    private readonly HomeSectionService _homeSectionService;
    private readonly DiscoveryService _discoveryService;
    private readonly Assembly _assembly = typeof(Plugin).Assembly;

    public PrismController(HomeSectionService homeSectionService, DiscoveryService discoveryService)
    {
        _homeSectionService = homeSectionService;
        _discoveryService = discoveryService;
    }

    [HttpGet("theme.css")]
    [AllowAnonymous]
    [ResponseCache(Duration = 3600)]
    public IActionResult GetThemeCss()
    {
        var css = ReadEmbeddedText("Web.prism.min.css");
        if (css == null)
        {
            return NotFound();
        }

        return Content(css, "text/css; charset=utf-8");
    }

    [HttpGet("prism.js")]
    [AllowAnonymous]
    [ResponseCache(Duration = 3600)]
    public IActionResult GetClientScript()
    {
        var js = ReadEmbeddedText("Web.prism.js");
        if (js == null)
        {
            return NotFound();
        }

        return Content(js, "application/javascript; charset=utf-8");
    }

    [HttpGet("config")]
    [AllowAnonymous]
    public ActionResult<PrismClientConfigDto> GetClientConfig()
    {
        var cfg = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        return Ok(new PrismClientConfigDto
        {
            EnablePlugin = cfg.EnablePlugin,
            EnableThemeCss = cfg.EnableThemeCss,
            ThemeDashboard = cfg.ThemeDashboard,
            EnableTvGuideScrollFix = cfg.EnableTvGuideScrollFix,
            EnableHeroSpotlight = cfg.EnableHeroSpotlight,
            EnableDetailBackdrop = cfg.EnableDetailBackdrop,
            EnableDynamicAmbientColor = cfg.EnableDynamicAmbientColor,
            EnableMediaBadges = cfg.EnableMediaBadges,
            EnableHomeSections = cfg.EnableHomeSections,
            EnableInfiniteDiscovery = cfg.EnableInfiniteDiscovery,
            EnableWatchlist = cfg.EnableWatchlist,
            EnableLibraryInfiniteScroll = cfg.EnableLibraryInfiniteScroll,
            EnableDesktopHamburger = cfg.EnableDesktopHamburger,
            HasTmdbApiKey = !string.IsNullOrWhiteSpace(cfg.TmdbApiKey)
        });
    }

    [HttpPost("MediaBadges")]
    [Authorize]
    public ActionResult<Dictionary<string, List<string>>> GetMediaBadges([FromBody] PrismBadgeBatchRequest? request)
    {
        var cfg = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        if (!cfg.EnablePlugin || !cfg.EnableMediaBadges || request?.Ids == null || request.Ids.Count == 0)
        {
            return Ok(new Dictionary<string, List<string>>());
        }

        var parsedIds = new List<Guid>(request.Ids.Count);
        foreach (var raw in request.Ids)
        {
            if (Guid.TryParse(raw, out var guid) && guid != Guid.Empty)
            {
                parsedIds.Add(guid);
            }
        }

        return Ok(_homeSectionService.GetBadgesBatch(parsedIds));
    }

    [HttpGet("HomeSections")]
    [Authorize]
    public ActionResult<PrismHomeResponse> GetHomeSections([FromQuery] Guid? userId = null)
    {
        var cfg = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        if (!cfg.EnablePlugin)
        {
            return Ok(new PrismHomeResponse());
        }

        var resolvedUserId = ResolveUserId(userId);
        if (resolvedUserId == Guid.Empty)
        {
            return Unauthorized();
        }

        return Ok(_homeSectionService.GetHomeSections(resolvedUserId));
    }

    [HttpGet("Discovery")]
    [Authorize]
    public ActionResult<PrismDiscoveryResponse> GetDiscovery(
        [FromQuery] int page = 0,
        [FromQuery] int pageSize = 4,
        [FromQuery] Guid? userId = null)
    {
        var cfg = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        if (!cfg.EnablePlugin || !cfg.EnableInfiniteDiscovery)
        {
            return Ok(new PrismDiscoveryResponse());
        }

        var resolvedUserId = ResolveUserId(userId);
        if (resolvedUserId == Guid.Empty)
        {
            return Unauthorized();
        }

        return Ok(_discoveryService.GetDiscoveryPage(resolvedUserId, page, pageSize));
    }

    [HttpGet("Theme/{themeId}")]
    [Authorize]
    public ActionResult<PrismThemeDetailResponse> GetThemeDetail(
        [FromRoute] string themeId,
        [FromQuery] Guid? userId = null)
    {
        var cfg = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        if (!cfg.EnablePlugin)
        {
            return NotFound();
        }

        var resolvedUserId = ResolveUserId(userId);
        if (resolvedUserId == Guid.Empty)
        {
            return Unauthorized();
        }

        var detail = _homeSectionService.GetThemeItems(resolvedUserId, themeId);
        if (detail == null)
        {
            return NotFound();
        }

        return Ok(detail);
    }

    [HttpGet("Watchlist")]
    [Authorize]
    public ActionResult<PrismWatchlistResponse> GetWatchlist([FromQuery] Guid? userId = null)
    {
        var cfg = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        if (!cfg.EnablePlugin || !cfg.EnableWatchlist)
        {
            return Ok(new PrismWatchlistResponse());
        }

        var resolvedUserId = ResolveUserId(userId);
        if (resolvedUserId == Guid.Empty)
        {
            return Unauthorized();
        }

        return Ok(_homeSectionService.GetWatchlistIds(resolvedUserId));
    }

    [HttpPost("Watchlist/{itemId}")]
    [Authorize]
    public ActionResult<PrismWatchlistToggleResponse> ToggleWatchlist(
        [FromRoute] Guid itemId,
        [FromBody] PrismWatchlistToggleRequest? request = null,
        [FromQuery] Guid? userId = null)
    {
        var cfg = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        if (!cfg.EnablePlugin || !cfg.EnableWatchlist)
        {
            return BadRequest();
        }

        if (itemId == Guid.Empty)
        {
            return BadRequest();
        }

        var resolvedUserId = ResolveUserId(userId);
        if (resolvedUserId == Guid.Empty)
        {
            return Unauthorized();
        }

        var result = _homeSectionService.ToggleWatchlist(resolvedUserId, itemId, request?.IsWatchlisted);
        if (result == null)
        {
            return NotFound();
        }

        return Ok(result);
    }

    private Guid ResolveUserId(Guid? requestedUserId)
    {
        foreach (var claim in User.Claims)
        {
            if ((claim.Type.Equals("Jellyfin-UserId", StringComparison.OrdinalIgnoreCase)
                    || claim.Type == ClaimTypes.NameIdentifier)
                && Guid.TryParse(claim.Value, out var claimUserId)
                && claimUserId != Guid.Empty)
            {
                return claimUserId;
            }
        }

        return requestedUserId ?? Guid.Empty;
    }

    private string? ReadEmbeddedText(string suffix)
    {
        var resourceName = $"{typeof(Plugin).Namespace}.{suffix}";
        using var stream = _assembly.GetManifestResourceStream(resourceName);
        if (stream == null)
        {
            return null;
        }

        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}

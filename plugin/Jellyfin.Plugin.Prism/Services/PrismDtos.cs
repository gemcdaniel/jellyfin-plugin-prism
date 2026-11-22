namespace Jellyfin.Plugin.Prism.Services;

public sealed class PrismItemDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public int? ProductionYear { get; set; }
    public float? CommunityRating { get; set; }
    public int? RunTimeMinutes { get; set; }
    public bool Is4k { get; set; }
    public bool IsHdr { get; set; }
    public List<string> Badges { get; set; } = new();
    public string Overview { get; set; } = string.Empty;
    public bool HasPrimary { get; set; }
    public bool HasBackdrop { get; set; }
    public string? PrimaryImageTag { get; set; }
    public string? BackdropImageTag { get; set; }
    public bool HasLogo { get; set; }
    public string? LogoImageTag { get; set; }
    public int BackdropCount { get; set; }
    public List<string> BackdropImageTags { get; set; } = new();
    public bool IsWatchlisted { get; set; }
    public bool IsFavorite { get; set; }
    public bool IsPlayed { get; set; }
    public string? Subtitle { get; set; }
    public string? SeriesId { get; set; }
    public string? SeriesName { get; set; }
    public string? ReasonTag { get; set; }
    public string CardFormat { get; set; } = "Portrait";
    public string? ThemeId { get; set; }
    public string? AccentHex { get; set; }
    public int? ItemCount { get; set; }
}

public sealed class PrismSectionDto
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Subtitle { get; set; } = string.Empty;
    public string Badge { get; set; } = string.Empty;
    public string RenderMode { get; set; } = "Row";
    public string CardFormat { get; set; } = "Portrait";
    public List<PrismItemDto> Items { get; set; } = new();
}

public sealed class PrismHomeResponse
{
    public string CacheVersion { get; set; } = string.Empty;
    public int RotationBucket { get; set; }
    public bool DiscoveryAvailable { get; set; }
    public List<PrismItemDto> HeroItems { get; set; } = new();
    public List<PrismSectionDto> Sections { get; set; } = new();
}

public sealed class PrismDiscoveryResponse
{
    public int Page { get; set; }
    public int PageSize { get; set; }
    public bool HasMore { get; set; }
    public int TotalSections { get; set; }
    public int RotationBucket { get; set; }
    public List<PrismSectionDto> Sections { get; set; } = new();
}

public sealed class PrismThemeDetailResponse
{
    public string Id { get; set; } = string.Empty;
    public string Group { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Subtitle { get; set; } = string.Empty;
    public string AccentHex { get; set; } = "#7C5CFF";
    public List<PrismItemDto> Items { get; set; } = new();
}

public sealed class PrismWatchlistResponse
{
    public List<string> Ids { get; set; } = new();
}

public sealed class PrismWatchlistToggleRequest
{
    public bool? IsWatchlisted { get; set; }
}

public sealed class PrismWatchlistToggleResponse
{
    public string ItemId { get; set; } = string.Empty;
    public bool IsWatchlisted { get; set; }
}

using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Jellyfin.Extensions.Json;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Updates;
using Xunit;

namespace Jellyfin.Plugin.Prism.Tests;

public class PluginManifestTests
{
    private static string FindRepositoryRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "manifest.json"))
                && File.Exists(Path.Combine(dir.FullName, "Prism.sln")))
            {
                return dir.FullName;
            }

            dir = dir.Parent;
        }

        throw new DirectoryNotFoundException("Could not locate repository root containing manifest.json and Prism.sln.");
    }

    [Fact]
    public void RepositoryManifestJson_DeserializesAsJellyfinPackageInfoArray()
    {
        var root = FindRepositoryRoot();
        var json = File.ReadAllText(Path.Combine(root, "manifest.json"));

        var packages = JsonSerializer.Deserialize<PackageInfo[]>(json, JsonDefaults.Options);
        Assert.NotNull(packages);
        var pkg = Assert.Single(packages!);

        Assert.Equal(Guid.Parse("d8a4b2e1-7c3f-4e92-9b14-6f2c8d5a1e03"), pkg.Id);
        Assert.Equal("Prism", pkg.Name);
        Assert.False(string.IsNullOrWhiteSpace(pkg.Description));
        Assert.False(string.IsNullOrWhiteSpace(pkg.Overview));
        Assert.False(string.IsNullOrWhiteSpace(pkg.Owner));
        Assert.False(string.IsNullOrWhiteSpace(pkg.Category));
        Assert.NotNull(pkg.ImageUrl);
        Assert.EndsWith("assets/logo.png", pkg.ImageUrl!, StringComparison.Ordinal);
        Assert.NotEmpty(pkg.Versions);

        var md5Regex = new Regex("^[0-9a-f]{32}$", RegexOptions.IgnoreCase);
        Version? prevVersion = null;

        foreach (var v in pkg.Versions)
        {
            Assert.NotNull(v.VersionNumber);
            Assert.Equal(v.VersionNumber.ToString(), v.Version);
            Assert.True(Version.TryParse(v.TargetAbi, out var targetAbi));
            Assert.True(targetAbi >= new Version(12, 4, 0, 0));
            Assert.EndsWith(".zip", v.SourceUrl, StringComparison.OrdinalIgnoreCase);
            Assert.NotNull(v.Checksum);
            Assert.Matches(md5Regex, v.Checksum!);
            Assert.False(string.IsNullOrWhiteSpace(v.Timestamp));
            _ = DateTime.Parse(v.Timestamp!, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal);

            if (prevVersion != null)
            {
                Assert.True(prevVersion >= v.VersionNumber, $"Versions out of descending order: {prevVersion} < {v.VersionNumber}");
            }

            prevVersion = v.VersionNumber;
        }
    }

    [Fact]
    public void PluginMetaJson_DeserializesAsJellyfinPluginManifest()
    {
        const string sampleMetaJson = """
            {
              "guid": "d8a4b2e1-7c3f-4e92-9b14-6f2c8d5a1e03",
              "name": "Prism",
              "description": "True-black OLED UI and discovery plugin.",
              "overview": "Prism plugin for Jellyfin.",
              "owner": "gemcdaniel",
              "category": "General",
              "version": "1.0.0.0",
              "targetAbi": "12.4.0.0",
              "timestamp": "2026-11-22T22:28:57Z",
              "changelog": "Initial release",
              "status": "Active",
              "autoUpdate": true,
              "assemblies": [
                "Jellyfin.Plugin.Prism.dll"
              ]
            }
            """;

        var manifest = JsonSerializer.Deserialize<PluginManifest>(sampleMetaJson, JsonDefaults.Options);
        Assert.NotNull(manifest);
        Assert.Equal(Guid.Parse("d8a4b2e1-7c3f-4e92-9b14-6f2c8d5a1e03"), manifest!.Id);
        Assert.Equal("Prism", manifest.Name);
        Assert.Equal("1.0.0.0", manifest.Version);
        Assert.Equal("12.4.0.0", manifest.TargetAbi);
        Assert.Equal(PluginStatus.Active, manifest.Status);
        Assert.True(manifest.AutoUpdate);
        Assert.Contains("Jellyfin.Plugin.Prism.dll", manifest.Assemblies);
    }
}

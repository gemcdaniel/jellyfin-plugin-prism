using System.Text;
using Jellyfin.Plugin.Prism.Middleware;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace Jellyfin.Plugin.Prism.Tests;

public class PrismIndexMiddlewareTests
{
    [Fact]
    public async Task InvokeAsync_InjectsStylesheetAndScriptWithPathBaseIntoIndexHtml()
    {
        const string originalHtml = "<!doctype html><html><head><title>Jellyfin</title></head><body></body></html>";
        var middleware = new PrismIndexMiddleware(async ctx =>
        {
            ctx.Response.StatusCode = StatusCodes.Status200OK;
            ctx.Response.ContentType = "text/html; charset=utf-8";
            await ctx.Response.WriteAsync(originalHtml, Encoding.UTF8);
        });

        var context = new DefaultHttpContext();
        context.Request.Method = HttpMethods.Get;
        context.Request.Path = "/web/index.html";
        context.Request.PathBase = "/jellyfin";
        context.Request.Headers["Accept-Encoding"] = "gzip, br";
        context.Request.Headers["If-None-Match"] = "\"etag-123\"";

        using var responseBuffer = new MemoryStream();
        context.Response.Body = responseBuffer;

        await middleware.InvokeAsync(context);

        Assert.False(context.Request.Headers.ContainsKey("Accept-Encoding"));
        Assert.False(context.Request.Headers.ContainsKey("If-None-Match"));

        responseBuffer.Position = 0;
        var body = await new StreamReader(responseBuffer, Encoding.UTF8).ReadToEndAsync();
        Assert.Contains("data-prism=\"true\"", body);
        Assert.Contains("href=\"/jellyfin/Prism/theme.css?v=", body);
        Assert.Contains("src=\"/jellyfin/Prism/prism.js?v=", body);
        Assert.True(body.IndexOf("data-prism=\"true\"", StringComparison.Ordinal) < body.IndexOf("</head>", StringComparison.Ordinal));
    }

    [Fact]
    public async Task InvokeAsync_DoesNotDoubleInjectWhenMarkerAlreadyPresent()
    {
        const string alreadyInjected = "<html><head><script data-prism=\"true\"></script></head><body></body></html>";
        var middleware = new PrismIndexMiddleware(async ctx =>
        {
            ctx.Response.StatusCode = StatusCodes.Status200OK;
            ctx.Response.ContentType = "text/html";
            await ctx.Response.WriteAsync(alreadyInjected, Encoding.UTF8);
        });

        var context = new DefaultHttpContext();
        context.Request.Method = HttpMethods.Get;
        context.Request.Path = "/web/";
        using var responseBuffer = new MemoryStream();
        context.Response.Body = responseBuffer;

        await middleware.InvokeAsync(context);

        responseBuffer.Position = 0;
        var body = await new StreamReader(responseBuffer, Encoding.UTF8).ReadToEndAsync();
        Assert.Equal(alreadyInjected, body);
    }

    [Theory]
    [InlineData("POST", "/web/index.html", "text/html")]
    [InlineData("GET", "/System/Info/Public", "application/json")]
    [InlineData("GET", "/web/index.html", "application/json")]
    public async Task InvokeAsync_PassesThroughNonHtmlOrNonGetOrNonIndexRequests(string method, string path, string contentType)
    {
        const string payload = "{\"status\":\"ok\"}";
        var middleware = new PrismIndexMiddleware(async ctx =>
        {
            ctx.Response.StatusCode = StatusCodes.Status200OK;
            ctx.Response.ContentType = contentType;
            await ctx.Response.WriteAsync(payload, Encoding.UTF8);
        });

        var context = new DefaultHttpContext();
        context.Request.Method = method;
        context.Request.Path = path;
        using var responseBuffer = new MemoryStream();
        context.Response.Body = responseBuffer;

        await middleware.InvokeAsync(context);

        responseBuffer.Position = 0;
        var body = await new StreamReader(responseBuffer, Encoding.UTF8).ReadToEndAsync();
        Assert.Equal(payload, body);
    }
}

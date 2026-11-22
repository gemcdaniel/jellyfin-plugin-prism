using System.Text;
using Microsoft.AspNetCore.Http;

namespace Jellyfin.Plugin.Prism.Middleware;

/// <summary>
/// Injects Prism CSS and lightweight client script into Jellyfin Web's index.html.
/// Non-HTML responses, API endpoints, and disabled plugin requests pass through untouched.
/// </summary>
public class PrismIndexMiddleware
{
    private readonly RequestDelegate _next;
    private readonly string _version;

    public PrismIndexMiddleware(RequestDelegate next)
    {
        _next = next;
        _version = typeof(Plugin).Assembly.GetName().Version?.ToString(3) ?? "1.0.0";
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var cfg = Plugin.Instance?.Configuration;
        if (cfg?.EnablePlugin == false
            || !HttpMethods.IsGet(context.Request.Method)
            || !IsIndexHtmlRequest(context.Request.Path.Value))
        {
            await _next(context);
            return;
        }

        // Strip encoding/revalidation headers ONLY on index.html so we receive fresh uncompressed HTML.
        context.Request.Headers.Remove("Accept-Encoding");
        context.Request.Headers.Remove("If-None-Match");
        context.Request.Headers.Remove("If-Modified-Since");

        var originalBody = context.Response.Body;
        using var buffer = new MemoryStream();
        context.Response.Body = buffer;

        try
        {
            await _next(context);
        }
        finally
        {
            context.Response.Body = originalBody;
        }

        buffer.Position = 0;

        if (context.Response.StatusCode == StatusCodes.Status200OK
            && context.Response.ContentType?.Contains("text/html", StringComparison.OrdinalIgnoreCase) == true)
        {
            using var reader = new StreamReader(buffer, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, leaveOpen: true);
            var html = await reader.ReadToEndAsync();

            if (!html.Contains("data-prism", StringComparison.OrdinalIgnoreCase))
            {
                var headCloseIdx = html.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
                if (headCloseIdx >= 0)
                {
                    var basePath = context.Request.PathBase.HasValue
                        ? context.Request.PathBase.Value!.TrimEnd('/')
                        : string.Empty;

                    var sb = new StringBuilder();
                    if (cfg?.EnableThemeCss != false)
                    {
                        sb.Append($"<link rel=\"stylesheet\" data-prism=\"true\" href=\"{basePath}/Prism/theme.css?v={_version}\" />");
                    }

                    sb.Append($"<script defer data-prism=\"true\" src=\"{basePath}/Prism/prism.js?v={_version}\"></script>");

                    var modified = string.Concat(html.AsSpan(0, headCloseIdx), sb.ToString(), html.AsSpan(headCloseIdx));
                    var outBytes = Encoding.UTF8.GetBytes(modified);

                    context.Response.Headers.Remove("Content-Length");
                    context.Response.ContentLength = outBytes.Length;
                    await originalBody.WriteAsync(outBytes, context.RequestAborted);
                    return;
                }
            }

            buffer.Position = 0;
        }

        await buffer.CopyToAsync(originalBody, context.RequestAborted);
    }

    private static bool IsIndexHtmlRequest(string? path)
    {
        if (string.IsNullOrEmpty(path))
        {
            return false;
        }

        return path.Equals("/", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/index.html", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/web", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/web/", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/web/index.html", StringComparison.OrdinalIgnoreCase);
    }
}

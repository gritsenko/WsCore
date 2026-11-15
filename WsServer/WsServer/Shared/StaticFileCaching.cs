using System.Text.RegularExpressions;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Net.Http.Headers;

namespace WsServer;

/// <summary>
/// Cache-Control for the client build served from wwwroot (Dockerfile copies the Vite
/// dist there). Vite emits content-hashed chunks as <c>/assets/name-HASH.ext</c>: their
/// content never changes under a given URL, so they're cached forever. index.html, which
/// references the current hashes, must be revalidated on every load or a deploy would
/// keep serving stale chunk URLs. Unhashed public assets (/knight, /map, /ui,
/// /assets/logo.png, ...) get no explicit Cache-Control (ETag/Last-Modified revalidation).
/// </summary>
public static partial class StaticFileCaching
{
    public const string Immutable = "public, max-age=31536000, immutable";
    public const string NoCache = "no-cache";

    // Directly under /assets (Vite's flat output), "<name>-<8-char base64url hash>.<ext>".
    // The hash must contain at least one non-lowercase character, so a plain word such as
    // "ground-textures.png" is NOT taken for a hash; a real (rare) all-lowercase hash
    // just falls back to revalidation, which is the safe direction.
    [GeneratedRegex(@"^/assets/[^/]+-(?=[A-Za-z0-9_-]{0,7}[A-Z0-9_-])[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$")]
    private static partial Regex HashedAsset();

    /// <summary>The Cache-Control value for a static file, or null to send none.</summary>
    public static string? CacheControlFor(string requestPath, string fileName)
    {
        if (string.Equals(fileName, "index.html", StringComparison.OrdinalIgnoreCase))
            return NoCache;
        if (HashedAsset().IsMatch(requestPath))
            return Immutable;
        return null;
    }

    /// <summary>Use as <c>StaticFileOptions.OnPrepareResponse</c>.</summary>
    public static void Apply(StaticFileResponseContext ctx)
    {
        var value = CacheControlFor(ctx.Context.Request.Path.Value ?? string.Empty, ctx.File.Name);
        if (value != null)
            ctx.Context.Response.Headers[HeaderNames.CacheControl] = value;
    }
}

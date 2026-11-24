using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.StaticFiles;
using WsServer.Persistence;
using WsServer.Sessions;

namespace WsServer.Games;

/// <summary>
/// HTTP side of the games portal:
///  * the <b>games origin</b> (<see cref="GameServerOptions.GamesOrigin"/>): a request whose
///    Host is that origin's gets nothing but builds (<c>/g/{gameId}/r{no}/…</c>) and the
///    jam bridge (<c>/jam-sdk.js</c>) — never the client, the socket or the API, so a
///    game's JavaScript has no way to the user's key;
///  * the <b>REST API</b> on the main origin (<c>/api/…</c>): the public catalog, and —
///    with an API token (<c>Authorization: Bearer tox_…</c>) — creating, editing,
///    publishing and uploading builds of games, which is what an agent or a script does.
/// </summary>
public static class GamesHttp
{
    private static readonly Regex BuildPath = new(@"^/g/([a-z0-9]{10})/r(\d{1,9})(?:/(.*))?$", RegexOptions.CultureInvariant);
    private static readonly FileExtensionContentTypeProvider ContentTypes = CreateContentTypes();
    private static readonly Lazy<byte[]> JamSdk = new(() =>
    {
        using var stream = typeof(GamesHttp).Assembly.GetManifestResourceStream("jam-sdk.js")
            ?? throw new InvalidOperationException("jam-sdk.js is not embedded");
        using var copy = new MemoryStream();
        stream.CopyTo(copy);
        return copy.ToArray();
    });

    /// <summary>
    /// Routes requests for the games origin to the build server. Must come before the
    /// static files and the client (in Program.cs: first), so nothing else answers there.
    /// A no-op when no games origin is configured.
    /// </summary>
    public static WebApplication UseGamesOrigin(this WebApplication app)
    {
        var options = app.Services.GetRequiredService<GameServerOptions>();
        if (!Uri.TryCreate(options.GamesOrigin, UriKind.Absolute, out var origin))
            return app;
        app.MapWhen(ctx => IsGamesHost(ctx.Request.Host, origin), branch => branch.Run(ServeGamesOrigin));
        return app;
    }

    public static bool IsGamesHost(HostString host, Uri gamesOrigin)
    {
        if (!host.HasValue || !string.Equals(host.Host, gamesOrigin.Host, StringComparison.OrdinalIgnoreCase))
            return false;
        var port = host.Port ?? (gamesOrigin.Scheme == "https" ? 443 : 80);
        return port == gamesOrigin.Port;
    }

    // ---- the games origin ---------------------------------------------------------------

    private static async Task ServeGamesOrigin(HttpContext http)
    {
        var options = http.RequestServices.GetRequiredService<GameServerOptions>();
        var response = http.Response;
        // Only TOX may frame a game (a game on our domain inside somebody else's page is
        // a phishing kit); nothing here is ever sniffed into another type.
        response.Headers.ContentSecurityPolicy = "frame-ancestors " +
            (options.PortalOrigins.Length > 0 ? string.Join(' ', options.PortalOrigins) : "'none'");
        response.Headers.XContentTypeOptions = "nosniff";

        if (!HttpMethods.IsGet(http.Request.Method) && !HttpMethods.IsHead(http.Request.Method))
        {
            response.StatusCode = StatusCodes.Status405MethodNotAllowed;
            return;
        }

        var path = http.Request.Path.Value ?? "/";
        if (path == "/jam-sdk.js")
        {
            // A fixed URL rather than a copy in every build: a fix reaches every game at once.
            response.ContentType = "text/javascript; charset=utf-8";
            response.Headers.CacheControl = "public, max-age=300";
            await response.Body.WriteAsync(JamSdk.Value, http.RequestAborted);
            return;
        }
        if (path == "/robots.txt")
        {
            response.ContentType = "text/plain";
            await response.WriteAsync("User-agent: *\nDisallow: /\n", http.RequestAborted);
            return;
        }

        var match = BuildPath.Match(path);
        if (!match.Success || !uint.TryParse(match.Groups[2].Value, out var no))
        {
            response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        var catalog = http.RequestServices.GetRequiredService<GameCatalog>();
        var game = catalog.Find(match.Groups[1].Value);
        var release = game?.Releases.FirstOrDefault(r => r.No == no);
        if (game == null || release == null || game.Id != match.Groups[1].Value)
        {
            response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        var relative = match.Groups[3].Success && match.Groups[3].Value.Length > 0
            ? GameBuild.SafeRelativePath(match.Groups[3].Value)
            : release.EntryPath;
        var root = catalog.ReleaseDirectory(game.Id, no) + Path.DirectorySeparatorChar;
        var file = relative == null ? null : Path.GetFullPath(Path.Combine(root, relative));
        if (file == null || !file.StartsWith(root, StringComparison.Ordinal) || !File.Exists(file))
        {
            response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        if (relative == release.EntryPath)
        {
            // The entry gets the bridge tag at serve time, with the current origins.
            var bytes = await File.ReadAllBytesAsync(file, http.RequestAborted);
            var injected = JamSdkInjector.InjectFile(bytes, options.PortalOrigins);
            response.ContentType = "text/html; charset=utf-8";
            response.Headers.CacheControl = "no-cache";
            await response.Body.WriteAsync(injected ?? bytes, http.RequestAborted);
            return;
        }

        // A release's files never change (its number is never reused).
        response.ContentType = ContentTypeOf(file);
        response.Headers.CacheControl = "public, max-age=31536000, immutable";
        await response.SendFileAsync(file, http.RequestAborted);
    }

    private static FileExtensionContentTypeProvider CreateContentTypes()
    {
        var provider = new FileExtensionContentTypeProvider();
        provider.Mappings[".wasm"] = "application/wasm";
        provider.Mappings[".mjs"] = "text/javascript";
        provider.Mappings[".data"] = "application/octet-stream";
        provider.Mappings[".unityweb"] = "application/octet-stream";
        provider.Mappings[".pck"] = "application/octet-stream";
        provider.Mappings[".glb"] = "model/gltf-binary";
        provider.Mappings[".gltf"] = "model/gltf+json";
        provider.Mappings[".ktx2"] = "image/ktx2";
        provider.Mappings[".webmanifest"] = "application/manifest+json";
        return provider;
    }

    private static string ContentTypeOf(string file)
    {
        if (!ContentTypes.TryGetContentType(file, out var type))
            return "application/octet-stream";
        return type.StartsWith("text/", StringComparison.Ordinal) || type is "application/json" or "application/javascript"
            ? type + "; charset=utf-8"
            : type;
    }

    // ---- REST API -----------------------------------------------------------------------

    public sealed record GameBody(string? Title, string? Tagline, string? Description, List<string>? Tags, string? Slug);

    public sealed record VisibilityBody(string? Visibility);

    public sealed record ReleaseDto(uint No, string Version, string Notes, uint AuthorUserId, string CreatedAt,
        string EntryPath, int Files, long Bytes, string? PlayUrl);

    public sealed record GameDto(string Id, string Slug, string Title, string Tagline, string Description,
        IReadOnlyList<string> Tags, string Visibility, string RoomId, string PageUrl, string? PlayUrl,
        string CreatedAt, string UpdatedAt, IReadOnlyList<ReleaseDto> Releases);

    /// <summary>Maps the <c>/api/…</c> endpoints of the games portal.</summary>
    public static IEndpointRouteBuilder MapGamesApi(this IEndpointRouteBuilder endpoints)
    {
        // Public: what an unauthenticated visitor (or a link preview) may know.
        endpoints.MapGet("/api/games", (GameCatalog catalog) =>
            Results.Json(catalog.Games.Where(g => g.Game.IsPublic)
                .OrderByDescending(g => g.Game.UpdatedMs)
                .Select(g => ToDto(catalog, g)).ToList()));

        endpoints.MapGet("/api/games/{idOrSlug}", (string idOrSlug, HttpContext http) =>
            Run(http, optionalAuth: true, (catalog, user) =>
            {
                var game = catalog.Find(idOrSlug);
                if (game == null || !GameCatalog.CanSee(user, game))
                    throw new GameRequestException(404, "not_found", "No such game");
                return ToDto(catalog, game);
            }));

        // Typed explicitly: a lambda taking only HttpContext would bind as a RequestDelegate
        // and its IResult would be dropped.
        endpoints.MapGet("/api/me", (Func<HttpContext, Task<IResult>>)(http =>
            Run(http, optionalAuth: false, (_, user) => new
            {
                userId = user!.Id,
                name = user.Name,
                login = user.Login,
                isAdmin = user.IsAdmin,
                canPublish = GameCatalog.CanPublish(user),
            })));

        endpoints.MapPost("/api/games", (GameBody body, HttpContext http) =>
            Run(http, optionalAuth: false, (catalog, user) =>
                ToDto(catalog, catalog.Create(user!, Fields(body))), StatusCodes.Status201Created));

        endpoints.MapMethods("/api/games/{idOrSlug}", ["PATCH"], (string idOrSlug, GameBody body, HttpContext http) =>
            Run(http, optionalAuth: false, (catalog, user) =>
                ToDto(catalog, catalog.Update(user!, idOrSlug, Fields(body)))));

        endpoints.MapPost("/api/games/{idOrSlug}/visibility", (string idOrSlug, VisibilityBody body, HttpContext http) =>
            Run(http, optionalAuth: false, (catalog, user) =>
            {
                var isPublic = body.Visibility switch
                {
                    "public" => true,
                    "team" or "draft" => false,
                    _ => throw new GameRequestException(400, "bad_visibility", "visibility is 'public' or 'team'"),
                };
                return ToDto(catalog, catalog.SetPublic(user!, idOrSlug, isPublic));
            }));

        endpoints.MapPut("/api/games/{idOrSlug}/build", UploadBuild);

        // Analytics: a game's to its owner and server admins; the whole portal's to server admins.
        endpoints.MapGet("/api/games/stats", (Func<HttpContext, Task<IResult>>)(http => Stats(http, null)));
        endpoints.MapGet("/api/games/{idOrSlug}/stats", (string idOrSlug, HttpContext http) => Stats(http, idOrSlug));
        return endpoints;
    }

    private static GameFields Fields(GameBody body)
        => new(body.Title, body.Tagline, body.Description, body.Tags, body.Slug);

    /// <summary>
    /// Runs a catalog operation on the tick thread as the token's user and turns the
    /// outcome into a response (refusals as <c>{ error, message }</c>).
    /// </summary>
    private static async Task<IResult> Run<T>(HttpContext http, bool optionalAuth,
        Func<GameCatalog, UserAccount?, T> action, int status = StatusCodes.Status200OK)
    {
        var services = http.RequestServices;
        var userId = Authenticate(http);
        if (userId == null && !optionalAuth)
            return Error(401, "unauthorized", "An API token is required (Authorization: Bearer tox_…)");
        var server = services.GetRequiredService<GameServer>();
        var catalog = services.GetRequiredService<GameCatalog>();
        var users = services.GetRequiredService<UserDirectory>();
        try
        {
            var result = await server.RunOnTickAsync(() =>
            {
                var user = userId is { } id ? users.FindById(id) : null;
                if (userId != null && user == null)
                    throw new GameRequestException(401, "unauthorized", "The token's user no longer exists");
                return action(catalog, user);
            });
            return Results.Json(result, statusCode: status);
        }
        catch (GameRequestException e)
        {
            return Error(e.Status, e.Code, e.Message);
        }
    }

    private static uint? Authenticate(HttpContext http)
    {
        var header = http.Request.Headers.Authorization.ToString();
        const string bearer = "Bearer ";
        if (!header.StartsWith(bearer, StringComparison.OrdinalIgnoreCase))
            return null;
        return http.RequestServices.GetRequiredService<ApiTokens>().Authenticate(header[bearer.Length..].Trim());
    }

    private static IResult Error(int status, string code, string message)
        => Results.Json(new { error = code, message }, statusCode: status);

    /// <summary>
    /// PUT /api/games/{idOrSlug}/build?filename=game.zip&amp;version=0.2&amp;notes=… with the
    /// file as the body (<c>curl -T game.zip</c>): a new release, which becomes the current
    /// build. The body is streamed to disk, unpacked off the tick thread into the release's
    /// directory and only then committed.
    /// </summary>
    private static async Task<IResult> UploadBuild(string idOrSlug, HttpContext http)
    {
        var services = http.RequestServices;
        var options = services.GetRequiredService<GameServerOptions>();
        var server = services.GetRequiredService<GameServer>();
        var catalog = services.GetRequiredService<GameCatalog>();
        var users = services.GetRequiredService<UserDirectory>();
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("WsServer.Games.Upload");

        if (Authenticate(http) is not { } userId)
            return Error(401, "unauthorized", "An API token is required (Authorization: Bearer tox_…)");

        var fileName = Path.GetFileName(http.Request.Query["filename"].ToString());
        if (!GameBuild.IsAcceptedFileName(fileName))
            return Error(400, "bad_filename", "?filename= must name a .zip or a single .html file");

        long maxBytes = (long)options.GameMaxBuildMb * 1024 * 1024;
        if (http.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } limit)
            limit.MaxRequestBodySize = maxBytes;
        if (http.Request.ContentLength > maxBytes)
            return Error(413, "too_large", $"A build may be at most {options.GameMaxBuildMb} MB");

        UserAccount? user = null;
        (uint No, string Directory) reserved;
        try
        {
            reserved = await server.RunOnTickAsync(() =>
            {
                user = users.FindById(userId)
                    ?? throw new GameRequestException(401, "unauthorized", "The token's user no longer exists");
                return catalog.ReserveRelease(user, idOrSlug);
            });
        }
        catch (GameRequestException e)
        {
            return Error(e.Status, e.Code, e.Message);
        }

        var uploads = Path.Combine(Path.GetFullPath(options.GamesDataPath), ".uploads");
        Directory.CreateDirectory(uploads);
        var upload = Path.Combine(uploads, Guid.NewGuid().ToString("N") + Path.GetExtension(fileName).ToLowerInvariant());
        var staging = reserved.Directory + ".tmp-" + Guid.NewGuid().ToString("N")[..8];
        try
        {
            long received = 0;
            await using (var file = new FileStream(upload, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, useAsync: true))
            {
                var buffer = new byte[81920];
                int read;
                while ((read = await http.Request.Body.ReadAsync(buffer, http.RequestAborted)) > 0)
                {
                    received += read;
                    if (received > maxBytes)
                        return Error(413, "too_large", $"A build may be at most {options.GameMaxBuildMb} MB");
                    await file.WriteAsync(buffer.AsMemory(0, read), http.RequestAborted);
                }
            }
            if (received == 0)
                return Error(400, "empty", "The body is empty — send the file (curl -T game.zip …)");

            var build = await Task.Run(() => GameBuild.Unpack(upload, fileName, staging,
                (long)options.GameMaxUnpackedMb * 1024 * 1024, options.GameMaxFiles));
            Directory.Move(staging, reserved.Directory);

            var version = http.Request.Query["version"].ToString();
            var notes = http.Request.Query["notes"].ToString();
            var (game, release) = await server.RunOnTickAsync(() =>
                catalog.CommitRelease(user!, idOrSlug, reserved.No, build, version, notes));

            var stale = await server.RunOnTickAsync(() => catalog.StaleReleaseDirectories(game.Id));
            foreach (var dir in stale.Where(Directory.Exists))
            {
                try { Directory.Delete(dir, recursive: true); }
                catch (IOException e) { logger.LogWarning(e, "Could not delete old release {Dir}", dir); }
            }

            return Results.Json(new
            {
                game = ToDto(catalog, game),
                release = ToReleaseDto(catalog, game, release),
                warnings = build.Warnings,
            }, statusCode: StatusCodes.Status201Created);
        }
        catch (BuildRejectedException e)
        {
            return Error(400, "bad_build", e.Message);
        }
        catch (GameRequestException e)
        {
            return Error(e.Status, e.Code, e.Message);
        }
        catch (BadHttpRequestException e) when (e.StatusCode == StatusCodes.Status413PayloadTooLarge)
        {
            return Error(413, "too_large", $"A build may be at most {options.GameMaxBuildMb} MB");
        }
        finally
        {
            TryDelete(upload);
            if (Directory.Exists(staging))
            {
                try { Directory.Delete(staging, recursive: true); } catch (IOException) { }
            }
        }
    }

    public sealed record StatsTotals(long Views, long Launches, long Plays, long ActiveMs);

    public sealed record SessionStats(int Sessions, long MedianMs, long LongestMs, int AtLeast1Min, int AtLeast3Min,
        int AtLeast10Min);

    public sealed record StatsDto(string? GameId, int Days, StatsTotals? Totals, SessionStats Sessions, long Players,
        long ReturningPlayers, IReadOnlyList<GameDay> Daily, IReadOnlyList<NamedCount> Events,
        IReadOnlyList<NamedCount> Levels, IReadOnlyList<NamedCount> Sources);

    private static async Task<IResult> Stats(HttpContext http, string? idOrSlug)
    {
        var services = http.RequestServices;
        if (Authenticate(http) is not { } userId)
            return Error(401, "unauthorized", "An API token is required (Authorization: Bearer tox_…)");
        var days = int.TryParse(http.Request.Query["days"], out var d) ? Math.Clamp(d, 1, 3650) : 30;
        var server = services.GetRequiredService<GameServer>();
        var catalog = services.GetRequiredService<GameCatalog>();
        var analytics = services.GetRequiredService<GameAnalytics>();
        var users = services.GetRequiredService<UserDirectory>();
        var storage = services.GetRequiredService<IChatStorage>();

        (string GameId, StoredGameCounters? Totals) target;
        try
        {
            target = await server.RunOnTickAsync(() =>
            {
                var user = users.FindById(userId)
                    ?? throw new GameRequestException(401, "unauthorized", "The token's user no longer exists");
                if (idOrSlug == null)
                {
                    if (!user.IsAdmin)
                        throw new GameRequestException(403, "forbidden", "The portal's numbers are for server admins");
                    return (string.Empty, (StoredGameCounters?)null);
                }
                var game = catalog.Find(idOrSlug);
                if (game == null || !GameCatalog.CanSee(user, game))
                    throw new GameRequestException(404, "not_found", "No such game");
                if (!user.IsAdmin && user.Id != game.Game.OwnerUserId)
                    throw new GameRequestException(403, "forbidden", "A game's numbers are for its owner and server admins");
                return (game.Id, analytics.CountersOf(game.Id));
            });
        }
        catch (GameRequestException e)
        {
            return Error(e.Status, e.Code, e.Message);
        }

        var since = DateTimeOffset.UtcNow.AddDays(-days).ToUnixTimeMilliseconds();
        var loaded = new TaskCompletionSource<GameStatsData>(TaskCreationOptions.RunContinuationsAsynchronously);
        storage.QueryGameStats(target.GameId, since, data => loaded.TrySetResult(data));
        var data = await loaded.Task;

        return Results.Json(new StatsDto(
            target.GameId.Length > 0 ? target.GameId : null,
            days,
            target.Totals is { } t ? new StatsTotals(t.Views, t.Launches, t.Plays, t.ActiveMs) : null,
            Summarize(data.SessionActiveMs),
            data.Players, data.ReturningPlayers, data.Days, data.Events, data.Levels, data.Sources));
    }

    /// <summary>Median / longest session and the retention buckets (≥ 1, 3, 10 minutes).</summary>
    public static SessionStats Summarize(IReadOnlyList<long> activeMs)
    {
        if (activeMs.Count == 0)
            return new SessionStats(0, 0, 0, 0, 0, 0);
        var sorted = activeMs.OrderBy(x => x).ToList();
        var n = sorted.Count;
        var median = n % 2 == 1 ? sorted[n / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
        return new SessionStats(n, median, sorted[^1],
            sorted.Count(x => x >= 60_000), sorted.Count(x => x >= 180_000), sorted.Count(x => x >= 600_000));
    }

    private static void TryDelete(string file)
    {
        try { File.Delete(file); } catch (IOException) { }
    }

    private static GameDto ToDto(GameCatalog catalog, GameView view)
    {
        var g = view.Game;
        return new GameDto(g.Id, g.Slug, g.Title, g.Tagline, g.Description, g.Tags,
            g.IsPublic ? "public" : "team", view.RoomId, catalog.PageUrl(g),
            view.Current is { } current ? catalog.PlayUrl(g.Id, current) : null,
            Iso(g.CreatedMs), Iso(g.UpdatedMs),
            view.Releases.Reverse().Select(r => ToReleaseDto(catalog, view, r)).ToList());
    }

    private static ReleaseDto ToReleaseDto(GameCatalog catalog, GameView view, StoredGameRelease r)
        => new(r.No, r.Version, r.Notes, r.AuthorUserId, Iso(r.CreatedMs), r.EntryPath, r.Files, r.Bytes,
            Directory.Exists(catalog.ReleaseDirectory(view.Id, r.No)) ? catalog.PlayUrl(view.Id, r) : null);

    private static string Iso(long ms) => DateTimeOffset.FromUnixTimeMilliseconds(ms).ToString("O");
}

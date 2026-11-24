using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
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
        string CreatedAt, string UpdatedAt, IReadOnlyList<ReleaseDto> Releases,
        MediaDto? Cover, MediaDto? Header, IReadOnlyList<MediaDto> Screenshots);

    /// <summary>
    /// The game page with link-preview tags: <c>GET /games/{slug}</c> answers the client's
    /// <c>index.html</c> with its title, description, canonical, Open Graph and Twitter tags
    /// set for the game (crawlers run no JavaScript). A draft or an unknown slug gets the
    /// page as it is — nothing about a draft leaks.
    /// </summary>
    public static IEndpointRouteBuilder MapGamePages(this IEndpointRouteBuilder endpoints, IFileProvider webRoot)
    {
        endpoints.MapGet("/games/{slug}", (string slug, HttpContext http) =>
        {
            var index = webRoot.GetFileInfo("index.html");
            if (!index.Exists)
                return Results.NotFound();
            string html;
            using (var reader = new StreamReader(index.CreateReadStream()))
                html = reader.ReadToEnd();
            var catalog = http.RequestServices.GetRequiredService<GameCatalog>();
            var game = catalog.Find(slug);
            if (game is { Game.IsPublic: true })
                html = GamePage.Render(html, catalog, game);
            http.Response.Headers.CacheControl = "no-cache";
            return Results.Content(html, "text/html; charset=utf-8");
        });
        return endpoints;
    }

    /// <summary>
    /// The agent's endpoints: <c>/agent/mcp</c> (MCP over Streamable HTTP; a personal token
    /// required — a request without one gets 401 with <c>WWW-Authenticate: Bearer</c>) and
    /// <c>PUT /agent/upload/{session}/{index}?t={ticket}</c> (the chunks the tools' commands send;
    /// the ticket is the authority, not a token).
    /// </summary>
    public static IEndpointRouteBuilder MapAgent(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapMcp("/agent/mcp");

        endpoints.MapPut("/agent/upload/{sessionId}/{index:int}", async (string sessionId, int index, string? t, HttpContext http) =>
        {
            var options = http.RequestServices.GetRequiredService<GameServerOptions>();
            if (http.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } limit)
                limit.MaxRequestBodySize = (long)Math.Max(options.GameMaxBuildMb, options.GameMaxMediaMb) * 1024 * 1024;
            var (status, error) = await http.RequestServices.GetRequiredService<UploadSessions>()
                .SaveChunkAsync(sessionId, index, t ?? string.Empty, http.Request.Body, http.RequestAborted);
            return status == 200 ? Results.Json(new { ok = true, index }) : Error(status, "bad_chunk", error);
        });
        return endpoints;
    }

    /// <summary>
    /// Refuses <c>/agent/mcp</c> without a valid personal token — before the MCP transport
    /// reads anything (401 with <c>WWW-Authenticate: Bearer</c>, so a client knows to send one).
    /// </summary>
    public static IApplicationBuilder UseAgentAuth(this IApplicationBuilder app)
        => app.UseWhen(ctx => ctx.Request.Path.StartsWithSegments("/agent/mcp"), branch => branch.Use(async (ctx, next) =>
        {
            var header = ctx.Request.Headers.Authorization.ToString();
            var token = header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? header[7..].Trim() : null;
            if (ctx.RequestServices.GetRequiredService<ApiTokens>().Authenticate(token) == null)
            {
                ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                ctx.Response.Headers.WWWAuthenticate = "Bearer realm=\"tox\"";
                await ctx.Response.WriteAsJsonAsync(new
                {
                    error = "unauthorized",
                    message = "A personal token is required: Authorization: Bearer tox_… (profile → «Доступ для агента»)",
                });
                return;
            }
            await next(ctx);
        }));

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

        // Pictures: a cover / header (replaces) or a screenshot (appended); the screenshots as
        // a whole ordered list (ids left out are removed); one picture removed.
        endpoints.MapPut("/api/games/{idOrSlug}/media", UploadMedia);
        endpoints.MapPut("/api/games/{idOrSlug}/screenshots", (string idOrSlug, ScreenshotsBody body, HttpContext http) =>
            Run(http, optionalAuth: false, (catalog, user) =>
            {
                var (game, removed) = catalog.SetScreenshots(user!, idOrSlug, body.Ids ?? []);
                DeleteFiles(catalog, removed);
                return ToDto(catalog, game);
            }));
        endpoints.MapDelete("/api/games/{idOrSlug}/media/{mediaId}", (string idOrSlug, string mediaId, HttpContext http) =>
            Run(http, optionalAuth: false, (catalog, user) =>
            {
                var (game, removed) = catalog.RemoveMedia(user!, idOrSlug, mediaId);
                DeleteFiles(catalog, [removed]);
                return ToDto(catalog, game);
            }));
        endpoints.MapGet("/game-media/{gameId}/{file}", ServeMedia);

        // Leaderboards: every board with its top rows (public games: anyone); settings,
        // reset and delete for the game's owner and server admins.
        endpoints.MapGet("/api/games/{idOrSlug}/leaderboards", (string idOrSlug, int? top, HttpContext http) =>
            Run(http, optionalAuth: true, (catalog, user) =>
            {
                var game = catalog.Find(idOrSlug);
                if (game == null || !GameCatalog.CanSee(user, game))
                    throw new GameRequestException(404, "not_found", "No such game");
                return http.RequestServices.GetRequiredService<Leaderboards>().Panel(game, user, top ?? 10);
            }));
        endpoints.MapMethods("/api/games/{idOrSlug}/leaderboards/{name}", ["PATCH"],
            (string idOrSlug, string name, BoardBody body, HttpContext http) =>
                Run(http, optionalAuth: false, (catalog, user) =>
                    http.RequestServices.GetRequiredService<Leaderboards>().Configure(BoardOwner(catalog, user, idOrSlug),
                        name, body.Title, body.InvertSortOrder, body.ScoreType, body.DecimalOffset)));
        endpoints.MapPost("/api/games/{idOrSlug}/leaderboards/{name}/reset", (string idOrSlug, string name, HttpContext http) =>
            Run(http, optionalAuth: false, (catalog, user) => new
            {
                removed = http.RequestServices.GetRequiredService<Leaderboards>().Reset(BoardOwner(catalog, user, idOrSlug), name),
            }));
        endpoints.MapDelete("/api/games/{idOrSlug}/leaderboards/{name}", (string idOrSlug, string name, HttpContext http) =>
            Run(http, optionalAuth: false, (catalog, user) =>
            {
                http.RequestServices.GetRequiredService<Leaderboards>().Delete(BoardOwner(catalog, user, idOrSlug), name);
                return new { deleted = true };
            }));

        // Analytics: a game's to its owner and server admins; the whole portal's to server admins.
        endpoints.MapGet("/api/games/stats", (Func<HttpContext, Task<IResult>>)(http => Stats(http, null)));
        endpoints.MapGet("/api/games/{idOrSlug}/stats", (string idOrSlug, HttpContext http) => Stats(http, idOrSlug));
        return endpoints;
    }

    public sealed record ScreenshotsBody(List<string>? Ids);

    public sealed record MediaDto(string Id, string Kind, string Url, int Width, int Height);

    public static void DeleteFiles(GameCatalog catalog, IEnumerable<StoredGameMedia> media)
    {
        foreach (var m in media)
            TryDelete(catalog.MediaFile(m));
    }

    /// <summary>PUT /api/games/{idOrSlug}/media?kind=cover|header|screenshot — the picture as the body.</summary>
    private static async Task<IResult> UploadMedia(string idOrSlug, HttpContext http)
    {
        var services = http.RequestServices;
        var options = services.GetRequiredService<GameServerOptions>();
        if (await Authenticate(http) is not { } userId)
            return Error(401, "unauthorized", "An API token is required (Authorization: Bearer tox_…)");

        long maxBytes = (long)options.GameMaxMediaMb * 1024 * 1024;
        if (http.Request.ContentLength > maxBytes)
            return Error(413, "too_large", $"A picture may be at most {options.GameMaxMediaMb} MB");
        using var body = new MemoryStream();
        var buffer = new byte[81920];
        int read;
        while ((read = await http.Request.Body.ReadAsync(buffer, http.RequestAborted)) > 0)
        {
            if (body.Length + read > maxBytes)
                return Error(413, "too_large", $"A picture may be at most {options.GameMaxMediaMb} MB");
            body.Write(buffer, 0, read);
        }
        try
        {
            var result = await AddPictureAsync(services, userId, idOrSlug, http.Request.Query["kind"].ToString(), body.ToArray());
            return Results.Json(result, statusCode: StatusCodes.Status201Created);
        }
        catch (GameRequestException e)
        {
            return Error(e.Status, e.Code, e.Message);
        }
    }

    public sealed record PictureAdded(GameDto Game, MediaDto Media, IReadOnlyList<string> Warnings);

    /// <summary>
    /// Attaches a picture (cover / header / screenshot) as <paramref name="userId"/> — the one
    /// path of the REST upload and the agent's <c>attach_media</c>. The file goes in first,
    /// named by a fresh id; the catalog then takes it; replaced pictures' files are deleted.
    /// </summary>
    public static async Task<PictureAdded> AddPictureAsync(IServiceProvider services, uint userId, string idOrSlug,
        string kind, byte[] bytes)
    {
        var server = services.GetRequiredService<GameServer>();
        var catalog = services.GetRequiredService<GameCatalog>();
        var users = services.GetRequiredService<UserDirectory>();
        if (ImageInfo.Read(bytes) is not { } image)
            throw new GameRequestException(400, "bad_image", "A picture must be a PNG, JPEG, WebP or GIF");
        var (contentType, width, height) = image;
        var game = catalog.Find(idOrSlug) ?? throw new GameRequestException(404, "not_found", "No such game");
        var media = new StoredGameMedia(GameCatalog.NewMediaId(), game.Id, kind, contentType,
            DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()) { Width = width, Height = height, Bytes = bytes.Length };
        var file = catalog.MediaFile(media);
        Directory.CreateDirectory(Path.GetDirectoryName(file)!);
        await File.WriteAllBytesAsync(file, bytes);
        try
        {
            var (view, replaced) = await server.RunOnTickAsync(() =>
            {
                var user = users.FindById(userId)
                    ?? throw new GameRequestException(401, "unauthorized", "The token's user no longer exists");
                return catalog.AddMedia(user, game.Id, media);
            });
            DeleteFiles(catalog, replaced);
            var added = view.Media.First(m => m.Id == media.Id);
            return new PictureAdded(ToDto(catalog, view),
                new MediaDto(added.Id, added.Kind, catalog.PublicUrl(GameCatalog.MediaPath(added)), width, height),
                contentType is "image/png" or "image/jpeg" || kind != GameCatalog.CoverKind
                    ? []
                    : ["Link previews show a JPEG or PNG cover most reliably"]);
        }
        catch
        {
            TryDelete(file);
            throw;
        }
    }

    /// <summary>GET /game-media/{gameId}/{id}.{ext} — a picture; immutable (an id is never reused).</summary>
    private static IResult ServeMedia(string gameId, string file, HttpContext http)
    {
        var catalog = http.RequestServices.GetRequiredService<GameCatalog>();
        var game = catalog.Find(gameId);
        var id = Path.GetFileNameWithoutExtension(file);
        var media = game?.Id == gameId ? game.Media.FirstOrDefault(m => m.Id == id) : null;
        if (media == null || GameCatalog.MediaPath(media) != $"/game-media/{gameId}/{file}")
            return Results.NotFound();
        var path = catalog.MediaFile(media);
        if (!File.Exists(path))
            return Results.NotFound();
        http.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        http.Response.Headers.XContentTypeOptions = "nosniff";
        return Results.File(path, media.ContentType);
    }

    public sealed record BoardBody(string? Title, bool? InvertSortOrder, string? ScoreType, int? DecimalOffset);

    private static GameView BoardOwner(GameCatalog catalog, UserAccount? user, string idOrSlug)
    {
        var game = catalog.Find(idOrSlug);
        if (game == null || !GameCatalog.CanSee(user, game))
            throw new GameRequestException(404, "not_found", "No such game");
        if (user == null || !(user.IsAdmin || user.Id == game.Game.OwnerUserId))
            throw new GameRequestException(403, "forbidden", "Boards are set up by the game's owner and server admins");
        return game;
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
        var userId = await Authenticate(http);
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

    /// <summary>
    /// Who the request acts as: an API token (<c>Authorization: Bearer tox_…</c> — an agent,
    /// a script) or the browser's own user key (<c>X-User-Key</c> — the game editor in the
    /// page; the same secret the socket identifies with, over the same TLS).
    /// </summary>
    private static async Task<uint?> Authenticate(HttpContext http)
    {
        var header = http.Request.Headers.Authorization.ToString();
        const string bearer = "Bearer ";
        if (header.StartsWith(bearer, StringComparison.OrdinalIgnoreCase))
            return http.RequestServices.GetRequiredService<ApiTokens>().Authenticate(header[bearer.Length..].Trim());
        var key = http.Request.Headers["X-User-Key"].ToString();
        if (key.Length == 0 || !UserDirectory.IsValidKey(key))
            return null;
        var users = http.RequestServices.GetRequiredService<UserDirectory>();
        return await http.RequestServices.GetRequiredService<GameServer>()
            .RunOnTickAsync(() => users.FindByKeyHash(UserDirectory.HashKey(key))?.Id);
    }

    private static IResult Error(int status, string code, string message)
        => Results.Json(new { error = code, message }, statusCode: status);

    /// <summary>
    /// PUT /api/games/{idOrSlug}/build?filename=game.zip&amp;version=0.2&amp;notes=… with the
    /// file as the body (<c>curl -T game.zip</c>): a new release, which becomes the current
    /// build. The body is streamed to disk, then <see cref="PublishBuildAsync"/>.
    /// </summary>
    private static async Task<IResult> UploadBuild(string idOrSlug, HttpContext http)
    {
        var services = http.RequestServices;
        var options = services.GetRequiredService<GameServerOptions>();
        if (await Authenticate(http) is not { } userId)
            return Error(401, "unauthorized", "An API token is required (Authorization: Bearer tox_…)");

        var fileName = Path.GetFileName(http.Request.Query["filename"].ToString());
        if (!GameBuild.IsAcceptedFileName(fileName))
            return Error(400, "bad_filename", "?filename= must name a .zip or a single .html file");

        long maxBytes = (long)options.GameMaxBuildMb * 1024 * 1024;
        if (http.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } limit)
            limit.MaxRequestBodySize = maxBytes;
        if (http.Request.ContentLength > maxBytes)
            return Error(413, "too_large", $"A build may be at most {options.GameMaxBuildMb} MB");

        var upload = NewUploadFile(options, Path.GetExtension(fileName));
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

            var result = await PublishBuildAsync(services, userId, idOrSlug, upload, fileName,
                http.Request.Query["version"].ToString(), http.Request.Query["notes"].ToString());
            return Results.Json(result, statusCode: StatusCodes.Status201Created);
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
        }
    }

    /// <summary>A fresh file in the upload area (deleted by whoever made it).</summary>
    public static string NewUploadFile(GameServerOptions options, string extension)
    {
        var uploads = Path.Combine(Path.GetFullPath(options.GamesDataPath), ".uploads");
        Directory.CreateDirectory(uploads);
        return Path.Combine(uploads, Guid.NewGuid().ToString("N") + extension.ToLowerInvariant());
    }

    /// <summary>
    /// Publishes an uploaded build (a file in the upload area) as the game's next release, as
    /// <paramref name="userId"/> — the one path of the REST upload and the agent's
    /// <c>complete_build</c>: a release number is reserved (never reused), the build is
    /// unpacked off the tick thread into <c>r{no}.tmp-…</c>, renamed, committed, and old
    /// releases beyond <c>GameKeepReleases</c> are deleted from disk. Throws
    /// <see cref="GameRequestException"/> / <see cref="BuildRejectedException"/>.
    /// </summary>
    public static async Task<BuildPublished> PublishBuildAsync(IServiceProvider services, uint userId, string idOrSlug,
        string upload, string fileName, string? version, string? notes)
    {
        var options = services.GetRequiredService<GameServerOptions>();
        var server = services.GetRequiredService<GameServer>();
        var catalog = services.GetRequiredService<GameCatalog>();
        var users = services.GetRequiredService<UserDirectory>();
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("WsServer.Games.Upload");
        if (!GameBuild.IsAcceptedFileName(fileName))
            throw new BuildRejectedException("A web build must be a .zip archive or a single .html file");

        UserAccount? user = null;
        var reserved = await server.RunOnTickAsync(() =>
        {
            user = users.FindById(userId)
                ?? throw new GameRequestException(401, "unauthorized", "The token's user no longer exists");
            return catalog.ReserveRelease(user, idOrSlug);
        });

        var staging = reserved.Directory + ".tmp-" + Guid.NewGuid().ToString("N")[..8];
        try
        {
            var build = await Task.Run(() => GameBuild.Unpack(upload, fileName, staging,
                (long)options.GameMaxUnpackedMb * 1024 * 1024, options.GameMaxFiles));
            Directory.Move(staging, reserved.Directory);
            var (game, release) = await server.RunOnTickAsync(() =>
                catalog.CommitRelease(user!, idOrSlug, reserved.No, build, version, notes));

            var stale = await server.RunOnTickAsync(() => catalog.StaleReleaseDirectories(game.Id));
            foreach (var dir in stale.Where(Directory.Exists))
            {
                try { Directory.Delete(dir, recursive: true); }
                catch (IOException e) { logger.LogWarning(e, "Could not delete old release {Dir}", dir); }
            }
            return new BuildPublished(ToDto(catalog, game), ToReleaseDto(catalog, game, release), build.Warnings);
        }
        finally
        {
            if (Directory.Exists(staging))
            {
                try { Directory.Delete(staging, recursive: true); } catch (IOException) { }
            }
        }
    }

    public sealed record BuildPublished(GameDto Game, ReleaseDto Release, IReadOnlyList<string> Warnings);

    public sealed record StatsTotals(long Views, long Launches, long Plays, long ActiveMs);

    public sealed record SessionStats(int Sessions, long MedianMs, long LongestMs, int AtLeast1Min, int AtLeast3Min,
        int AtLeast10Min);

    public sealed record StatsDto(string? GameId, int Days, StatsTotals? Totals, SessionStats Sessions, long Players,
        long ReturningPlayers, IReadOnlyList<GameDay> Daily, IReadOnlyList<NamedCount> Events,
        IReadOnlyList<NamedCount> Levels, IReadOnlyList<NamedCount> Sources);

    private static async Task<IResult> Stats(HttpContext http, string? idOrSlug)
    {
        var services = http.RequestServices;
        if (await Authenticate(http) is not { } userId)
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

    public static void TryDelete(string file)
    {
        try { File.Delete(file); } catch (IOException) { }
    }

    public static GameDto ToDto(GameCatalog catalog, GameView view)
    {
        var g = view.Game;
        return new GameDto(g.Id, g.Slug, g.Title, g.Tagline, g.Description, g.Tags,
            g.IsPublic ? "public" : "team", view.RoomId, catalog.PageUrl(g),
            view.Current is { } current ? catalog.PlayUrl(g.Id, current) : null,
            Iso(g.CreatedMs), Iso(g.UpdatedMs),
            view.Releases.Reverse().Select(r => ToReleaseDto(catalog, view, r)).ToList(),
            view.Cover is { } cover ? Media(catalog, cover) : null,
            view.Header is { } header ? Media(catalog, header) : null,
            view.Screenshots.Select(m => Media(catalog, m)).ToList());
    }

    private static MediaDto Media(GameCatalog catalog, StoredGameMedia m)
        => new(m.Id, m.Kind, catalog.PublicUrl(GameCatalog.MediaPath(m)), m.Width, m.Height);

    public static ReleaseDto ToReleaseDto(GameCatalog catalog, GameView view, StoredGameRelease r)
        => new(r.No, r.Version, r.Notes, r.AuthorUserId, Iso(r.CreatedMs), r.EntryPath, r.Files, r.Bytes,
            Directory.Exists(catalog.ReleaseDirectory(view.Id, r.No)) ? catalog.PlayUrl(view.Id, r) : null);

    private static string Iso(long ms) => DateTimeOffset.FromUnixTimeMilliseconds(ms).ToString("O");
}

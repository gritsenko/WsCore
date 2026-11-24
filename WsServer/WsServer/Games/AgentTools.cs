using System.ComponentModel;
using ModelContextProtocol;
using ModelContextProtocol.Server;
using WsServer.Sessions;

namespace WsServer.Games;

/// <summary>An entry of <c>attach_media</c>'s screenshot list: keep a picture, or add an uploaded one.</summary>
public sealed class ScreenshotRef
{
    public string? Id { get; set; }
    public string? SessionId { get; set; }
}

/// <summary>A file an agent is about to upload (<c>push_media</c>).</summary>
public sealed class FileToPush
{
    public string Filename { get; set; } = string.Empty;
    public long Size { get; set; }
}

/// <summary>
/// The games portal's MCP tools at <c>/agent/mcp</c> — the MY.GAMES JAM portal's tool names,
/// arguments and answers (its <c>agent_host.py</c>), so an agent or skill that publishes to
/// the jam publishes here by changing the address. Acting as the token's user (server admins
/// only, for now); every operation is the same code the REST API runs.
/// </summary>
[McpServerToolType]
public sealed class AgentTools(IHttpContextAccessor http, IServiceProvider services)
{
    private GameServer Server => services.GetRequiredService<GameServer>();
    private GameCatalog Catalog => services.GetRequiredService<GameCatalog>();
    private UploadSessions Uploads => services.GetRequiredService<UploadSessions>();
    private GameServerOptions Options => services.GetRequiredService<GameServerOptions>();

    // ---- who ----------------------------------------------------------------------------

    private uint TokenUser()
    {
        var header = http.HttpContext?.Request.Headers.Authorization.ToString() ?? string.Empty;
        var token = header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? header[7..].Trim() : null;
        return services.GetRequiredService<ApiTokens>().Authenticate(token)
            ?? throw new McpException("No valid API token (Authorization: Bearer tox_…)");
    }

    /// <summary>Runs on the tick thread as the token's user; catalog refusals become tool errors.</summary>
    private async Task<T> AsUser<T>(Func<UserAccount, T> action)
    {
        var userId = TokenUser();
        var users = services.GetRequiredService<UserDirectory>();
        try
        {
            return await Server.RunOnTickAsync(() =>
            {
                var user = users.FindById(userId) ?? throw new McpException("The token's user no longer exists");
                return action(user);
            });
        }
        catch (GameRequestException e)
        {
            throw new McpException(e.Message);
        }
    }

    private static async Task<T> Mapped<T>(Func<Task<T>> action)
    {
        try { return await action(); }
        catch (GameRequestException e) { throw new McpException(e.Message); }
        catch (BuildRejectedException e) { throw new McpException(e.Message); }
    }

    [McpServerTool(Name = "whoami"), Description("Who this connection acts as, and whether it may publish games.")]
    public Task<object> WhoAmI() => AsUser<object>(u => new
    {
        userId = u.Id,
        name = u.Name,
        login = u.Login,
        isAdmin = u.IsAdmin,
        canPublish = GameCatalog.CanPublish(u),
        via = "personal token",
        expires = $"after {Options.ApiTokenIdleDays:0} days without use",
    });

    [McpServerTool(Name = "list_scopes"), Description(
        "Where a new game can be created. TOX has only your own games: 'personal' (no crews, studios or jams).")]
    public object ListScopes() => new { scopes = new[] { new { scope = "personal", title = "Your games" } } };

    [McpServerTool(Name = "list_projects"), Description("The games this person may write to (server admins: all).")]
    public Task<object> ListProjects() => AsUser<object>(u => Catalog.Games
        .Where(g => GameCatalog.CanPublish(u))
        .OrderByDescending(g => g.Game.UpdatedMs)
        .Select(g => new
        {
            id = g.Id, slug = g.Game.Slug, title = g.Game.Title,
            visibility = g.Game.IsPublic ? "public" : "team",
            releaseId = g.Current?.No, version = g.Current?.Version,
            pageUrl = Catalog.PageUrl(g.Game),
        }).ToList());

    [McpServerTool(Name = "get_project"), Description(
        "One game in full: fields, pictures (with ids for attach_media), releases (releaseId for update_release), " +
        "leaderboards and links. projectId is the game's id or slug.")]
    public Task<object> GetProject(string projectId) => AsUser<object>(u =>
    {
        var game = Editable(u, projectId);
        return new
        {
            project = GamesHttp.ToDto(Catalog, game),
            leaderboards = services.GetRequiredService<Leaderboards>().BoardsOf(game.Id)
                .Select(b => new { name = b.Name, title = b.Title, invertSortOrder = b.InvertSortOrder, scoreType = b.ScoreType }),
            counters = services.GetRequiredService<GameAnalytics>().CountersOf(game.Id),
        };
    });

    private GameView Editable(UserAccount u, string projectId)
    {
        if (!GameCatalog.CanPublish(u))
            throw new McpException("Only server admins may publish games");
        return Catalog.Find(projectId) ?? throw new McpException("No such game");
    }

    [McpServerTool(Name = "create_project"), Description(
        "Start a game. It is a DRAFT (seen by its owner and server admins) until set_visibility('public'). " +
        "scope: 'personal' or empty (TOX has no crews, studios or jams).")]
    public Task<object> CreateProject(string title, string? scope = null, string? tagline = null,
        string? description = null, List<string>? tags = null, string? teamId = null)
    {
        if (!string.IsNullOrEmpty(scope) && scope != "personal" || !string.IsNullOrEmpty(teamId))
            throw new McpException("TOX has only personal games: use scope 'personal' (see list_scopes)");
        return AsUser<object>(u => GamesHttp.ToDto(Catalog, Catalog.Create(u, new GameFields(title, tagline, description, tags))));
    }

    [McpServerTool(Name = "update_project"), Description(
        "Write the text fields of a game. ONLY the fields named are written; anything omitted stays as it is.")]
    public Task<object> UpdateProject(string projectId, string? title = null, string? tagline = null,
        string? description = null, List<string>? tags = null)
        => AsUser<object>(u => GamesHttp.ToDto(Catalog, Catalog.Update(u, Editable(u, projectId).Id,
            new GameFields(title, tagline, description, tags))));

    [McpServerTool(Name = "set_visibility"), Description(
        "Who may see the game: 'public' (everyone; it appears in the catalog) or 'team' (back to a draft: " +
        "its owner and server admins). Only when the person asks for it.")]
    public Task<object> SetVisibility(string projectId, string visibility)
    {
        var isPublic = visibility switch
        {
            "public" => true,
            "team" or "draft" => false,
            _ => throw new McpException("visibility is 'public' or 'team'"),
        };
        return AsUser<object>(u => GamesHttp.ToDto(Catalog, Catalog.SetPublic(u, Editable(u, projectId).Id, isPublic)));
    }

    // ---- builds -------------------------------------------------------------------------

    private string UploadBase() => Catalog.PublicUrl("/agent/upload");

    private static object Commands(string url, string ticket, string filename, int chunks, long chunk)
        => chunks == 1
            ? new
            {
                bash = $"curl -f -T \"{filename}\" \"{url}/0?t={ticket}\"",
                powershell = $"curl.exe -f -T \"{filename}\" \"{url}/0?t={ticket}\"",
            }
            : new
            {
                bash = $"split -b {chunk} -d -a 4 \"{filename}\" tox-part- && i=0 && for p in tox-part-*; do " +
                       $"curl -f -T \"$p\" \"{url}/$i?t={ticket}\" || echo \"chunk $i failed\"; i=$((i+1)); done; rm -f tox-part-*",
                powershell = $"$f=[IO.File]::OpenRead(\"{filename}\"); $b=New-Object byte[] {chunk}; $i=0; " +
                             $"while(($n=$f.Read($b,0,$b.Length)) -gt 0){{ $t=[IO.Path]::GetTempFileName(); " +
                             $"$o=[IO.File]::Create($t); $o.Write($b,0,$n); $o.Close(); curl.exe -f -T $t \"{url}/$i?t={ticket}\"; " +
                             "Remove-Item $t; $i++ }; $f.Close()",
            };

    [McpServerTool(Name = "push_build"), Description(
        "Open an upload for this game's web build (a .zip with an HTML entry, or one .html) and return the commands " +
        "that carry the bytes. size is the exact file size in bytes. Run a command, then complete_build(sessionId).")]
    public async Task<object> PushBuild(string projectId, string filename, long size)
    {
        if (size <= 0)
            throw new McpException("Empty file");
        if (size > (long)Options.GameMaxBuildMb * 1024 * 1024)
            throw new McpException($"File exceeds {Options.GameMaxBuildMb} MB");
        if (!GameBuild.IsAcceptedFileName(filename))
            throw new McpException("A web build must be a .zip archive or a single .html file");
        var (userId, gameId) = await AsUser(u => (u.Id, Editable(u, projectId).Id));
        var (session, ticket) = Uploads.Create(userId, gameId, "build", filename, size);
        var url = $"{UploadBase()}/{session.Id}";
        return new
        {
            sessionId = session.Id, chunkSize = session.ChunkSize, chunks = session.Chunks, uploadUrl = url,
            commands = Commands(url, ticket, session.FileName, session.Chunks, session.ChunkSize),
            next = "run one of the commands, then call complete_build(sessionId)",
        };
    }

    [McpServerTool(Name = "upload_status"), Description("What has arrived so far — the answer a resume is built on.")]
    public object UploadStatus(string sessionId)
    {
        var session = Uploads.Get(sessionId, TokenUser()) ?? throw new McpException("No such upload (or it expired)");
        var received = Uploads.Received(session);
        return new
        {
            sessionId = session.Id, chunks = session.Chunks, received = received.Count,
            missing = Enumerable.Range(0, session.Chunks).Except(received).ToList(),
        };
    }

    [McpServerTool(Name = "complete_build"), Description(
        "Assemble what was uploaded, host it, and make it the game's current build. Every push is a RELEASE: " +
        "version names it ('0.4.1'; v<n> when empty), notes say what changed (Markdown, for the players — from the " +
        "commits since the last push; ask the person when there is nothing to go on). The reply carries the links.")]
    public async Task<object> CompleteBuild(string sessionId, string version = "", string notes = "")
    {
        var userId = TokenUser();
        var session = Uploads.Get(sessionId, userId) ?? throw new McpException("No such upload (or it expired)");
        if (session.Target != "build")
            throw new McpException("That upload is not a build");
        var file = await Uploads.AssembleAsync(session)
            ?? throw new McpException($"Not everything arrived — upload_status says what is missing");
        try
        {
            var published = await Mapped(() => GamesHttp.PublishBuildAsync(services, userId, session.GameId, file,
                session.FileName, version, notes));
            Uploads.Discard(session);
            return new
            {
                project = published.Game,
                release = published.Release,
                releaseId = published.Release.No,
                links = new { page = published.Game.PageUrl, play = published.Game.PlayUrl },
                warnings = published.Warnings,
            };
        }
        finally
        {
            GamesHttp.TryDelete(file);
        }
    }

    [McpServerTool(Name = "update_release"), Description(
        "Rename a release or write its notes — only what is named. releaseId comes from complete_build or get_project.")]
    public Task<object> UpdateRelease(string projectId, int releaseId, string? version = null, string? notes = null)
        => AsUser<object>(u =>
        {
            var (game, release) = Catalog.UpdateRelease(u, Editable(u, projectId).Id, (uint)releaseId, version, notes);
            return GamesHttp.ToReleaseDto(Catalog, game, release);
        });

    // ---- pictures -----------------------------------------------------------------------

    [McpServerTool(Name = "push_media"), Description(
        "Open an upload per picture and return the commands that carry the bytes. files = [{filename, size}] — the size " +
        "in bytes is required and exact. Then attach_media with the session ids. The author's own pictures only: " +
        "never a picture you made or chose.")]
    public async Task<object> PushMedia(string projectId, List<FileToPush> files)
    {
        if (files.Count == 0)
            throw new McpException("No files");
        var max = (long)Options.GameMaxMediaMb * 1024 * 1024;
        foreach (var f in files)
        {
            var ext = Path.GetExtension(f.Filename).ToLowerInvariant();
            if (ext is not (".png" or ".jpg" or ".jpeg" or ".webp" or ".gif"))
                throw new McpException($"{f.Filename}: pictures only (png / jpg / webp / gif)");
            if (f.Size <= 0 || f.Size > max)
                throw new McpException($"{f.Filename}: the size must be 1 byte … {Options.GameMaxMediaMb} MB");
        }
        var (userId, gameId) = await AsUser(u => (u.Id, Editable(u, projectId).Id));
        return new
        {
            uploads = files.Select(f =>
            {
                var (session, ticket) = Uploads.Create(userId, gameId, "media", f.Filename, f.Size);
                var url = $"{UploadBase()}/{session.Id}";
                return new
                {
                    filename = session.FileName, sessionId = session.Id, chunks = session.Chunks,
                    commands = Commands(url, ticket, session.FileName, session.Chunks, session.ChunkSize),
                };
            }).ToList(),
            next = "run every command, then attach_media(projectId, screenshots / cover / header)",
        };
    }

    [McpServerTool(Name = "attach_media"), Description(
        "Attach uploaded pictures. screenshots is the pack AS IT SHOULD END UP, in order: {\"id\"} keeps an existing one " +
        "(ids from get_project), {\"sessionId\"} adds an upload; a shorter list removes the rest; omit it to leave the " +
        "screenshots alone. cover / header: a session id from push_media (the author's choice). Only the slots named " +
        "are touched.")]
    public async Task<object> AttachMedia(string projectId, List<ScreenshotRef>? screenshots = null, string? cover = null,
        string? header = null)
    {
        if (screenshots == null && cover == null && header == null)
            throw new McpException("Nothing to attach: name screenshots, cover or header");
        var userId = TokenUser();
        var gameId = await AsUser(u => Editable(u, projectId).Id);

        async Task<string> Add(string sessionId, string kind)
        {
            var session = Uploads.Get(sessionId, userId);
            if (session == null || session.Target != "media" || session.GameId != gameId)
                throw new McpException($"Upload {sessionId} is not this game's picture (or it expired)");
            var file = await Uploads.AssembleAsync(session)
                ?? throw new McpException($"Upload {sessionId} is incomplete — upload_status says what is missing");
            try
            {
                var added = await Mapped(async () => await GamesHttp.AddPictureAsync(services, userId, gameId, kind,
                    await File.ReadAllBytesAsync(file)));
                Uploads.Discard(session);
                return added.Media.Id;
            }
            finally
            {
                GamesHttp.TryDelete(file);
            }
        }

        if (cover != null) await Add(cover, GameCatalog.CoverKind);
        if (header != null) await Add(header, GameCatalog.HeaderKind);
        if (screenshots != null)
        {
            if (screenshots.Any(s => (s.Id == null) == (s.SessionId == null)))
                throw new McpException("Each screenshot entry is {\"id\"} or {\"sessionId\"}");
            // Drop the ones left out first (room under the cap), then add the new, then the order.
            var kept = screenshots.Where(s => s.Id != null).Select(s => s.Id!).ToList();
            await AsUser(u =>
            {
                var (_, removed) = Catalog.SetScreenshots(u, gameId, kept);
                GamesHttp.DeleteFiles(Catalog, removed);
                return 0;
            });
            var order = new List<string>();
            foreach (var s in screenshots)
                order.Add(s.Id ?? await Add(s.SessionId!, GameCatalog.ScreenshotKind));
            await AsUser(u => Catalog.SetScreenshots(u, gameId, order));
        }
        return await AsUser<object>(u => GamesHttp.ToDto(Catalog, Editable(u, gameId)));
    }

    // ---- the handbook -------------------------------------------------------------------

    [McpServerTool(Name = "docs"), Description(
        "The portal's handbook in Markdown: no argument = the contents; docs('agent'), docs('web-build'), " +
        "docs('sdk'), docs('sdk-leaderboards').")]
    public string Docs(string article = "", string lang = "en")
    {
        var name = string.IsNullOrWhiteSpace(article) ? "index" : article.Trim().ToLowerInvariant();
        using var stream = typeof(AgentTools).Assembly.GetManifestResourceStream($"docs/{name}.md")
            ?? throw new McpException($"No article '{article}' — docs() lists them");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}

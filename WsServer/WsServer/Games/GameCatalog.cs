using System.Collections.Immutable;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Game.ServerLogic.Games.Events;
using WsServer.Abstract;
using WsServer.Moderation;
using WsServer.Persistence;
using WsServer.Rooms;
using WsServer.Sessions;

namespace WsServer.Games;

/// <summary>A game with its releases (oldest first), as the catalog holds it. Immutable.</summary>
public sealed record GameView(StoredGame Game, ImmutableList<StoredGameRelease> Releases)
{
    public string Id => Game.Id;
    public string RoomId => GameCatalog.RoomIdOf(Game.Id);
    public StoredGameRelease? Current => Releases.Count > 0 ? Releases[^1] : null;
}

/// <summary>A refused catalog operation: an HTTP status, a stable code and words for a human.</summary>
public sealed class GameRequestException(int status, string code, string message) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
}

/// <summary>The editable text fields of a game; null = leave as it is.</summary>
public sealed record GameFields(string? Title = null, string? Tagline = null, string? Description = null,
    IReadOnlyList<string>? Tags = null, string? Slug = null);

/// <summary>
/// The games portal: the games, their releases, and the room each one is played in.
///
/// Threading: every change runs on the tick thread (HTTP endpoints go through
/// <see cref="GameServerBase{TGameModel}.RunOnTickAsync{T}"/>), while reads — the HTTP
/// catalog, the games origin looking up a release — may come from any thread, so the games
/// are an immutable map swapped on every change.
///
/// A game's room (<c>g-{id}</c>) is a hidden text-chat room: joined by id from the portal,
/// never listed among the channels. While the game is a draft the room is private to its
/// owner and server admins (<see cref="ChannelPermissions.SetOwnerOnly"/>), and so is the
/// game in the catalog. Publishing is for server admins only, for now.
/// </summary>
public sealed class GameCatalog
{
    public const string RoomPrefix = "g-";

    private static readonly Regex SlugPattern = new("^[a-z0-9][a-z0-9-]{1,39}$", RegexOptions.CultureInvariant);

    private readonly IChatStorage _storage;
    private readonly GameServerOptions _options;
    private readonly RoomManager _rooms;
    private readonly ChannelPermissions _permissions;
    private readonly SessionManager _sessions;
    private readonly IGameMessenger _messenger;
    private readonly ILogger<GameCatalog> _logger;
    private ImmutableDictionary<string, GameView> _games;

    /// <summary>Replaceable in tests.</summary>
    public Func<long> NowMs { get; set; } = () => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    /// <summary>A game's play count for the cards (set by GameAnalytics, which owns the numbers).</summary>
    public Func<string, uint> PlaysOf { get; set; } = _ => 0;

    public GameCatalog(IChatStorage storage, StorageSnapshot snapshot, GameServerOptions options, RoomManager rooms,
        ChannelPermissions permissions, SessionManager sessions, IGameMessenger messenger, ILogger<GameCatalog> logger)
    {
        _storage = storage;
        _options = options;
        _rooms = rooms;
        _permissions = permissions;
        _sessions = sessions;
        _messenger = messenger;
        _logger = logger;

        var releases = snapshot.GameReleases.GroupBy(r => r.GameId)
            .ToDictionary(g => g.Key, g => g.OrderBy(r => r.No).ToImmutableList());
        _games = snapshot.Games.ToImmutableDictionary(g => g.Id,
            g => new GameView(g, releases.GetValueOrDefault(g.Id) ?? ImmutableList<StoredGameRelease>.Empty));
    }

    /// <summary>The portal is configured (a games origin to serve builds from).</summary>
    public bool Enabled => !string.IsNullOrWhiteSpace(_options.GamesOrigin);

    public static string RoomIdOf(string gameId) => RoomPrefix + gameId;

    public IReadOnlyCollection<GameView> Games => _games.Values.ToList();

    /// <summary>A game by id or slug (any thread).</summary>
    public GameView? Find(string idOrSlug)
    {
        var games = _games;
        if (games.TryGetValue(idOrSlug, out var byId))
            return byId;
        return games.Values.FirstOrDefault(g => g.Game.Slug == idOrSlug.ToLowerInvariant());
    }

    public static bool CanSee(UserAccount? user, GameView game)
        => game.Game.IsPublic || (user != null && (user.IsAdmin || user.Id == game.Game.OwnerUserId));

    /// <summary>Who may create and change games: server admins (a publisher role may follow).</summary>
    public static bool CanPublish(UserAccount? user) => user is { IsAdmin: true };

    public string ReleaseDirectory(string gameId, uint releaseNo)
        => Path.Combine(Path.GetFullPath(_options.GamesDataPath), gameId, "r" + releaseNo);

    /// <summary>The entry URL of a release on the games origin.</summary>
    public string PlayUrl(string gameId, StoredGameRelease release)
        => $"{_options.GamesOrigin.TrimEnd('/')}/g/{gameId}/r{release.No}/{EscapePath(release.EntryPath)}";

    /// <summary>The game's page in the TOX client (the first portal origin).</summary>
    public string PageUrl(StoredGame game)
        => $"{(_options.PortalOrigins.FirstOrDefault() ?? string.Empty).TrimEnd('/')}/games/{game.Slug}";

    private static string EscapePath(string path) => string.Join('/', path.Split('/').Select(Uri.EscapeDataString));

    // ---- startup ----------------------------------------------------------------------

    /// <summary>Creates the rooms of the stored games (called once, with the built-in rooms).</summary>
    public void CreateRooms()
    {
        foreach (var game in _games.Values)
        {
            CreateRoom(game.Game);
            _permissions.SetOwnerOnly(game.RoomId, game.Game.IsPublic ? null : game.Game.OwnerUserId);
        }
    }

    private void CreateRoom(StoredGame game)
        => _rooms.CreateRoom(RoomIdOf(game.Id), game.Title, new[] { RoomCompatibility.TextChat },
            isPersistent: true, isHidden: true);

    // ---- changes (tick thread) ----------------------------------------------------------

    public GameView Create(UserAccount by, GameFields fields)
    {
        RequirePublisher(by);
        if (!Enabled)
            throw new GameRequestException(503, "disabled", "The games portal is not configured on this server");

        var title = CleanTitle(fields.Title);
        var id = NewId();
        var now = NowMs();
        var game = new StoredGame(id, UniqueSlug(fields.Slug, title, id, null), by.Id, title)
        {
            Tagline = Clean(fields.Tagline, _options.MaxGameTaglineLength),
            Description = CleanText(fields.Description, _options.MaxGameDescriptionLength),
            Tags = CleanTags(fields.Tags),
            CreatedMs = now,
            UpdatedMs = now,
        };
        var view = new GameView(game, ImmutableList<StoredGameRelease>.Empty);
        _games = _games.SetItem(id, view);
        _storage.SaveGame(game);
        CreateRoom(game);
        _permissions.SetOwnerOnly(view.RoomId, game.OwnerUserId);
        _logger.LogInformation("Game {GameId} ({Slug}) created by user {UserId}", id, game.Slug, by.Id);
        BroadcastCatalog();
        return view;
    }

    public GameView Update(UserAccount by, string idOrSlug, GameFields fields)
    {
        var view = Editable(by, idOrSlug);
        var game = view.Game;
        var updated = game with
        {
            Title = fields.Title != null ? CleanTitle(fields.Title) : game.Title,
            Tagline = fields.Tagline != null ? Clean(fields.Tagline, _options.MaxGameTaglineLength) : game.Tagline,
            Description = fields.Description != null
                ? CleanText(fields.Description, _options.MaxGameDescriptionLength)
                : game.Description,
            Tags = fields.Tags != null ? CleanTags(fields.Tags) : game.Tags,
            Slug = fields.Slug != null ? UniqueSlug(fields.Slug, game.Title, game.Id, game.Id) : game.Slug,
            UpdatedMs = NowMs(),
        };
        view = Save(view with { Game = updated });
        if (_rooms.GetRoom(view.RoomId) is { } room)
            room.Name = updated.Title;
        BroadcastCatalog();
        return view;
    }

    /// <summary>Publishes the game (everyone sees it) or takes it back to a draft.</summary>
    public GameView SetPublic(UserAccount by, string idOrSlug, bool isPublic)
    {
        var view = Editable(by, idOrSlug);
        if (view.Game.IsPublic == isPublic)
            return view;
        view = Save(view with { Game = view.Game with { IsPublic = isPublic, UpdatedMs = NowMs() } });
        _permissions.SetOwnerOnly(view.RoomId, isPublic ? null : view.Game.OwnerUserId);
        if (!isPublic)
            _sessions.EvictUnauthorized(view.RoomId);
        _logger.LogInformation("Game {GameId} is now {State}", view.Id, isPublic ? "public" : "a draft");
        BroadcastCatalog();
        return view;
    }

    /// <summary>
    /// Hands out the next release number of the game (never reused, even when the upload
    /// then fails) and where its files go. The caller unpacks there and then calls
    /// <see cref="CommitRelease"/>.
    /// </summary>
    public (uint No, string Directory) ReserveRelease(UserAccount by, string idOrSlug)
    {
        var view = Editable(by, idOrSlug);
        var no = view.Game.NextReleaseNo;
        Save(view with { Game = view.Game with { NextReleaseNo = no + 1 } });
        return (no, ReleaseDirectory(view.Id, no));
    }

    public (GameView Game, StoredGameRelease Release) CommitRelease(UserAccount by, string gameId, uint no,
        UnpackedBuild build, string? version, string? notes)
    {
        var view = Editable(by, gameId);
        var now = NowMs();
        var release = new StoredGameRelease(view.Id, no, by.Id, now)
        {
            Version = Clean(version, 32) is { Length: > 0 } v ? v : "v" + no,
            Notes = CleanText(notes, _options.MaxReleaseNotesLength),
            EntryPath = build.EntryPath,
            Files = build.Files,
            Bytes = build.Bytes,
        };
        _storage.SaveGameRelease(release);
        view = Save(view with
        {
            Game = view.Game with { UpdatedMs = now },
            Releases = view.Releases.Add(release).Sort((a, b) => a.No.CompareTo(b.No)),
        });
        _logger.LogInformation("Game {GameId}: release {No} ({Version}, {Files} files, {Bytes} bytes)",
            view.Id, no, release.Version, release.Files, release.Bytes);
        BroadcastCatalog();
        return (view, release);
    }

    /// <summary>
    /// Release directories of the game that are no longer kept (all but the newest
    /// <see cref="GameServerOptions.GameKeepReleases"/>) — for the caller to delete off the
    /// tick thread. Their records stay.
    /// </summary>
    public IReadOnlyList<string> StaleReleaseDirectories(string gameId)
    {
        if (!_games.TryGetValue(gameId, out var view) || _options.GameKeepReleases <= 0)
            return [];
        return view.Releases.Take(Math.Max(0, view.Releases.Count - _options.GameKeepReleases))
            .Select(r => ReleaseDirectory(gameId, r.No)).ToList();
    }

    private GameView Editable(UserAccount by, string idOrSlug)
    {
        RequirePublisher(by);
        return Find(idOrSlug) ?? throw new GameRequestException(404, "not_found", "No such game");
    }

    private static void RequirePublisher(UserAccount by)
    {
        if (!CanPublish(by))
            throw new GameRequestException(403, "forbidden", "Only server admins may publish games");
    }

    private GameView Save(GameView view)
    {
        _games = _games.SetItem(view.Id, view);
        _storage.SaveGame(view.Game);
        return view;
    }

    // ---- the catalog to clients ---------------------------------------------------------

    public GameCatalogEvent BuildCatalog(UserAccount? user) => new()
    {
        Games = _games.Values.Where(g => CanSee(user, g))
            .OrderByDescending(g => g.Game.UpdatedMs).ThenBy(g => g.Id, StringComparer.Ordinal)
            .Select(ToInfo).ToList(),
    };

    public GameInfo ToInfo(GameView view)
    {
        var game = view.Game;
        var current = view.Current;
        return new GameInfo
        {
            Id = game.Id,
            Slug = game.Slug,
            Title = game.Title,
            Tagline = game.Tagline,
            Description = game.Description,
            Tags = game.Tags.ToList(),
            IsPublic = game.IsPublic,
            RoomId = view.RoomId,
            OwnerUserId = game.OwnerUserId,
            ReleaseNo = current?.No ?? 0,
            Version = current?.Version ?? string.Empty,
            PlayUrl = current != null ? PlayUrl(game.Id, current) : string.Empty,
            CreatedMs = game.CreatedMs,
            UpdatedMs = game.UpdatedMs,
            Plays = PlaysOf(game.Id),
        };
    }

    /// <summary>The catalog to one connection (on connect and when what it may see changed).</summary>
    public void SendCatalog(uint clientId)
    {
        if (!Enabled)
            return;
        _messenger.Send(clientId, BuildCatalog(_sessions.Get(clientId)?.User));
    }

    /// <summary>
    /// The catalog to every connection after a change: the public one (serialized once) to
    /// whoever sees no draft, a personal one to drafts' owners and server admins.
    /// </summary>
    public void BroadcastCatalog()
    {
        var drafts = _games.Values.Where(g => !g.Game.IsPublic).ToList();
        bool SeesDraft(uint clientId) => drafts.Count > 0 && _sessions.Get(clientId)?.User is { } user
            && drafts.Any(d => CanSee(user, d));

        _messenger.BroadcastWhere(BuildCatalog(null), id => !SeesDraft(id));
        if (drafts.Count == 0)
            return;
        foreach (var user in _sessions.Users())
        {
            if (!drafts.Any(d => CanSee(user, d)))
                continue;
            var personal = BuildCatalog(user);
            foreach (var session in user.Sessions)
                _messenger.Send(session.Id, personal);
        }
    }

    // ---- input ------------------------------------------------------------------------

    private string CleanTitle(string? title)
    {
        var clean = Clean(title, _options.MaxGameTitleLength);
        if (clean.Length == 0)
            throw new GameRequestException(400, "bad_title", "A game needs a title");
        return clean;
    }

    private static string Clean(string? value, int maxLength) => InputSanitizer.Clean(value ?? string.Empty, maxLength).Trim();

    // Multi-line text (description, release notes): line breaks kept, other control
    // characters dropped, length capped.
    private static string CleanText(string? value, int maxLength)
    {
        if (string.IsNullOrEmpty(value))
            return string.Empty;
        var lines = value.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n')
            .Select(line => InputSanitizer.Clean(line, maxLength).TrimEnd());
        var text = string.Join('\n', lines).Trim();
        return text.Length > maxLength ? text[..maxLength] : text;
    }

    private IReadOnlyList<string> CleanTags(IReadOnlyList<string>? tags)
        => (tags ?? []).Select(t => Clean(t, 24).ToLowerInvariant()).Where(t => t.Length > 0)
            .Distinct().Take(_options.MaxGameTags).ToList();

    private string UniqueSlug(string? requested, string title, string gameId, string? selfId)
    {
        string slug;
        if (!string.IsNullOrWhiteSpace(requested))
        {
            slug = requested.Trim().ToLowerInvariant();
            if (!SlugPattern.IsMatch(slug))
                throw new GameRequestException(400, "bad_slug", "A slug is 2–40 of a-z, 0-9 and '-', starting with a letter or digit");
            if (IsTaken(slug, selfId))
                throw new GameRequestException(409, "slug_taken", "That slug is taken");
            return slug;
        }

        var baseSlug = Slugify(title);
        if (baseSlug.Length < 2)
            baseSlug = gameId;
        slug = baseSlug;
        for (var i = 2; IsTaken(slug, selfId); i++)
            slug = $"{baseSlug[..Math.Min(baseSlug.Length, 36)]}-{i}";
        return slug;
    }

    // "stats" is reserved: /api/games/stats is the portal's numbers.
    private bool IsTaken(string slug, string? selfId)
        => slug == "stats" || _games.Values.Any(g => g.Id != selfId && (g.Game.Slug == slug || g.Id == slug));

    private static readonly Dictionary<char, string> Translit = new()
    {
        ['а'] = "a", ['б'] = "b", ['в'] = "v", ['г'] = "g", ['д'] = "d", ['е'] = "e", ['ё'] = "e", ['ж'] = "zh",
        ['з'] = "z", ['и'] = "i", ['й'] = "y", ['к'] = "k", ['л'] = "l", ['м'] = "m", ['н'] = "n", ['о'] = "o",
        ['п'] = "p", ['р'] = "r", ['с'] = "s", ['т'] = "t", ['у'] = "u", ['ф'] = "f", ['х'] = "h", ['ц'] = "ts",
        ['ч'] = "ch", ['ш'] = "sh", ['щ'] = "sch", ['ъ'] = "", ['ы'] = "y", ['ь'] = "", ['э'] = "e", ['ю'] = "yu",
        ['я'] = "ya",
    };

    /// <summary>A URL slug from a title: transliterated, lower-case, a-z0-9 runs joined by '-', ≤ 40.</summary>
    public static string Slugify(string title)
    {
        var sb = new StringBuilder();
        foreach (var ch in title.ToLowerInvariant())
        {
            if (ch is >= 'a' and <= 'z' or >= '0' and <= '9')
                sb.Append(ch);
            else if (Translit.TryGetValue(ch, out var latin))
                sb.Append(latin);
            else if (sb.Length > 0 && sb[^1] != '-')
                sb.Append('-');
        }
        var slug = sb.ToString().Trim('-');
        return slug.Length > 40 ? slug[..40].TrimEnd('-') : slug;
    }

    private const string IdAlphabet = "0123456789abcdefghijklmnopqrstuvwxyz";

    private string NewId()
    {
        while (true)
        {
            var id = string.Create(10, 0, (span, _) =>
            {
                for (var i = 0; i < span.Length; i++)
                    span[i] = IdAlphabet[RandomNumberGenerator.GetInt32(IdAlphabet.Length)];
            });
            if (!_games.ContainsKey(id) && !_games.Values.Any(g => g.Game.Slug == id))
                return id;
        }
    }
}

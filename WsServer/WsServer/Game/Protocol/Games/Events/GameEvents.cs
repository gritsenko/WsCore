using System.Collections.Generic;
using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Games.Events;

/// <summary>
/// The games portal's catalog as this connection may see it: every public game, plus the
/// drafts its user owns (all drafts for a server admin). Sent on connect (public only —
/// nobody is identified yet), after every identify / login / logout and whenever a game
/// changes.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class GameCatalogEvent : IServerEvent
{
    public static byte TypeId => 150;

    [MemoryPackAllowSerialize]
    public List<GameInfo> Games { get; set; } = new();
}

/// <summary>One game of the catalog.</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class GameInfo
{
    public string Id { get; set; } = string.Empty;
    /// <summary>The page is /games/{Slug}.</summary>
    public string Slug { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    /// <summary>One line, shown on the card.</summary>
    public string Tagline { get; set; } = string.Empty;
    /// <summary>Markdown.</summary>
    public string Description { get; set; } = string.Empty;
    [MemoryPackAllowSerialize]
    public List<string> Tags { get; set; } = new();
    /// <summary>False = a draft, seen only by its owner and server admins.</summary>
    public bool IsPublic { get; set; }
    /// <summary>The text room the game is played in (joined by id; not in room lists).</summary>
    public string RoomId { get; set; } = string.Empty;
    public uint OwnerUserId { get; set; }
    /// <summary>0 = no build yet.</summary>
    public uint ReleaseNo { get; set; }
    public string Version { get; set; } = string.Empty;
    /// <summary>
    /// The current build's entry on the games origin (empty without a build). The client
    /// adds <c>?_jam_p={Id}&amp;_jam_o={its origin}</c> for the jam SDK.
    /// </summary>
    public string PlayUrl { get; set; } = string.Empty;
    public double CreatedMs { get; set; }
    public double UpdatedMs { get; set; }
    /// <summary>Plays so far: sessions with ≥ GamePlayCountMinActiveSeconds played (authors excluded).</summary>
    public uint Plays { get; set; }
}

/// <summary>
/// The requester's API tokens (answer to every token request). <see cref="NewToken"/> is
/// the token just created — shown once, never again; <see cref="Error"/> is a code when
/// the request was refused (<c>forbidden</c>, <c>limit</c>, <c>not_found</c>).
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class ApiTokensEvent : IServerEvent
{
    public static byte TypeId => 151;

    [MemoryPackAllowSerialize]
    public List<ApiTokenInfo> Tokens { get; set; } = new();
    public string NewToken { get; set; } = string.Empty;
    public string Error { get; set; } = string.Empty;
}

[GenerateTypeScript]
[MemoryPackable]
public partial class ApiTokenInfo
{
    /// <summary>Public handle (a prefix of the token's hash) — what RevokeApiTokenRequest takes.</summary>
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public double CreatedMs { get; set; }
    /// <summary>0 = never used (updated at most hourly).</summary>
    public double LastUsedMs { get; set; }
}

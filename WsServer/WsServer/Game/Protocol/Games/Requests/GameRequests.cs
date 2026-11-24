using System.Collections.Generic;
using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Games.Requests;

/// <summary>
/// Makes an API token for the requester (server admins only for now: a token can publish
/// games). Answered with an <c>ApiTokensEvent</c> carrying the token once.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class CreateApiTokenRequest : IClientRequest
{
    public static byte TypeId => 150;

    public string Name = string.Empty;
}

/// <summary>Revokes one of the requester's API tokens. Answered with an <c>ApiTokensEvent</c>.</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class RevokeApiTokenRequest : IClientRequest
{
    public static byte TypeId => 151;

    public string Id = string.Empty;
}

/// <summary>Asks for the requester's API tokens. Answered with an <c>ApiTokensEvent</c>.</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class ListApiTokensRequest : IClientRequest
{
    public static byte TypeId => 152;
}

/// <summary>
/// A game's page was opened (counted once per opening; the game's own people are not
/// counted). <see cref="Source"/>: how the visitor got there — <c>catalog</c>, <c>link</c>
/// (the page's address opened directly), <c>nav</c> (back / forward). <see cref="VisitorId"/>
/// tells anonymous visitors apart (a random id kept in their browser; empty once identified).
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class GameViewRequest : IClientRequest
{
    public static byte TypeId => 153;

    public string GameId = string.Empty;
    public string Source = string.Empty;
    public string VisitorId = string.Empty;
}

/// <summary>
/// The heartbeat of a play session, from the page playing the game: the first one opens
/// the session (a launch), then one every ~20 s of played time, when the tab is hidden and
/// when the game is left (<see cref="Ended"/>). <see cref="ActiveMs"/> is attention time
/// (tab visible, window focused, no mock ad) — the server clamps it. A session id belongs
/// to the connection that opened it.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class GamePlayBeatRequest : IClientRequest
{
    public static byte TypeId => 154;

    public string GameId = string.Empty;
    /// <summary>32 hex chars, made by the client.</summary>
    public string SessionId = string.Empty;
    public uint ReleaseNo;
    public double ActiveMs;
    /// <summary><c>mobile</c> / <c>desktop</c>.</summary>
    public string Device = string.Empty;
    public string Source = string.Empty;
    public string VisitorId = string.Empty;
    public bool Ended;
}

/// <summary>Events the game reported through the jam bridge (levelComplete / logEvent), batched.</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class GamePlayEventsRequest : IClientRequest
{
    public static byte TypeId => 155;

    public string SessionId = string.Empty;
    [MemoryPackAllowSerialize]
    public List<GamePlayEventData> Events = new();
}

/// <summary>One event as the jam SDK sends it: all strings; <c>Params</c> is serialized JSON.</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class GamePlayEventData
{
    public string Name = string.Empty;
    public string Level = string.Empty;
    public string Params = string.Empty;
}

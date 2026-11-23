using System.Collections.Generic;
using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Voice.Events;

/// <summary>Values of VoiceSignalRequest.Kind / <see cref="VoiceSignalEvent.Kind"/>.</summary>
public static class VoiceSignalKind
{
    public const byte Offer = 1;
    public const byte Answer = 2;
    public const byte Candidate = 3;
}

/// <summary>Values of <see cref="VoiceJoinResultEvent.Error"/> / <see cref="VoiceLeftEvent.Reason"/>.</summary>
public static class VoiceError
{
    public const string NotIdentified = "not_identified";
    public const string NoChannel = "no_channel";
    public const string NotVoice = "not_voice";
    public const string NoAccess = "no_access";
    public const string Banned = "banned";
    public const string Full = "full";
    public const string TooFast = "too_fast";
    // VoiceLeftEvent only: why the server took us out.
    public const string Left = "left";
    public const string Moved = "moved"; // the same user joined voice on another connection
    public const string Removed = "removed"; // lost access / banned / channel deleted
}

/// <summary>An ICE server for RTCPeerConnection (STUN, or TURN with time-limited credentials).</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class VoiceIceServer
{
    [MemoryPackAllowSerialize]
    public List<string> Urls { get; set; } = new();
    public string Username { get; set; } = string.Empty;
    public string Credential { get; set; } = string.Empty;
}

/// <summary>
/// The answer to a VoiceJoinRequest. On success the joiner calls (sends an offer to) every
/// client in <see cref="Peers"/> — the participants already there; those answer. Later
/// arrivals call us in turn, so there is never an offer in both directions.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class VoiceJoinResultEvent : IServerEvent
{
    public static byte TypeId => 140;

    public string RoomId { get; set; } = string.Empty;
    public bool Success { get; set; }
    public string Error { get; set; } = string.Empty;

    [MemoryPackAllowSerialize]
    public List<uint> Peers { get; set; } = new();

    [MemoryPackAllowSerialize]
    public List<VoiceIceServer> IceServers { get; set; } = new();
}

/// <summary>We are out of voice: we asked (<c>left</c>) or the server took us out (<see cref="VoiceError"/>).</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class VoiceLeftEvent : IServerEvent
{
    public static byte TypeId => 141;

    public string RoomId { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
}

/// <summary>A WebRTC signal from another participant of our voice channel (see VoiceSignalRequest).</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class VoiceSignalEvent : IServerEvent
{
    public static byte TypeId => 142;

    public uint FromClientId { get; set; }
    public byte Kind { get; set; }
    public string Data { get; set; } = string.Empty;
}

/// <summary>Someone in a voice channel.</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class VoiceParticipantInfo
{
    public uint ClientId { get; set; }
    public uint UserId { get; set; }
    public bool Muted { get; set; }
    public bool Deafened { get; set; }
}

/// <summary>Who is in one voice channel (empty = nobody).</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class VoiceRoomInfo
{
    public string RoomId { get; set; } = string.Empty;

    [MemoryPackAllowSerialize]
    public List<VoiceParticipantInfo> Participants { get; set; } = new();
}

/// <summary>
/// Who is in which voice channel, for the channel list. <see cref="Reset"/>: every
/// occupied voice channel the connection may see (after identifying / when what it may
/// see changed); otherwise the listed channels changed. Goes to every identified
/// connection that may see the channel, whatever room it is in.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class VoiceRosterEvent : IServerEvent
{
    public static byte TypeId => 143;

    public bool Reset { get; set; }

    [MemoryPackAllowSerialize]
    public List<VoiceRoomInfo> Rooms { get; set; } = new();
}

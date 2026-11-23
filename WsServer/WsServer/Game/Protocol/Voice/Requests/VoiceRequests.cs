using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Voice.Requests;

/// <summary>
/// Joins the voice of a voice channel (a room supporting VoiceChat). Independent of the
/// text room the connection is in: a client talks in one voice channel while reading any
/// text channel. Joining another voice channel leaves the current one; joining from a
/// second connection of the same user moves the user there. Answered with a
/// VoiceJoinResultEvent (the peers to call + the ICE servers).
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class VoiceJoinRequest : IClientRequest
{
    public static byte TypeId => 140;

    public string RoomId = string.Empty;
}

/// <summary>Leaves voice. Answered with a VoiceLeftEvent.</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class VoiceLeaveRequest : IClientRequest
{
    public static byte TypeId => 141;
}

/// <summary>
/// A WebRTC signal for another participant of the same voice channel (an SDP offer /
/// answer or an ICE candidate — <c>VoiceSignalKind</c>), relayed as a VoiceSignalEvent.
/// The audio itself never touches the server (peer to peer, or through TURN).
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class VoiceSignalRequest : IClientRequest
{
    public static byte TypeId => 142;

    public uint TargetClientId;
    public byte Kind;
    /// <summary>The SDP, or the candidate as JSON (RTCIceCandidateInit).</summary>
    public string Data = string.Empty;
}

/// <summary>Our microphone / sound is off (shown to everyone next to our name).</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class VoiceStateRequest : IClientRequest
{
    public static byte TypeId => 143;

    public bool Muted;
    public bool Deafened;
}

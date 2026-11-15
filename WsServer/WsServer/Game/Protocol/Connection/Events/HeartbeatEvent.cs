using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Connection.Events;

/// <summary>
/// Liveness signal sent to every connection every
/// <c>GameServerOptions.HeartbeatIntervalSeconds</c>, so a client that sits in a quiet
/// room (the lobby has no tick traffic) still receives something and its "no message for
/// N seconds" watchdog can tell a live connection from a silently dead one. No payload.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class HeartbeatEvent : IServerEvent
{
    public static byte TypeId => 7;
}

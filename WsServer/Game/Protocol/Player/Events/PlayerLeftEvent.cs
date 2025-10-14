using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Events;

[GenerateTypeScript]
[MemoryPackable]
public partial class PlayerLeftEvent(uint clientId) : IServerEvent
{
    public static byte TypeId => 3;
    public uint ClientId = clientId;
}
using Game.ServerLogic;
using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Events;

[GenerateTypeScript]
[MemoryPackable]
public partial class InitPlayerEvent(uint clientId) : IServerEvent
{
    public static byte TypeId => 255;
    public uint ClientId = clientId;
}

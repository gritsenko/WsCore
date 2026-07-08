using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Events;

[GenerateTypeScript]
[MemoryPackable]
public partial class SetPlayerNameEvent(uint ClientId, string Name) : IServerEvent
{
    public static byte TypeId => 100;

    public uint ClientId = ClientId;

    public string Name = Name;
}
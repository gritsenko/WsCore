using Game.ServerLogic.Player.Events.PlayerData;
using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Events;

[GenerateTypeScript]
[MemoryPackable]
public partial class PlayerJoinedEvent : IServerEvent
{
    public static byte TypeId => 2;

    public PlayerStateData PlayerStateData;

    [MemoryPackConstructor]
    public PlayerJoinedEvent()
    {
    }

    public PlayerJoinedEvent(Core.Player p)
    {
        PlayerStateData = new(p);
    }
}
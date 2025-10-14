using Game.ServerLogic.Player.Events.PlayerData;
using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Events;

[GenerateTypeScript]
[MemoryPackable]
public partial class PlayerRespawnEvent : IServerEvent
{
    public static byte TypeId => 4;

    public PlayerStateData PlayerStateData;

    [MemoryPackConstructor]
    public PlayerRespawnEvent()
    {
    }

    public PlayerRespawnEvent(Core.Player respawnPlayer)
    {
        PlayerStateData = new(respawnPlayer);
    }
}
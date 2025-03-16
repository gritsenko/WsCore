using Game.Protocol.Player.Events;
using WsServer.Abstract;
using WsServer.Common;

namespace Game.Protocol;

public enum ClientMessageType
{
    SetPlayerName = 100,
    UpdatePlayerState = 101,
    UpdatePlayerSlots = 102,
    PlayerShooting = 103,
    RespawnPlayer = 105,
    UpdatePlayerTarget = 106,
    ChatMessage = 200,

    GetTiles = 50,
    GetMapObjects = 51,
    SetMapObject = 52,
    DestroyMapObject = 53
}

public static class MessageRegistry
{
    private static readonly HashSet<byte> RegisteredIds = [];

    public static void Register<T>() where T : IServerMessage
    {
        if (!RegisteredIds.Add(T.TypeId))
            throw new DuplicateMessageIdException();
    }
}

public class GameMessages
{
    static GameMessages()
    {
        MessageRegistry.Register<InitPlayerServerMessage>();
    }
}
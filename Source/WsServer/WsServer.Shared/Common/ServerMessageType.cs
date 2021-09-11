namespace WsServer.Common
{
    public enum ServerMessageType
    {
        InitPlayer = 255,
        GameState = 0,
        GameTickState = 1,
        PlayerJoined = 2,
        PlayerLeft = 3,
        RespawnPlayer = 4,
        PlayerSetHp = 5,
        PlayersTop = 6,
        SetPlayerName = 100,
        PlayerShooting = 103,
        UpdatePlayerSlots = 102,
        ChatMessage = 200,

        MapTiles = 51,
        MapObjects = 52,
    }
}
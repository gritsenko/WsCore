using WsServer.Abstract;

namespace WsServer;
public static class WsServerBootstrap
{
    public static IGameServer GameServer { get; private set; }
    public static IGameMessenger GameMessenger { get; private set; }
    public static void Initialize()
    {
        GameMessenger = new GameMessenger();
        GameServer = new GameServer(GameMessenger);
    }
}

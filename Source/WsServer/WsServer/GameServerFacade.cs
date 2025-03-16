using WsServer.Abstract;

namespace WsServer;

public class GameServerFacade(IClientConnectionManager connectionManager, IGameServer game)
{
    public IClientConnectionManager Connections { get; } = connectionManager;
    public IGameServer Game { get; } = game;
}
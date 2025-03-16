namespace WsServer.Abstract;

public interface IGameServer<out TGameModel> : IGameServer where TGameModel : class
{
    TGameModel GameModel { get; }
}

public interface IGameServer
{
    void NotifyMessageReceived(uint id, ref byte[] buffer, int count);
    uint AddNewPlayer();
    void SendGameState(uint id);
    void RemovePlayer(uint clientId);
}
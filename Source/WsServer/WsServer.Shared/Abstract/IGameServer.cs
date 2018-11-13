using GameModel;

namespace WsServer.Abstract
{
    public interface IGameServer
    {
        void NotifyMessageRecieved(uint id, ref byte[] buffer, int count);
        Player AddNewPlayer();
        void SendGameState(uint id);
        void RemovePlayer(uint clientId);
    }
}
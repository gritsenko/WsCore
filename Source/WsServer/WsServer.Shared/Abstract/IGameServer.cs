using System.Collections.Generic;

namespace WsServer.Abstract;

public interface IGameServer<out TGameModel> : IGameServer where TGameModel : class;

public interface IGameServer
{
    //void NotifyMessageReceived(uint id, ref byte[] buffer, int count);
    //uint AddNewPlayer();
    //void SendGameState(uint id);
    //void RemovePlayer(uint clientId);

    void ProcessClientMessage(uint clientId, IClientRequest request);
    IReadOnlyDictionary<uint, PlayerState> GetGameState();
}
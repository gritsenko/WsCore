using System;
using WsServer.Abstract.Messages;

namespace WsServer.Abstract;

public interface IGameServer<out TGameModel> : IGameServer where TGameModel : class;

public interface IGameServer
{
    //void NotifyMessageReceived(uint id, ref byte[] buffer, int count);
    //uint AddNewPlayer();
    //void SendGameState(uint id);
    //void RemovePlayer(uint clientId);

    //IReadOnlyDictionary<uint, PlayerState> GetGameState();
    void ProcessClientMessage(uint connectionId, IClientRequest request);
    void OnClientConnected(IClientConnection connection, Action<uint> onIdCreated);
    void OnClientDisconnected(uint connectionId);
}
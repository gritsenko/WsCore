using System;
using WsServer.Abstract.Messages;

namespace WsServer.Abstract;

public interface IGameServer<out TGameModel> : IGameServer where TGameModel : class;

public interface IGameServer
{
    void ProcessClientMessage(uint connectionId, byte typeId, IClientRequest request);
    void OnClientConnected(IClientConnection connection, Action<uint> onIdCreated);
    void OnClientDisconnected(uint connectionId);
}
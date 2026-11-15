using System;
using WsServer.Abstract.Messages;

namespace WsServer.Abstract;

public interface IGameServer<out TGameModel> : IGameServer where TGameModel : class;

public interface IGameServer
{
    void ProcessClientMessageData(uint connectionId, byte[] data);
    void ProcessClientRequest(uint connectionId, IClientRequest request);
    void OnClientConnected(IClientConnection connection, Action<uint> onIdCreated);
    void OnClientDisconnected(uint connectionId);

    // Time since the tick loop last completed a tick successfully (since loop start if none
    // has yet). Used by /health to report a dead or persistently failing loop.
    TimeSpan TimeSinceLastTick { get; }
}
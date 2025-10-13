using System;

namespace WsServer.Abstract;

public interface IGameModel
{
    bool TopChanged { get; }
    int PlayersCount { get; }
    void UpdateGameState(DateTime time, Action onUpdatedAction);
    void RemovePlayer(uint id);
    uint AddNewPlayer();
}
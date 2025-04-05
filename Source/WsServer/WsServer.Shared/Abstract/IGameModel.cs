using System;
using System.Numerics;

namespace WsServer.Abstract;

public interface IGameModel
{
    bool TopChanged { get; }
    int PlayersCount { get; }
    void UpdateGameState(float dt, Action onUpdatedAction);
    void RemovePlayer(uint id);
    uint AddNewPlayer();
}
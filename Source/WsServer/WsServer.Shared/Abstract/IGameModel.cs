using System.Numerics;

namespace WsServer.Abstract;

public interface IGameModel
{
    bool TopChanged { get; }
    int PlayersCount { get; }
    void OnTick(float dt);
    void FlushTickData();
    void RemovePlayer(uint id);
    uint AddNewPlayer();
}
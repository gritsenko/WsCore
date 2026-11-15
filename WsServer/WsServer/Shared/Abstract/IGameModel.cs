using System;

namespace WsServer.Abstract;

public interface IGameModel
{
    bool TopChanged { get; }
    int PlayersCount { get; }
    // `time` is a monotonic timestamp (elapsed since an arbitrary fixed origin, e.g. a
    // Stopwatch), not wall-clock time — dt is derived from the difference between calls.
    void UpdateGameState(TimeSpan time, Action onUpdatedAction);

    // Atomic and callable from any thread: a connection reserves its id synchronously on
    // its socket thread. Client ids and bot ids share this sequence, so a client's avatar
    // (created only when it enters a spatial room) can reuse its client id.
    uint GetNewPlayerId();
}

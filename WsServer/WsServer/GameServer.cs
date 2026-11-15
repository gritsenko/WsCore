using System.Diagnostics;
using Game.Core;
using Game.ServerLogic.Connection.Events;
using Game.ServerLogic.GameState.Events;
using WsServer.Abstract;
using WsServer.Rooms;
using WsServer.Sessions;

namespace WsServer;

public class GameServer : GameServerBase<GameModel>
{
    private readonly GameTickUpdateEvent _gameStateEvent;
    private readonly RoomManager _roomManager;
    private readonly SessionManager _sessions;

    private readonly int _snapshotSendEveryTicks;
    private int _ticksSinceSnapshot;

    private readonly long _heartbeatIntervalTicks; // Stopwatch ticks; <= 0 disables
    private readonly HeartbeatEvent _heartbeat = new();
    private long _lastHeartbeat;

    public GameServer(
        GameModel gameModel,
        IGameMessenger messenger,
        IClientConnectionManager connectionManager,
        IServerLogicProvider serverLogicProvider,
        RoomManager roomManager,
        SessionManager sessions,
        GameServerOptions options,
        ILogger<GameServer> logger) : base(gameModel, messenger, connectionManager, serverLogicProvider, options, logger)
    {
        _roomManager = roomManager;
        _sessions = sessions;
        _heartbeatIntervalTicks = (long)(options.HeartbeatIntervalSeconds * Stopwatch.Frequency);
        _lastHeartbeat = Stopwatch.GetTimestamp();

        // A connection gets a session and is placed in the lobby; it gets a game avatar
        // only when it joins a spatial room (see SessionManager).
        OnClientAdded += _sessions.Connect;
        OnClientRemoved += _sessions.Disconnect;
        OnTick += GameServer_OnTick;

        _snapshotSendEveryTicks = Math.Max(1, options.SnapshotSendEveryTicks);
        _ticksSinceSnapshot = _snapshotSendEveryTicks - 1; // first tick with an audience sends
        _gameStateEvent = new GameTickUpdateEvent(
            gameModel, options.FullSnapshotEverySnapshots(), options.SnapshotRepeatUnchanged);

        InitializeDefaultRooms();
    }

    /// <summary>
    /// The rooms this server offers. Clients learn them from RoomListEvent — this is the
    /// only place they are defined.
    /// </summary>
    private void InitializeDefaultRooms()
    {
        // Lobby room - text chat only (persistent); every connection starts here.
        _roomManager.CreateRoom(
            SessionManager.DefaultRoomId,
            "Lobby",
            new[] { RoomCompatibility.TextChat },
            isPersistent: true);

        // Voice room - voice chat only (persistent)
        _roomManager.CreateRoom(
            "voice",
            "Voice Room",
            new[] { RoomCompatibility.VoiceChat, RoomCompatibility.TextChat },
            isPersistent: true);

        // Game room - single spatial 3D room (persistent); members get an avatar.
        _roomManager.CreateRoom(
            "game",
            "Game Room",
            new[] { RoomCompatibility.Spatial, RoomCompatibility.TextChat },
            isPersistent: true);
    }

    private void GameServer_OnTick()
    {
        SendHeartbeatIfDue();

        // Nobody in a spatial room (e.g. everyone is in the lobby): skip building and
        // serializing a snapshot no one would receive.
        if (!Messenger.HasSpatialRecipients())
        {
            _gameStateEvent.DiscardTickEvents();
            _ticksSinceSnapshot = _snapshotSendEveryTicks - 1;
            return;
        }

        // Simulate every tick, send every SnapshotSendEveryTicks-th: in between, only keep
        // this tick's one-shot events (bullets, hits, respawns) for the next snapshot.
        if (++_ticksSinceSnapshot < _snapshotSendEveryTicks)
        {
            _gameStateEvent.CollectTickEvents();
            return;
        }
        _ticksSinceSnapshot = 0;

        _gameStateEvent.BuildTickSnapshot();
        // Broadcast spatial updates only to clients that should get them (filters by room);
        // full snapshots go out as keyframes so a lossy delta stream still converges.
        Messenger.BroadcastSpatialUpdates(_gameStateEvent, _gameStateEvent.IsFullSnapshot);
    }

    // Every connection — including lobby clients, which get no tick traffic — receives a
    // tiny reliable event every HeartbeatIntervalSeconds, so the client watchdog can tell
    // a quiet connection from a dead one.
    private void SendHeartbeatIfDue()
    {
        if (_heartbeatIntervalTicks <= 0)
            return;
        var now = Stopwatch.GetTimestamp();
        if (now - _lastHeartbeat < _heartbeatIntervalTicks)
            return;
        _lastHeartbeat = now;
        Messenger.Broadcast(_heartbeat);
    }

    // Graceful shutdown: connections are closed and the loop has exited — drop room state.
    protected override void OnStopped() => _roomManager.Dispose();

    /// <summary>
    /// Get the room manager for external access
    /// </summary>
    public RoomManager GetRoomManager() => _roomManager;
}

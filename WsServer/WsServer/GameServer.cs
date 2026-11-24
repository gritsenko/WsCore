using System.Diagnostics;
using Game.Core;
using Game.ServerLogic.Connection.Events;
using Game.ServerLogic.GameState.Events;
using WsServer.Abstract;
using WsServer.Chat;
using WsServer.Games;
using WsServer.Moderation;
using WsServer.Rooms;
using WsServer.Sessions;
using WsServer.Voice;

namespace WsServer;

public class GameServer : GameServerBase<GameModel>
{
    private readonly GameTickUpdateEvent _gameStateEvent;
    private readonly RoomManager _roomManager;
    private readonly SessionManager _sessions;
    private readonly ChatHistoryService _chatHistory;
    private readonly ChannelPermissions _channels;
    private readonly GameCatalog _games;
    private readonly GameAnalytics _analytics;

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
        ChatHistoryService chatHistory,
        ChannelPermissions channels,
        VoiceService voice,
        GameCatalog games,
        GameAnalytics analytics,
        GameServerOptions options,
        ILogger<GameServer> logger) : base(gameModel, messenger, connectionManager, serverLogicProvider, options, logger)
    {
        _roomManager = roomManager;
        _sessions = sessions;
        _chatHistory = chatHistory;
        _channels = channels;
        _games = games;
        _analytics = analytics;
        _heartbeatIntervalTicks = (long)(options.HeartbeatIntervalSeconds * Stopwatch.Frequency);
        _lastHeartbeat = Stopwatch.GetTimestamp();

        // A connection gets a session and is placed in the lobby; it gets a game avatar
        // only when it joins a spatial room (see SessionManager).
        OnClientAdded += _sessions.Connect;
        OnClientAdded += _games.SendCatalog; // the public catalog; again once it identifies
        _sessions.VisibilityChanged += session => _games.SendCatalog(session.Id);
        OnClientRemoved += _sessions.Disconnect;
        OnClientRemoved += voice.Disconnect; // after the session: the roster goes to who is left
        OnClientRemoved += _analytics.Disconnect; // its play sessions end
        OnTick += GameServer_OnTick;

        _snapshotSendEveryTicks = Math.Max(1, options.SnapshotSendEveryTicks);
        _ticksSinceSnapshot = _snapshotSendEveryTicks - 1; // first tick with an audience sends
        _gameStateEvent = new GameTickUpdateEvent(
            gameModel, options.FullSnapshotEverySnapshots(), options.SnapshotRepeatUnchanged);

        InitializeDefaultRooms();
    }

    /// <summary>
    /// The rooms this server offers: the built-in ones below, then the channels admins
    /// created (stored with the channel permissions). Clients learn them from RoomListEvent.
    /// </summary>
    private void InitializeDefaultRooms()
    {
        // Lobby room - text chat only (persistent); every connection starts here.
        _roomManager.CreateRoom(
            SessionManager.DefaultRoomId,
            "Lobby",
            new[] { RoomCompatibility.TextChat },
            isPersistent: true);

        // Voice room - a voice channel with its own text chat (persistent). Voice is joined
        // separately from the text room (see VoiceService).
        _roomManager.CreateRoom(
            VoiceRoomId,
            "Voice Room",
            new[] { RoomCompatibility.VoiceChat, RoomCompatibility.TextChat },
            isPersistent: true);

        // Game room - single spatial 3D room (persistent); members get an avatar. Hidden:
        // not offered in room lists (the 3D scene is off the lobby for now), still
        // joinable by id (tests, LoadTest, TestClient).
        _roomManager.CreateRoom(
            GameRoomId,
            "Game Room",
            new[] { RoomCompatibility.Spatial, RoomCompatibility.TextChat },
            isPersistent: true,
            isHidden: true);

        // Channels created by admins: text-chat rooms, voice channels also with voice.
        foreach (var channel in _channels.CreatedChannels)
            CreateChannelRoom(_roomManager, channel.RoomId, channel.Name, channel.IsVoice);

        // The rooms the games of the games portal are played in (hidden; see GameCatalog).
        _games.CreateRooms();
    }

    public const string GameRoomId = "game";
    public const string VoiceRoomId = "voice";

    /// <summary>The room of a channel created by an admin.</summary>
    public static Room CreateChannelRoom(RoomManager rooms, string roomId, string name, bool isVoice = false)
        => rooms.CreateRoom(roomId, name,
            isVoice
                ? new[] { RoomCompatibility.VoiceChat, RoomCompatibility.TextChat }
                : new[] { RoomCompatibility.TextChat },
            isPersistent: true, isCreated: true);

    private void GameServer_OnTick()
    {
        SendHeartbeatIfDue();
        // History pages the storage thread finished loading, and pending away changes.
        _chatHistory.DeliverCompleted();
        _sessions.DeliverCompleted(); // finished password hashing (claim / login)
        _sessions.FlushPresence();
        _analytics.Tick(); // silent play sessions end; play counts reach the cards

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

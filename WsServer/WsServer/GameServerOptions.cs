namespace WsServer;

/// <summary>
/// Bound from the "GameServer" section of appsettings.json. Defaults match the values
/// that used to be hardcoded magic numbers throughout the server.
/// </summary>
public class GameServerOptions
{
    public int TickIntervalMs { get; set; } = 33;
    public float MaxDeltaTimeSeconds { get; set; } = 0.1f;

    // Tick snapshots (GameTickUpdateEvent). The simulation runs every TickIntervalMs; a
    // snapshot is sent every SnapshotSendEveryTicks-th tick (1 = every tick; default 2 =
    // ~15 Hz at 33 ms). Snapshots are deltas — only avatars that changed recently — with
    // a full snapshot (every avatar) every FullSnapshotIntervalSeconds, so a client that
    // lost deltas converges. An avatar stays in the deltas for SnapshotRepeatUnchanged
    // further snapshots after its state last changed (so its final, e.g. stopped, state
    // survives a few dropped snapshots). FullSnapshotIntervalSeconds <= 0 makes every
    // snapshot full (no delta encoding).
    public int SnapshotSendEveryTicks { get; set; } = 2;
    public double FullSnapshotIntervalSeconds { get; set; } = 1.0;
    public int SnapshotRepeatUnchanged { get; set; } = 2;

    /// <summary>Full snapshot cadence in snapshots (>= 1), derived from the settings above.</summary>
    public int FullSnapshotEverySnapshots()
    {
        var snapshotIntervalMs = Math.Max(1, TickIntervalMs) * (double)Math.Max(1, SnapshotSendEveryTicks);
        if (FullSnapshotIntervalSeconds <= 0) return 1;
        return Math.Max(1, (int)Math.Round(FullSnapshotIntervalSeconds * 1000 / snapshotIntervalMs));
    }

    // /health reports 503 when no tick has completed for longer than this.
    public double HealthMaxTickAgeSeconds { get; set; } = 5;

    public int WebSocketBufferSize { get; set; } = 4096;
    public int WebSocketMaxConsecutiveErrors { get; set; } = 10;
    public int WebSocketMaxMessageSizeBytes { get; set; } = 64 * 1024;
    // Capacity of each connection's reliable (never-dropping) send queue. A client that
    // falls this far behind is disconnected (it reconnects and resyncs) rather than
    // silently losing chat/join/room events. Tick snapshots don't count against it: they
    // use a single latest-wins slot.
    public int WebSocketSendQueueCapacity { get; set; } = 1024;

    // WebSocket ping interval and how long to wait for the pong before the connection is
    // considered dead and aborted — drops half-open connections (client vanished without
    // a TCP FIN) instead of keeping their player around forever.
    public double WebSocketKeepAliveIntervalSeconds { get; set; } = 15;
    public double WebSocketKeepAliveTimeoutSeconds { get; set; } = 15;

    // Every connection gets a tiny HeartbeatEvent this often (0 disables), so the client
    // can detect a silently dead connection even in the quiet lobby: its watchdog
    // (WsConnection.WATCHDOG_TIMEOUT_MS, ~3x this) reconnects when nothing arrives.
    public double HeartbeatIntervalSeconds { get; set; } = 5;

    public float ShootCooldownSeconds { get; set; } = 0.25f; // max ~4 shots/sec
    public float ChatCooldownSeconds { get; set; } = 0.5f;   // max ~2 messages/sec

    public int MaxChatLength { get; set; } = 256;
    public int MaxNameLength { get; set; } = 32;

    // ---- chat history & presence -------------------------------------------------------

    // SQLite file holding the chat history and the known users. Empty = no persistence:
    // history lives only in the in-memory window and users are forgotten on restart (the
    // default, so tests / the load test never write files). A relative path is resolved
    // against the working directory.
    public string ChatDatabasePath { get; set; } = string.Empty;

    // Messages per history page (what a client gets on entering a room and per scroll-up).
    public int ChatHistoryPageSize { get; set; } = 50;
    // Newest messages per room kept in memory. Joins, reconnect catch-ups and the first
    // pages of scroll-back are served from this window without touching the database.
    public int ChatHistoryCacheSize { get; set; } = 200;
    // Retention: messages kept per room in the database (0 = unlimited).
    public int ChatHistoryMaxMessagesPerRoom { get; set; } = 50_000;

    // Member list: how many offline users a client is told about (most recently seen
    // first; everyone online is always included).
    public int PresenceMaxOfflineUsers { get; set; } = 100;
    // Users not seen for this long are forgotten at startup (0 = never).
    public int UserRetentionDays { get; set; } = 90;
    // Hard cap on known users; beyond it the longest-offline user is evicted.
    public int MaxKnownUsers { get; set; } = 10_000;
    // Away (afk) toggles are announced at most this often (they are client-driven, so
    // this bounds what a toggling client can make the server broadcast).
    public double PresenceFlushIntervalSeconds { get; set; } = 1.0;
}

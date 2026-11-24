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

    // ---- accounts & profiles -----------------------------------------------------------

    // PBKDF2-HMAC-SHA512 iterations for account passwords (hashed off the tick thread).
    public int PasswordHashIterations { get; set; } = 210_000;
    // Minimum time between account / profile requests of one connection (claim, login,
    // logout, about, avatar).
    public double AccountRequestCooldownSeconds { get; set; } = 1.0;
    // Wrong passwords in a row after which a login is locked for LoginLockoutSeconds
    // (devices already logged in are not affected: they identify with their key).
    public int LoginMaxFailures { get; set; } = 5;
    public double LoginLockoutSeconds { get; set; } = 60;
    public int MaxAboutLength { get; set; } = 190;
    // Largest accepted avatar file. Must fit a WebSocket message (WebSocketMaxMessageSizeBytes).
    public int MaxAvatarBytes { get; set; } = 48 * 1024;

    /// <summary>
    /// Logins that are always server admins (checked at startup and when an account with
    /// such a login is claimed); they cannot be demoted from the client. Other server
    /// admins are appointed by a server admin and stored in the database.
    /// </summary>
    public string[] AdminLogins { get; set; } = [];

    /// <summary>Per-connection rate limit of moderation requests (admin / restriction changes, deletions).</summary>
    public double ModerationRequestCooldownSeconds { get; set; } = 0.2;

    /// <summary>Longest custom admin title (Telegram's limit).</summary>
    public int MaxAdminTitleLength { get; set; } = 16;

    /// <summary>Longest name of a channel created by an admin.</summary>
    public int MaxChannelNameLength { get; set; } = 32;

    /// <summary>How many channels admins may create (built-in rooms not counted).</summary>
    public int MaxCreatedChannels { get; set; } = 100;

    // ---- push notifications ------------------------------------------------------------

    /// <summary>Web Push for chat messages (users offline / away). Off = no PushConfigEvent, nothing sent.</summary>
    public bool PushEnabled { get; set; } = true;

    /// <summary>
    /// The VAPID contact push services may use (RFC 8292): a <c>mailto:</c> or <c>https:</c>
    /// URI. Apple's push service rejects localhost here, so production sets the site URL.
    /// </summary>
    public string PushSubject { get; set; } = "mailto:admin@example.com";

    /// <summary>
    /// VAPID key pair (base64url: the 65-byte public point, the 32-byte private scalar).
    /// Empty = generate one on first start and keep it in the database (meta table) —
    /// changing it invalidates every browser subscription.
    /// </summary>
    public string PushVapidPublicKey { get; set; } = string.Empty;
    public string PushVapidPrivateKey { get; set; } = string.Empty;

    /// <summary>At most one push per user and room this often (a burst of messages = one notification).</summary>
    public double PushMinIntervalSeconds { get; set; } = 5;

    /// <summary>How long a push service keeps an undelivered notification (device offline).</summary>
    public double PushTtlSeconds { get; set; } = 12 * 3600;

    /// <summary>Devices per user; subscribing one more replaces the oldest.</summary>
    public int PushMaxSubscriptionsPerUser { get; set; } = 10;

    /// <summary>Per-connection rate limit of (un)subscribe requests.</summary>
    public double PushRequestCooldownSeconds { get; set; } = 0.2;

    // ---- voice ------------------------------------------------------------------------

    /// <summary>
    /// People in one voice channel at a time. Voice is a WebRTC mesh (everyone sends their
    /// audio to everyone else), so the upload of each participant grows with this.
    /// </summary>
    public int VoiceMaxParticipants { get; set; } = 8;

    /// <summary>STUN servers handed to clients (lets peers behind a simple NAT find each other).</summary>
    public string[] VoiceStunUrls { get; set; } = ["stun:stun.l.google.com:19302"];

    /// <summary>
    /// TURN servers (coturn), e.g. <c>turn:example.com:3478?transport=udp</c> and
    /// <c>turns:example.com:5349?transport=tcp</c> — the relay for peers that cannot reach
    /// each other directly (symmetric NAT, mobile carriers, corporate firewalls). Used
    /// only with <see cref="VoiceTurnSecret"/>.
    /// </summary>
    public string[] VoiceTurnUrls { get; set; } = [];

    /// <summary>
    /// coturn's <c>static-auth-secret</c> (<c>use-auth-secret</c>): every voice join gets
    /// time-limited TURN credentials signed with it (the TURN REST API scheme). Empty =
    /// no TURN, STUN only.
    /// </summary>
    public string VoiceTurnSecret { get; set; } = string.Empty;

    /// <summary>How long the TURN credentials of a voice join stay valid.</summary>
    public double VoiceTurnCredentialTtlSeconds { get; set; } = 12 * 3600;

    /// <summary>Largest relayed WebRTC signal (an SDP offer / answer or an ICE candidate).</summary>
    public int VoiceMaxSignalBytes { get; set; } = 16 * 1024;

    /// <summary>
    /// Signals a connection may relay: a burst of <see cref="VoiceSignalBurst"/>, refilled
    /// at <see cref="VoiceSignalsPerSecond"/> (joining a full channel = a few dozen ICE
    /// candidates per peer).
    /// </summary>
    public double VoiceSignalsPerSecond { get; set; } = 40;
    public int VoiceSignalBurst { get; set; } = 400;

    /// <summary>Per-connection rate limit of voice join / leave / mute requests.</summary>
    public double VoiceRequestCooldownSeconds { get; set; } = 0.2;

    // ---- games portal -----------------------------------------------------------------

    /// <summary>
    /// The origin game builds are served from, e.g. <c>https://play.tox.gritsenko.biz</c>
    /// (dev: <c>http://localhost:5002</c>). It must differ from the origin of the TOX client:
    /// a build is somebody else's JavaScript, and on the client's origin it could read the
    /// user key from localStorage. A request whose Host is this origin's host gets nothing
    /// but builds and <c>/jam-sdk.js</c>. Empty = the games portal is off.
    /// </summary>
    public string GamesOrigin { get; set; } = string.Empty;

    /// <summary>
    /// The origins of the TOX client, e.g. <c>https://tox.gritsenko.biz</c>: the only pages
    /// allowed to embed a game (CSP frame-ancestors), and the ones the injected jam SDK
    /// talks to over postMessage (<c>data-jam-portal-origins</c>).
    /// </summary>
    public string[] PortalOrigins { get; set; } = [];

    /// <summary>Where unpacked builds live: <c>{path}/{gameId}/r{releaseNo}/…</c>.</summary>
    public string GamesDataPath { get; set; } = "data/games";

    /// <summary>Largest uploaded build (.zip or a single .html).</summary>
    public int GameMaxBuildMb { get; set; } = 200;

    /// <summary>Largest unpacked build, all files together.</summary>
    public int GameMaxUnpackedMb { get; set; } = 500;

    /// <summary>Most files in one unpacked build.</summary>
    public int GameMaxFiles { get; set; } = 5000;

    /// <summary>
    /// Releases of a game kept unpacked on disk (the newest ones); older ones are deleted
    /// from disk, their records (version, notes, date) stay.
    /// </summary>
    public int GameKeepReleases { get; set; } = 5;

    public int MaxGameTitleLength { get; set; } = 64;
    public int MaxGameTaglineLength { get; set; } = 140;
    public int MaxGameDescriptionLength { get; set; } = 8000;
    public int MaxGameTags { get; set; } = 10;
    public int MaxReleaseNotesLength { get; set; } = 4000;

    /// <summary>Largest cover / header / screenshot (the browser scales pictures down before upload).</summary>
    public int GameMaxMediaMb { get; set; } = 8;

    public int MaxGameScreenshots { get; set; } = 12;

    // ---- games analytics ----------------------------------------------------------------

    /// <summary>A play session counts as a play (the number on the cards) after this much attention time.</summary>
    public double GamePlayCountMinActiveSeconds { get; set; } = 15;

    /// <summary>One session is never credited more than this (a tab left focused and idle).</summary>
    public double GamePlayMaxSessionHours { get; set; } = 6;

    /// <summary>A session without a heartbeat this long is closed (the client went quiet).</summary>
    public double GamePlaySessionTimeoutSeconds { get; set; } = 90;

    /// <summary>Raw sessions, events and hits are kept this long; daily counters forever.</summary>
    public int GameAnalyticsRetentionDays { get; set; } = 180;

    /// <summary>Game events per batch / per session / distinct names per game (the jam portal's caps).</summary>
    public int GameEventsPerRequest { get; set; } = 50;
    public int GameEventsPerSession { get; set; } = 300;
    public int GameEventNamesPerGame { get; set; } = 50;

    /// <summary>Play counts on the cards are re-sent to clients at most this often.</summary>
    public double GameCatalogCountsFlushSeconds { get; set; } = 10;

    /// <summary>A player's scores to one board are taken at most this often (others: too_fast).</summary>
    public double LeaderboardWriteCooldownSeconds { get; set; } = 0.5;

    /// <summary>
    /// Chunk size of the agent's uploads (push_build / push_media), in MB. 0 = the whole file in
    /// one PUT; set it to what the proxy in front of the server lets through.
    /// </summary>
    public int AgentUploadChunkMb { get; set; } = 0;

    /// <summary>API tokens one user may hold (the agent / scripts publishing games).</summary>
    public int ApiTokensPerUser { get; set; } = 10;

    /// <summary>An API token unused this long stops working.</summary>
    public double ApiTokenIdleDays { get; set; } = 60;
}

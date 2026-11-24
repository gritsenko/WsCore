using System.Collections.Concurrent;
using System.Diagnostics;
using Microsoft.Data.Sqlite;

namespace WsServer.Persistence;

/// <summary>
/// SQLite-backed <see cref="IChatStorage"/>.
///
///  * One connection, owned by one background thread: every write and every query goes
///    through a single FIFO queue, so the tick thread never waits for the disk and a query
///    always observes the appends queued before it.
///  * Write-behind with group commit: the worker takes everything that is queued and
///    commits it in one transaction — one fsync-free WAL commit per burst rather than per
///    message (journal_mode=WAL, synchronous=NORMAL: durable across process crashes; the
///    last few commits may be lost on power failure, which is fine for chat).
///  * Keyset pagination on (room_id, id): "older than X" is an index range scan no matter
///    how deep the history is (no OFFSET).
///  * Bounded: the queue has a capacity (a stalled disk drops writes instead of eating
///    memory) and each room keeps at most <c>maxMessagesPerRoom</c> messages.
/// </summary>
public sealed class SqliteChatStorage : IChatStorage
{
    private const int QueueCapacity = 65536;
    private const int MaxBatch = 512;
    private static readonly TimeSpan PruneInterval = TimeSpan.FromHours(1);

    private abstract record Op;
    private sealed record AppendOp(ChatMessage Message) : Op;
    private sealed record SaveUserOp(StoredUser User) : Op;
    private sealed record DeleteUserOp(uint UserId) : Op;
    private sealed record SaveUserKeyOp(StoredUserKey Key) : Op;
    private sealed record DeleteUserKeyOp(string KeyHash) : Op;
    private sealed record SaveAvatarOp(uint UserId, StoredAvatar? Avatar) : Op;
    private sealed record LoadAvatarOp(uint UserId, Action<StoredAvatar?> OnResult) : Op
    {
        public StoredAvatar? Result;
    }
    private sealed record QueryOp(string RoomId, uint BeforeId, int Limit, Action<IReadOnlyList<ChatMessage>> OnResult) : Op
    {
        public IReadOnlyList<ChatMessage> Result = [];
    }
    private sealed record FlushOp(TaskCompletionSource Done) : Op;
    private sealed record DeleteMessageOp(uint MessageId) : Op;
    private sealed record SaveChannelOp(StoredChannel Channel) : Op;
    private sealed record SaveChannelMemberOp(StoredChannelMember Member) : Op;
    private sealed record DeleteChannelMemberOp(string RoomId, uint UserId) : Op;
    private sealed record DeleteChannelOp(string RoomId) : Op;
    private sealed record SaveMetaOp(string Key, string Value) : Op;
    private sealed record SavePushSubscriptionOp(StoredPushSubscription Subscription) : Op;
    private sealed record DeletePushSubscriptionOp(string Endpoint) : Op;
    private sealed record SaveGameOp(StoredGame Game) : Op;
    private sealed record SaveGameReleaseOp(StoredGameRelease Release) : Op;
    private sealed record SaveApiTokenOp(StoredApiToken Token) : Op;
    private sealed record DeleteApiTokenOp(string Hash) : Op;
    private sealed record SaveGameCountersOp(StoredGameCounters Counters) : Op;
    private sealed record SavePlaySessionOp(StoredPlaySession Session) : Op;
    private sealed record AppendPlayEventsOp(IReadOnlyList<StoredPlayEvent> Events) : Op;
    private sealed record AppendGameHitOp(StoredGameHit Hit) : Op;
    private sealed record AddGameDailyOp(GameDailyDelta Delta) : Op;
    private sealed record QueryGameStatsOp(string GameId, long SinceMs, Action<GameStatsData> OnResult) : Op
    {
        public GameStatsData Result = new([], [], 0, 0, [], [], []);
    }

    private readonly SqliteConnection _db;
    private readonly ILogger _logger;
    private readonly int _maxMessagesPerRoom;
    private readonly int _userRetentionDays;
    private readonly int _analyticsRetentionDays;
    // The transaction of the batch being executed (ad-hoc commands of the analytics ops join it).
    private SqliteTransaction? _tx;
    private readonly BlockingCollection<Op> _queue = new(new ConcurrentQueue<Op>(), QueueCapacity);
    private Thread? _worker;
    private long _lastPrune = Stopwatch.GetTimestamp();
    private long _droppedWrites;

    private SqliteCommand _insertMessage = null!;
    private SqliteCommand _upsertUser = null!;
    private SqliteCommand _deleteUser = null!;
    private SqliteCommand _selectBefore = null!;
    private SqliteCommand _deleteKeysOfUser = null!;
    private SqliteCommand _upsertUserKey = null!;
    private SqliteCommand _deleteUserKey = null!;
    private SqliteCommand _upsertAvatar = null!;
    private SqliteCommand _deleteAvatar = null!;
    private SqliteCommand _selectAvatar = null!;
    private SqliteCommand _deleteMessage = null!;
    private SqliteCommand _upsertChannel = null!;
    private SqliteCommand _upsertChannelMember = null!;
    private SqliteCommand _deleteChannelMember = null!;
    private SqliteCommand _deleteChannelMembersOfUser = null!;
    private SqliteCommand _deleteChannel = null!;
    private SqliteCommand _upsertMeta = null!;
    private SqliteCommand _upsertPushSubscription = null!;
    private SqliteCommand _deletePushSubscription = null!;
    private SqliteCommand _deletePushSubscriptionsOfUser = null!;
    private SqliteCommand _upsertGame = null!;
    private SqliteCommand _upsertGameRelease = null!;
    private SqliteCommand _upsertApiToken = null!;
    private SqliteCommand _deleteApiToken = null!;
    private SqliteCommand _deleteApiTokensOfUser = null!;
    private SqliteCommand[] _commands = [];

    public bool IsPersistent => true;

    public SqliteChatStorage(string path, int maxMessagesPerRoom, int userRetentionDays, ILogger logger,
        int analyticsRetentionDays = 180)
    {
        _analyticsRetentionDays = analyticsRetentionDays;
        _logger = logger;
        _maxMessagesPerRoom = maxMessagesPerRoom;
        _userRetentionDays = userRetentionDays;

        var directory = Path.GetDirectoryName(Path.GetFullPath(path));
        if (!string.IsNullOrEmpty(directory))
            Directory.CreateDirectory(directory);

        _db = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = path,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Pooling = false,
        }.ToString());
        _db.Open();

        Execute("PRAGMA journal_mode=WAL;");
        Execute("PRAGMA synchronous=NORMAL;");
        Execute("PRAGMA busy_timeout=5000;");
        Execute("""
            CREATE TABLE IF NOT EXISTS meta(
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            ) WITHOUT ROWID;
            CREATE TABLE IF NOT EXISTS messages(
                id      INTEGER PRIMARY KEY,
                room_id TEXT    NOT NULL,
                user_id INTEGER NOT NULL,
                name    TEXT    NOT NULL,
                text    TEXT    NOT NULL,
                sent_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_messages_room_id ON messages(room_id, id);
            """);
        MigrateUsers();
    }

    // Schema version (PRAGMA user_version) of the user tables:
    //   0 — users(id, key_hash UNIQUE, name, last_seen): one key per user, or no table yet;
    //   1 — accounts: a user has any number of keys (user_keys), optional credentials
    //       (login + password hash), a profile (about, avatar_version) and an avatar blob.
    //   2 — roles: users.is_admin (server admin), channels (default member permissions)
    //       and channel_members (a user's admin rights / restriction in a channel).
    //   3 — push: push_subscriptions (a browser's Web Push subscription, owned by a user and
    //       the device key it came with).
    //   4 — created channels: channels.name / is_private / created_ms (a channel with a
    //       name was created by an admin) and channel_members.has_access (private channels).
    //   5 — voice channels: channels.is_voice (a created channel that is a voice channel).
    //   6 — games portal: games, game_releases (the builds are files on disk) and
    //       api_tokens (publishing from an agent / script).
    //   7 — games analytics: games.*_total counters, game_hits, game_play_sessions,
    //       game_play_events, game_daily.
    private const int SchemaVersion = 7;

    private void MigrateUsers()
    {
        var version = Scalar("PRAGMA user_version;");
        if (version >= SchemaVersion)
            return;

        using var tx = _db.BeginTransaction();
        if (version < 1)
            MigrateToAccounts();
        if (version < 2)
        {
            Execute("""
                ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
                CREATE TABLE IF NOT EXISTS channels(
                    room_id             TEXT    PRIMARY KEY,
                    default_permissions INTEGER NOT NULL
                ) WITHOUT ROWID;
                CREATE TABLE IF NOT EXISTS channel_members(
                    room_id      TEXT    NOT NULL,
                    user_id      INTEGER NOT NULL,
                    admin_rights INTEGER NOT NULL DEFAULT 0,
                    title        TEXT    NOT NULL DEFAULT '',
                    denied       INTEGER NOT NULL DEFAULT 0,
                    banned       INTEGER NOT NULL DEFAULT 0,
                    until_ms     INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY(room_id, user_id)
                ) WITHOUT ROWID;
                CREATE INDEX IF NOT EXISTS ix_channel_members_user ON channel_members(user_id);
                """);
        }
        if (version < 3)
        {
            Execute("""
                CREATE TABLE IF NOT EXISTS push_subscriptions(
                    endpoint TEXT    PRIMARY KEY,
                    user_id  INTEGER NOT NULL,
                    key_hash TEXT,
                    p256dh   TEXT    NOT NULL,
                    auth     TEXT    NOT NULL
                ) WITHOUT ROWID;
                CREATE INDEX IF NOT EXISTS ix_push_subscriptions_user ON push_subscriptions(user_id);
                """);
        }
        if (version < 4)
        {
            Execute("""
                ALTER TABLE channels ADD COLUMN name TEXT;
                ALTER TABLE channels ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE channels ADD COLUMN created_ms INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE channel_members ADD COLUMN has_access INTEGER NOT NULL DEFAULT 0;
                """);
        }
        if (version < 5)
            Execute("ALTER TABLE channels ADD COLUMN is_voice INTEGER NOT NULL DEFAULT 0;");
        if (version < 6)
        {
            Execute("""
                CREATE TABLE IF NOT EXISTS games(
                    id              TEXT    PRIMARY KEY,
                    slug            TEXT    NOT NULL UNIQUE,
                    owner_user_id   INTEGER NOT NULL,
                    title           TEXT    NOT NULL,
                    tagline         TEXT    NOT NULL DEFAULT '',
                    description     TEXT    NOT NULL DEFAULT '',
                    tags            TEXT    NOT NULL DEFAULT '[]',
                    is_public       INTEGER NOT NULL DEFAULT 0,
                    created_ms      INTEGER NOT NULL,
                    updated_ms      INTEGER NOT NULL,
                    next_release_no INTEGER NOT NULL DEFAULT 1
                ) WITHOUT ROWID;
                CREATE TABLE IF NOT EXISTS game_releases(
                    game_id        TEXT    NOT NULL,
                    no             INTEGER NOT NULL,
                    version        TEXT    NOT NULL DEFAULT '',
                    notes          TEXT    NOT NULL DEFAULT '',
                    author_user_id INTEGER NOT NULL,
                    created_ms     INTEGER NOT NULL,
                    entry_path     TEXT    NOT NULL,
                    files          INTEGER NOT NULL DEFAULT 0,
                    bytes          INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY(game_id, no)
                ) WITHOUT ROWID;
                CREATE TABLE IF NOT EXISTS api_tokens(
                    hash         TEXT    PRIMARY KEY,
                    user_id      INTEGER NOT NULL,
                    name         TEXT    NOT NULL DEFAULT '',
                    created_ms   INTEGER NOT NULL,
                    last_used_ms INTEGER NOT NULL DEFAULT 0
                ) WITHOUT ROWID;
                CREATE INDEX IF NOT EXISTS ix_api_tokens_user ON api_tokens(user_id);
                """);
        }
        if (version < 7)
        {
            foreach (var column in new[] { "views_total", "launches_total", "plays_total", "active_ms_total" })
            {
                if (Scalar($"SELECT COUNT(*) FROM pragma_table_info('games') WHERE name = '{column}';") == 0)
                    Execute($"ALTER TABLE games ADD COLUMN {column} INTEGER NOT NULL DEFAULT 0;");
            }
            Execute("""
                CREATE TABLE IF NOT EXISTS game_hits(
                    id         INTEGER PRIMARY KEY,
                    game_id    TEXT    NOT NULL,
                    kind       TEXT    NOT NULL,
                    user_id    INTEGER NOT NULL DEFAULT 0,
                    visitor_id TEXT    NOT NULL DEFAULT '',
                    source     TEXT    NOT NULL DEFAULT '',
                    ms         INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS ix_game_hits_game ON game_hits(game_id, ms);
                CREATE INDEX IF NOT EXISTS ix_game_hits_ms ON game_hits(ms);
                CREATE TABLE IF NOT EXISTS game_play_sessions(
                    id           TEXT    PRIMARY KEY,
                    game_id      TEXT    NOT NULL,
                    release_no   INTEGER NOT NULL DEFAULT 0,
                    user_id      INTEGER NOT NULL DEFAULT 0,
                    visitor_id   TEXT    NOT NULL DEFAULT '',
                    own          INTEGER NOT NULL DEFAULT 0,
                    device       TEXT    NOT NULL DEFAULT '',
                    source       TEXT    NOT NULL DEFAULT '',
                    started_ms   INTEGER NOT NULL,
                    last_seen_ms INTEGER NOT NULL,
                    active_ms    INTEGER NOT NULL DEFAULT 0,
                    counted      INTEGER NOT NULL DEFAULT 0,
                    ended        INTEGER NOT NULL DEFAULT 0
                ) WITHOUT ROWID;
                CREATE INDEX IF NOT EXISTS ix_game_sessions_game ON game_play_sessions(game_id, started_ms);
                CREATE INDEX IF NOT EXISTS ix_game_sessions_started ON game_play_sessions(started_ms);
                CREATE TABLE IF NOT EXISTS game_play_events(
                    id         INTEGER PRIMARY KEY,
                    session_id TEXT    NOT NULL,
                    game_id    TEXT    NOT NULL,
                    own        INTEGER NOT NULL DEFAULT 0,
                    name       TEXT    NOT NULL,
                    level      TEXT    NOT NULL DEFAULT '',
                    params     TEXT    NOT NULL DEFAULT '',
                    ms         INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS ix_game_events_game ON game_play_events(game_id, own, name);
                CREATE INDEX IF NOT EXISTS ix_game_events_ms ON game_play_events(ms);
                CREATE TABLE IF NOT EXISTS game_daily(
                    game_id     TEXT    NOT NULL,
                    day         TEXT    NOT NULL,
                    views       INTEGER NOT NULL DEFAULT 0,
                    launches    INTEGER NOT NULL DEFAULT 0,
                    plays       INTEGER NOT NULL DEFAULT 0,
                    active_ms   INTEGER NOT NULL DEFAULT 0,
                    new_players INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY(game_id, day)
                ) WITHOUT ROWID;
                """);
        }
        Execute($"PRAGMA user_version = {SchemaVersion};");
        tx.Commit();

        if (version > 0 || Scalar("SELECT COUNT(*) FROM users;") > 0)
            _logger.LogInformation("Chat storage: user tables migrated from schema v{From} to v{Version}", version, SchemaVersion);
    }

    // v0 → v1, inside MigrateUsers' transaction.
    private void MigrateToAccounts()
    {
        var hadUsers = Scalar("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'users';") > 0;
        if (hadUsers)
            Execute("ALTER TABLE users RENAME TO users_v0;");

        Execute("""
            CREATE TABLE users(
                id             INTEGER PRIMARY KEY,
                name           TEXT    NOT NULL,
                last_seen      INTEGER NOT NULL,
                login          TEXT,
                password_hash  TEXT,
                about          TEXT    NOT NULL DEFAULT '',
                avatar_version INTEGER NOT NULL DEFAULT 0
            );
            CREATE UNIQUE INDEX ix_users_login ON users(login) WHERE login IS NOT NULL;
            CREATE TABLE user_keys(
                key_hash TEXT    PRIMARY KEY,
                user_id  INTEGER NOT NULL
            ) WITHOUT ROWID;
            CREATE INDEX ix_user_keys_user ON user_keys(user_id);
            CREATE TABLE avatars(
                user_id      INTEGER PRIMARY KEY,
                content_type TEXT    NOT NULL,
                data         BLOB    NOT NULL
            );
            """);
        if (hadUsers)
        {
            Execute("""
                INSERT INTO users(id, name, last_seen) SELECT id, name, last_seen FROM users_v0;
                INSERT INTO user_keys(key_hash, user_id) SELECT key_hash, id FROM users_v0;
                DROP TABLE users_v0;
                """);
        }
    }

    // ---- startup ----------------------------------------------------------------------

    public StorageSnapshot Load(int recentPerRoom)
    {
        Prune();

        var epoch = ReadOrCreateEpoch();
        var nextMessageId = (uint)(Scalar("SELECT COALESCE(MAX(id), 0) FROM messages;") + 1);
        var nextUserId = (uint)(Scalar("SELECT COALESCE(MAX(id), 0) FROM users;") + 1);

        var users = new List<StoredUser>();
        using (var cmd = _db.CreateCommand())
        {
            cmd.CommandText = "SELECT id, name, last_seen, login, password_hash, about, avatar_version, is_admin FROM users;";
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                users.Add(new StoredUser((uint)reader.GetInt64(0), reader.GetString(1), reader.GetInt64(2))
                {
                    Login = reader.IsDBNull(3) ? null : reader.GetString(3),
                    PasswordHash = reader.IsDBNull(4) ? null : reader.GetString(4),
                    About = reader.GetString(5),
                    AvatarVersion = (uint)reader.GetInt64(6),
                    IsAdmin = reader.GetInt64(7) != 0,
                });
            }
        }

        var userKeys = new List<StoredUserKey>();
        using (var cmd = _db.CreateCommand())
        {
            cmd.CommandText = "SELECT key_hash, user_id FROM user_keys;";
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
                userKeys.Add(new StoredUserKey(reader.GetString(0), (uint)reader.GetInt64(1)));
        }

        var channels = new List<StoredChannel>();
        using (var cmd = _db.CreateCommand())
        {
            cmd.CommandText = "SELECT room_id, default_permissions, name, is_private, created_ms, is_voice FROM channels;";
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                channels.Add(new StoredChannel(reader.GetString(0), (byte)reader.GetInt64(1))
                {
                    Name = reader.IsDBNull(2) ? null : reader.GetString(2),
                    IsPrivate = reader.GetInt64(3) != 0,
                    CreatedMs = reader.GetInt64(4),
                    IsVoice = reader.GetInt64(5) != 0,
                });
            }
        }

        var channelMembers = new List<StoredChannelMember>();
        using (var cmd = _db.CreateCommand())
        {
            cmd.CommandText = "SELECT room_id, user_id, admin_rights, title, denied, banned, until_ms, has_access FROM channel_members;";
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                channelMembers.Add(new StoredChannelMember(reader.GetString(0), (uint)reader.GetInt64(1))
                {
                    AdminRights = (byte)reader.GetInt64(2),
                    Title = reader.GetString(3),
                    Denied = (byte)reader.GetInt64(4),
                    Banned = reader.GetInt64(5) != 0,
                    UntilMs = reader.GetInt64(6),
                    HasAccess = reader.GetInt64(7) != 0,
                });
            }
        }

        var meta = new Dictionary<string, string>();
        using (var cmd = _db.CreateCommand())
        {
            cmd.CommandText = "SELECT key, value FROM meta;";
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
                meta[reader.GetString(0)] = reader.GetString(1);
        }

        var pushSubscriptions = new List<StoredPushSubscription>();
        using (var cmd = _db.CreateCommand())
        {
            cmd.CommandText = "SELECT endpoint, user_id, key_hash, p256dh, auth FROM push_subscriptions;";
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                pushSubscriptions.Add(new StoredPushSubscription(reader.GetString(0), (uint)reader.GetInt64(1),
                    reader.IsDBNull(2) ? null : reader.GetString(2), reader.GetString(3), reader.GetString(4)));
            }
        }

        var games = new List<StoredGame>();
        using (var cmd = _db.CreateCommand())
        {
            cmd.CommandText = """
                SELECT id, slug, owner_user_id, title, tagline, description, tags, is_public,
                       created_ms, updated_ms, next_release_no FROM games;
                """;
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                games.Add(new StoredGame(reader.GetString(0), reader.GetString(1), (uint)reader.GetInt64(2), reader.GetString(3))
                {
                    Tagline = reader.GetString(4),
                    Description = reader.GetString(5),
                    Tags = ReadTags(reader.GetString(6)),
                    IsPublic = reader.GetInt64(7) != 0,
                    CreatedMs = reader.GetInt64(8),
                    UpdatedMs = reader.GetInt64(9),
                    NextReleaseNo = (uint)reader.GetInt64(10),
                });
            }
        }

        var gameReleases = new List<StoredGameRelease>();
        using (var cmd = _db.CreateCommand())
        {
            cmd.CommandText = """
                SELECT game_id, no, version, notes, author_user_id, created_ms, entry_path, files, bytes
                FROM game_releases ORDER BY game_id, no;
                """;
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                gameReleases.Add(new StoredGameRelease(reader.GetString(0), (uint)reader.GetInt64(1),
                    (uint)reader.GetInt64(4), reader.GetInt64(5))
                {
                    Version = reader.GetString(2),
                    Notes = reader.GetString(3),
                    EntryPath = reader.GetString(6),
                    Files = (int)reader.GetInt64(7),
                    Bytes = reader.GetInt64(8),
                });
            }
        }

        var gameCounters = new List<StoredGameCounters>();
        using (var cmd = _db.CreateCommand())
        {
            cmd.CommandText = "SELECT id, views_total, launches_total, plays_total, active_ms_total FROM games;";
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                gameCounters.Add(new StoredGameCounters(reader.GetString(0), reader.GetInt64(1), reader.GetInt64(2),
                    reader.GetInt64(3), reader.GetInt64(4)));
            }
        }

        var apiTokens = new List<StoredApiToken>();
        using (var cmd = _db.CreateCommand())
        {
            cmd.CommandText = "SELECT hash, user_id, name, created_ms, last_used_ms FROM api_tokens;";
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                apiTokens.Add(new StoredApiToken(reader.GetString(0), (uint)reader.GetInt64(1), reader.GetString(2),
                    reader.GetInt64(3), reader.GetInt64(4)));
            }
        }

        PrepareCommands();

        var rooms = new List<StoredRoomHistory>();
        foreach (var roomId in RoomIds())
        {
            // One extra row tells whether anything older than the cached window exists.
            var newestFirst = SelectBefore(roomId, uint.MaxValue, recentPerRoom + 1);
            var hasOlder = newestFirst.Count > recentPerRoom;
            var recent = newestFirst.Take(recentPerRoom).Reverse().ToList();
            rooms.Add(new StoredRoomHistory(roomId, recent, hasOlder));
        }

        _worker = new Thread(Run) { IsBackground = true, Name = "chat-storage" };
        _worker.Start();

        _logger.LogInformation(
            "Chat storage opened: {Users} user(s), {Rooms} room(s) with history, next message id {NextId}",
            users.Count, rooms.Count, nextMessageId);
        return new StorageSnapshot(epoch, nextMessageId, nextUserId, users, userKeys, rooms)
        {
            Channels = channels,
            ChannelMembers = channelMembers,
            Meta = meta,
            PushSubscriptions = pushSubscriptions,
            Games = games,
            GameReleases = gameReleases,
            ApiTokens = apiTokens,
            GameCounters = gameCounters,
        };
    }

    private uint ReadOrCreateEpoch()
    {
        using (var read = _db.CreateCommand())
        {
            read.CommandText = "SELECT value FROM meta WHERE key = 'epoch';";
            if (read.ExecuteScalar() is string value && uint.TryParse(value, out var existing) && existing != 0)
                return existing;
        }

        var epoch = (uint)Random.Shared.Next(1, int.MaxValue);
        using var write = _db.CreateCommand();
        write.CommandText = "INSERT OR REPLACE INTO meta(key, value) VALUES('epoch', $v);";
        write.Parameters.AddWithValue("$v", epoch.ToString());
        write.ExecuteNonQuery();
        return epoch;
    }

    private List<string> RoomIds()
    {
        var ids = new List<string>();
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT DISTINCT room_id FROM messages;";
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            ids.Add(reader.GetString(0));
        return ids;
    }

    private void PrepareCommands()
    {
        _insertMessage = _db.CreateCommand();
        _insertMessage.CommandText =
            "INSERT OR REPLACE INTO messages(id, room_id, user_id, name, text, sent_at) VALUES($id, $room, $user, $name, $text, $at);";
        AddParameters(_insertMessage, "$id", "$room", "$user", "$name", "$text", "$at");

        _upsertUser = _db.CreateCommand();
        _upsertUser.CommandText = """
            INSERT INTO users(id, name, last_seen, login, password_hash, about, avatar_version, is_admin)
            VALUES($id, $name, $seen, $login, $password, $about, $avatar, $admin)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name, last_seen = excluded.last_seen, login = excluded.login,
                password_hash = excluded.password_hash, about = excluded.about,
                avatar_version = excluded.avatar_version, is_admin = excluded.is_admin;
            """;
        AddParameters(_upsertUser, "$id", "$name", "$seen", "$login", "$password", "$about", "$avatar", "$admin");

        _deleteUser = _db.CreateCommand();
        _deleteUser.CommandText = "DELETE FROM users WHERE id = $id;";
        AddParameters(_deleteUser, "$id");

        _selectBefore = _db.CreateCommand();
        _selectBefore.CommandText = """
            SELECT id, user_id, name, text, sent_at FROM messages
            WHERE room_id = $room AND id < $before
            ORDER BY id DESC LIMIT $limit;
            """;
        AddParameters(_selectBefore, "$room", "$before", "$limit");

        _deleteKeysOfUser = _db.CreateCommand();
        _deleteKeysOfUser.CommandText = "DELETE FROM user_keys WHERE user_id = $id;";
        AddParameters(_deleteKeysOfUser, "$id");

        _upsertUserKey = _db.CreateCommand();
        _upsertUserKey.CommandText = "INSERT OR REPLACE INTO user_keys(key_hash, user_id) VALUES($hash, $id);";
        AddParameters(_upsertUserKey, "$hash", "$id");

        _deleteUserKey = _db.CreateCommand();
        _deleteUserKey.CommandText = "DELETE FROM user_keys WHERE key_hash = $hash;";
        AddParameters(_deleteUserKey, "$hash");

        _upsertAvatar = _db.CreateCommand();
        _upsertAvatar.CommandText = "INSERT OR REPLACE INTO avatars(user_id, content_type, data) VALUES($id, $type, $data);";
        AddParameters(_upsertAvatar, "$id", "$type", "$data");

        _deleteAvatar = _db.CreateCommand();
        _deleteAvatar.CommandText = "DELETE FROM avatars WHERE user_id = $id;";
        AddParameters(_deleteAvatar, "$id");

        _selectAvatar = _db.CreateCommand();
        _selectAvatar.CommandText = "SELECT content_type, data FROM avatars WHERE user_id = $id;";
        AddParameters(_selectAvatar, "$id");

        _deleteMessage = _db.CreateCommand();
        _deleteMessage.CommandText = "DELETE FROM messages WHERE id = $id;";
        AddParameters(_deleteMessage, "$id");

        _upsertChannel = _db.CreateCommand();
        _upsertChannel.CommandText = """
            INSERT OR REPLACE INTO channels(room_id, default_permissions, name, is_private, created_ms, is_voice)
            VALUES($room, $perms, $name, $private, $created, $voice);
            """;
        AddParameters(_upsertChannel, "$room", "$perms", "$name", "$private", "$created", "$voice");

        // A deleted channel takes its members and its history with it.
        _deleteChannel = _db.CreateCommand();
        _deleteChannel.CommandText = """
            DELETE FROM channels WHERE room_id = $room;
            DELETE FROM channel_members WHERE room_id = $room;
            DELETE FROM messages WHERE room_id = $room;
            """;
        AddParameters(_deleteChannel, "$room");

        _upsertChannelMember = _db.CreateCommand();
        _upsertChannelMember.CommandText = """
            INSERT OR REPLACE INTO channel_members(room_id, user_id, admin_rights, title, denied, banned, until_ms, has_access)
            VALUES($room, $user, $rights, $title, $denied, $banned, $until, $access);
            """;
        AddParameters(_upsertChannelMember, "$room", "$user", "$rights", "$title", "$denied", "$banned", "$until", "$access");

        _deleteChannelMember = _db.CreateCommand();
        _deleteChannelMember.CommandText = "DELETE FROM channel_members WHERE room_id = $room AND user_id = $user;";
        AddParameters(_deleteChannelMember, "$room", "$user");

        _deleteChannelMembersOfUser = _db.CreateCommand();
        _deleteChannelMembersOfUser.CommandText = "DELETE FROM channel_members WHERE user_id = $id;";
        AddParameters(_deleteChannelMembersOfUser, "$id");

        _upsertMeta = _db.CreateCommand();
        _upsertMeta.CommandText = "INSERT OR REPLACE INTO meta(key, value) VALUES($key, $value);";
        AddParameters(_upsertMeta, "$key", "$value");

        _upsertPushSubscription = _db.CreateCommand();
        _upsertPushSubscription.CommandText = """
            INSERT OR REPLACE INTO push_subscriptions(endpoint, user_id, key_hash, p256dh, auth)
            VALUES($endpoint, $user, $hash, $key, $auth);
            """;
        AddParameters(_upsertPushSubscription, "$endpoint", "$user", "$hash", "$key", "$auth");

        _deletePushSubscription = _db.CreateCommand();
        _deletePushSubscription.CommandText = "DELETE FROM push_subscriptions WHERE endpoint = $endpoint;";
        AddParameters(_deletePushSubscription, "$endpoint");

        _deletePushSubscriptionsOfUser = _db.CreateCommand();
        _deletePushSubscriptionsOfUser.CommandText = "DELETE FROM push_subscriptions WHERE user_id = $id;";
        AddParameters(_deletePushSubscriptionsOfUser, "$id");

        _upsertGame = _db.CreateCommand();
        _upsertGame.CommandText = """
            INSERT INTO games(id, slug, owner_user_id, title, tagline, description, tags, is_public,
                created_ms, updated_ms, next_release_no)
            VALUES($id, $slug, $owner, $title, $tagline, $description, $tags, $public, $created, $updated, $next)
            ON CONFLICT(id) DO UPDATE SET
                slug = excluded.slug, owner_user_id = excluded.owner_user_id, title = excluded.title,
                tagline = excluded.tagline, description = excluded.description, tags = excluded.tags,
                is_public = excluded.is_public, updated_ms = excluded.updated_ms,
                next_release_no = excluded.next_release_no;
            """;
        AddParameters(_upsertGame, "$id", "$slug", "$owner", "$title", "$tagline", "$description", "$tags", "$public",
            "$created", "$updated", "$next");
        _upsertGameRelease = _db.CreateCommand();
        _upsertGameRelease.CommandText = """
            INSERT OR REPLACE INTO game_releases(game_id, no, version, notes, author_user_id, created_ms, entry_path, files, bytes)
            VALUES($game, $no, $version, $notes, $author, $created, $entry, $files, $bytes);
            """;
        AddParameters(_upsertGameRelease, "$game", "$no", "$version", "$notes", "$author", "$created", "$entry",
            "$files", "$bytes");
        _upsertApiToken = _db.CreateCommand();
        _upsertApiToken.CommandText = """
            INSERT OR REPLACE INTO api_tokens(hash, user_id, name, created_ms, last_used_ms)
            VALUES($hash, $user, $name, $created, $used);
            """;
        AddParameters(_upsertApiToken, "$hash", "$user", "$name", "$created", "$used");
        _deleteApiToken = _db.CreateCommand();
        _deleteApiToken.CommandText = "DELETE FROM api_tokens WHERE hash = $hash;";
        AddParameters(_deleteApiToken, "$hash");
        _deleteApiTokensOfUser = _db.CreateCommand();
        _deleteApiTokensOfUser.CommandText = "DELETE FROM api_tokens WHERE user_id = $id;";
        AddParameters(_deleteApiTokensOfUser, "$id");

        _commands =
        [
            _insertMessage, _upsertUser, _deleteUser, _selectBefore, _deleteKeysOfUser,
            _upsertUserKey, _deleteUserKey, _upsertAvatar, _deleteAvatar, _selectAvatar,
            _deleteMessage, _upsertChannel, _upsertChannelMember, _deleteChannelMember,
            _deleteChannelMembersOfUser, _deleteChannel, _upsertMeta, _upsertPushSubscription, _deletePushSubscription,
            _deletePushSubscriptionsOfUser, _upsertGame, _upsertGameRelease, _upsertApiToken, _deleteApiToken,
            _deleteApiTokensOfUser,
        ];
    }

    private static void AddParameters(SqliteCommand command, params string[] names)
    {
        foreach (var name in names)
            command.Parameters.Add(new SqliteParameter { ParameterName = name });
    }

    // ---- queueing (tick thread) -------------------------------------------------------

    public void Append(ChatMessage message) => EnqueueWrite(new AppendOp(message));
    public void SaveUser(StoredUser user) => EnqueueWrite(new SaveUserOp(user));
    public void DeleteMessage(uint messageId) => EnqueueWrite(new DeleteMessageOp(messageId));
    public void SaveChannel(StoredChannel channel) => EnqueueWrite(new SaveChannelOp(channel));
    public void SaveChannelMember(StoredChannelMember member) => EnqueueWrite(new SaveChannelMemberOp(member));
    public void DeleteChannelMember(string roomId, uint userId) => EnqueueWrite(new DeleteChannelMemberOp(roomId, userId));
    public void DeleteChannel(string roomId) => EnqueueWrite(new DeleteChannelOp(roomId));
    public void DeleteUser(uint userId) => EnqueueWrite(new DeleteUserOp(userId));
    public void SaveUserKey(StoredUserKey key) => EnqueueWrite(new SaveUserKeyOp(key));
    public void DeleteUserKey(string keyHash) => EnqueueWrite(new DeleteUserKeyOp(keyHash));
    public void SaveAvatar(uint userId, StoredAvatar? avatar) => EnqueueWrite(new SaveAvatarOp(userId, avatar));
    public void SaveMeta(string key, string value) => EnqueueWrite(new SaveMetaOp(key, value));
    public void SavePushSubscription(StoredPushSubscription subscription) => EnqueueWrite(new SavePushSubscriptionOp(subscription));
    public void DeletePushSubscription(string endpoint) => EnqueueWrite(new DeletePushSubscriptionOp(endpoint));
    public void SaveGame(StoredGame game) => EnqueueWrite(new SaveGameOp(game));
    public void SaveGameRelease(StoredGameRelease release) => EnqueueWrite(new SaveGameReleaseOp(release));
    public void SaveApiToken(StoredApiToken token) => EnqueueWrite(new SaveApiTokenOp(token));
    public void DeleteApiToken(string hash) => EnqueueWrite(new DeleteApiTokenOp(hash));
    public void SaveGameCounters(StoredGameCounters counters) => EnqueueWrite(new SaveGameCountersOp(counters));
    public void SavePlaySession(StoredPlaySession session) => EnqueueWrite(new SavePlaySessionOp(session));
    public void AppendPlayEvents(IReadOnlyList<StoredPlayEvent> events) => EnqueueWrite(new AppendPlayEventsOp(events));
    public void AppendGameHit(StoredGameHit hit) => EnqueueWrite(new AppendGameHitOp(hit));
    public void AddGameDaily(GameDailyDelta delta) => EnqueueWrite(new AddGameDailyOp(delta));

    public void QueryGameStats(string gameId, long sinceMs, Action<GameStatsData> onResult)
    {
        if (!TryEnqueue(new QueryGameStatsOp(gameId, sinceMs, onResult)))
            ThreadPool.QueueUserWorkItem(_ => onResult(new GameStatsData([], [], 0, 0, [], [], [])));
    }

    public void LoadAvatar(uint userId, Action<StoredAvatar?> onResult)
    {
        if (!TryEnqueue(new LoadAvatarOp(userId, onResult)))
            ThreadPool.QueueUserWorkItem(_ => onResult(null));
    }

    public void QueryBefore(string roomId, uint beforeId, int limit, Action<IReadOnlyList<ChatMessage>> onResult)
    {
        if (!TryEnqueue(new QueryOp(roomId, beforeId, limit, onResult)))
            ThreadPool.QueueUserWorkItem(_ => onResult([]));
    }

    public Task FlushAsync()
    {
        var done = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        if (!TryEnqueue(new FlushOp(done)))
            done.TrySetResult();
        return done.Task;
    }

    private void EnqueueWrite(Op op)
    {
        if (TryEnqueue(op))
            return;
        // Disk stalled or shutting down: the message stays in the in-memory cache but is
        // not persisted. Throttled — a stall would otherwise log per message.
        var dropped = Interlocked.Increment(ref _droppedWrites);
        if (dropped == 1 || dropped % 1000 == 0)
            _logger.LogError("Chat storage queue unavailable — {Dropped} write(s) not persisted", dropped);
    }

    private bool TryEnqueue(Op op)
    {
        try
        {
            return !_queue.IsAddingCompleted && _queue.TryAdd(op);
        }
        catch (InvalidOperationException)
        {
            return false; // completed concurrently
        }
    }

    // ---- worker thread ----------------------------------------------------------------

    private void Run()
    {
        var batch = new List<Op>(MaxBatch);
        // Returns false once CompleteAdding was called and the queue is drained.
        while (_queue.TryTake(out var first, Timeout.Infinite))
        {
            batch.Clear();
            batch.Add(first);
            while (batch.Count < MaxBatch && _queue.TryTake(out var next))
                batch.Add(next);

            ExecuteBatch(batch);

            if (Stopwatch.GetElapsedTime(_lastPrune) >= PruneInterval)
            {
                _lastPrune = Stopwatch.GetTimestamp();
                try { Prune(); }
                catch (Exception e) { _logger.LogError(e, "Chat storage prune failed"); }
            }
        }
    }

    private void ExecuteBatch(List<Op> batch)
    {
        try
        {
            using var tx = _db.BeginTransaction();
            _tx = tx;
            foreach (var command in _commands)
                command.Transaction = tx;

            foreach (var op in batch)
            {
                switch (op)
                {
                    case AppendOp(var m):
                        _insertMessage.Parameters[0].Value = (long)m.Id;
                        _insertMessage.Parameters[1].Value = m.RoomId;
                        _insertMessage.Parameters[2].Value = (long)m.UserId;
                        _insertMessage.Parameters[3].Value = m.Name;
                        _insertMessage.Parameters[4].Value = m.Text;
                        _insertMessage.Parameters[5].Value = m.SentAtMs;
                        _insertMessage.ExecuteNonQuery();
                        break;
                    case SaveUserOp(var u):
                        _upsertUser.Parameters[0].Value = (long)u.Id;
                        _upsertUser.Parameters[1].Value = u.Name;
                        _upsertUser.Parameters[2].Value = u.LastSeenMs;
                        _upsertUser.Parameters[3].Value = (object?)u.Login ?? DBNull.Value;
                        _upsertUser.Parameters[4].Value = (object?)u.PasswordHash ?? DBNull.Value;
                        _upsertUser.Parameters[5].Value = u.About;
                        _upsertUser.Parameters[6].Value = (long)u.AvatarVersion;
                        _upsertUser.Parameters[7].Value = u.IsAdmin ? 1L : 0L;
                        _upsertUser.ExecuteNonQuery();
                        break;
                    case DeleteMessageOp(var messageId):
                        _deleteMessage.Parameters[0].Value = (long)messageId;
                        _deleteMessage.ExecuteNonQuery();
                        break;
                    case SaveChannelOp(var c):
                        _upsertChannel.Parameters[0].Value = c.RoomId;
                        _upsertChannel.Parameters[1].Value = (long)c.DefaultPermissions;
                        _upsertChannel.Parameters[2].Value = (object?)c.Name ?? DBNull.Value;
                        _upsertChannel.Parameters[3].Value = c.IsPrivate ? 1L : 0L;
                        _upsertChannel.Parameters[4].Value = c.CreatedMs;
                        _upsertChannel.Parameters[5].Value = c.IsVoice ? 1L : 0L;
                        _upsertChannel.ExecuteNonQuery();
                        break;
                    case SaveChannelMemberOp(var cm):
                        _upsertChannelMember.Parameters[0].Value = cm.RoomId;
                        _upsertChannelMember.Parameters[1].Value = (long)cm.UserId;
                        _upsertChannelMember.Parameters[2].Value = (long)cm.AdminRights;
                        _upsertChannelMember.Parameters[3].Value = cm.Title;
                        _upsertChannelMember.Parameters[4].Value = (long)cm.Denied;
                        _upsertChannelMember.Parameters[5].Value = cm.Banned ? 1L : 0L;
                        _upsertChannelMember.Parameters[6].Value = cm.UntilMs;
                        _upsertChannelMember.Parameters[7].Value = cm.HasAccess ? 1L : 0L;
                        _upsertChannelMember.ExecuteNonQuery();
                        break;
                    case DeleteChannelOp(var channelId):
                        _deleteChannel.Parameters[0].Value = channelId;
                        _deleteChannel.ExecuteNonQuery();
                        break;
                    case DeleteChannelMemberOp(var roomId, var userId):
                        _deleteChannelMember.Parameters[0].Value = roomId;
                        _deleteChannelMember.Parameters[1].Value = (long)userId;
                        _deleteChannelMember.ExecuteNonQuery();
                        break;
                    case DeleteUserOp(var id):
                        _deleteUser.Parameters[0].Value = (long)id;
                        _deleteUser.ExecuteNonQuery();
                        _deleteKeysOfUser.Parameters[0].Value = (long)id;
                        _deleteKeysOfUser.ExecuteNonQuery();
                        _deleteAvatar.Parameters[0].Value = (long)id;
                        _deleteAvatar.ExecuteNonQuery();
                        _deleteChannelMembersOfUser.Parameters[0].Value = (long)id;
                        _deleteChannelMembersOfUser.ExecuteNonQuery();
                        _deletePushSubscriptionsOfUser.Parameters[0].Value = (long)id;
                        _deletePushSubscriptionsOfUser.ExecuteNonQuery();
                        _deleteApiTokensOfUser.Parameters[0].Value = (long)id;
                        _deleteApiTokensOfUser.ExecuteNonQuery();
                        break;
                    case SaveGameOp(var g):
                        _upsertGame.Parameters[0].Value = g.Id;
                        _upsertGame.Parameters[1].Value = g.Slug;
                        _upsertGame.Parameters[2].Value = (long)g.OwnerUserId;
                        _upsertGame.Parameters[3].Value = g.Title;
                        _upsertGame.Parameters[4].Value = g.Tagline;
                        _upsertGame.Parameters[5].Value = g.Description;
                        _upsertGame.Parameters[6].Value = System.Text.Json.JsonSerializer.Serialize(g.Tags);
                        _upsertGame.Parameters[7].Value = g.IsPublic ? 1L : 0L;
                        _upsertGame.Parameters[8].Value = g.CreatedMs;
                        _upsertGame.Parameters[9].Value = g.UpdatedMs;
                        _upsertGame.Parameters[10].Value = (long)g.NextReleaseNo;
                        _upsertGame.ExecuteNonQuery();
                        break;
                    case SaveGameReleaseOp(var r):
                        _upsertGameRelease.Parameters[0].Value = r.GameId;
                        _upsertGameRelease.Parameters[1].Value = (long)r.No;
                        _upsertGameRelease.Parameters[2].Value = r.Version;
                        _upsertGameRelease.Parameters[3].Value = r.Notes;
                        _upsertGameRelease.Parameters[4].Value = (long)r.AuthorUserId;
                        _upsertGameRelease.Parameters[5].Value = r.CreatedMs;
                        _upsertGameRelease.Parameters[6].Value = r.EntryPath;
                        _upsertGameRelease.Parameters[7].Value = (long)r.Files;
                        _upsertGameRelease.Parameters[8].Value = r.Bytes;
                        _upsertGameRelease.ExecuteNonQuery();
                        break;
                    case SaveApiTokenOp(var t):
                        _upsertApiToken.Parameters[0].Value = t.Hash;
                        _upsertApiToken.Parameters[1].Value = (long)t.UserId;
                        _upsertApiToken.Parameters[2].Value = t.Name;
                        _upsertApiToken.Parameters[3].Value = t.CreatedMs;
                        _upsertApiToken.Parameters[4].Value = t.LastUsedMs;
                        _upsertApiToken.ExecuteNonQuery();
                        break;
                    case DeleteApiTokenOp(var hash):
                        _deleteApiToken.Parameters[0].Value = hash;
                        _deleteApiToken.ExecuteNonQuery();
                        break;
                    case SaveGameCountersOp(var c):
                        Exec("""
                            UPDATE games SET views_total = $v, launches_total = $l, plays_total = $p,
                                active_ms_total = $a WHERE id = $id;
                            """, ("$id", c.GameId), ("$v", c.Views), ("$l", c.Launches), ("$p", c.Plays), ("$a", c.ActiveMs));
                        break;
                    case SavePlaySessionOp(var ps):
                        Exec("""
                            INSERT OR REPLACE INTO game_play_sessions(id, game_id, release_no, user_id, visitor_id, own,
                                device, source, started_ms, last_seen_ms, active_ms, counted, ended)
                            VALUES($id, $g, $r, $u, $v, $own, $d, $s, $st, $ls, $a, $c, $e);
                            """, ("$id", ps.Id), ("$g", ps.GameId), ("$r", (long)ps.ReleaseNo), ("$u", (long)ps.UserId),
                            ("$v", ps.VisitorId), ("$own", ps.Own ? 1L : 0L), ("$d", ps.Device), ("$s", ps.Source),
                            ("$st", ps.StartedMs), ("$ls", ps.LastSeenMs), ("$a", ps.ActiveMs),
                            ("$c", ps.Counted ? 1L : 0L), ("$e", ps.Ended ? 1L : 0L));
                        break;
                    case AppendPlayEventsOp(var events):
                        foreach (var ev in events)
                        {
                            Exec("""
                                INSERT INTO game_play_events(session_id, game_id, own, name, level, params, ms)
                                VALUES($s, $g, $own, $n, $l, $p, $ms);
                                """, ("$s", ev.SessionId), ("$g", ev.GameId), ("$own", ev.Own ? 1L : 0L), ("$n", ev.Name),
                                ("$l", ev.Level), ("$p", ev.Params), ("$ms", ev.Ms));
                        }
                        break;
                    case AppendGameHitOp(var hit):
                        Exec("""
                            INSERT INTO game_hits(game_id, kind, user_id, visitor_id, source, ms)
                            VALUES($g, $k, $u, $v, $s, $ms);
                            """, ("$g", hit.GameId), ("$k", hit.Kind), ("$u", (long)hit.UserId), ("$v", hit.VisitorId),
                            ("$s", hit.Source), ("$ms", hit.Ms));
                        break;
                    case AddGameDailyOp(var d):
                        Exec("""
                            INSERT INTO game_daily(game_id, day, views, launches, plays, active_ms, new_players)
                            VALUES($g, $day, $v, $l, $p, $a, $n)
                            ON CONFLICT(game_id, day) DO UPDATE SET
                                views = views + excluded.views, launches = launches + excluded.launches,
                                plays = plays + excluded.plays, active_ms = active_ms + excluded.active_ms,
                                new_players = new_players + excluded.new_players;
                            """, ("$g", d.GameId), ("$day", d.Day), ("$v", d.Views), ("$l", d.Launches), ("$p", d.Plays),
                            ("$a", d.ActiveMs), ("$n", d.NewPlayers));
                        break;
                    case QueryGameStatsOp gs:
                        gs.Result = SelectGameStats(gs.GameId, gs.SinceMs);
                        break;
                    case SaveMetaOp(var key, var value):
                        _upsertMeta.Parameters[0].Value = key;
                        _upsertMeta.Parameters[1].Value = value;
                        _upsertMeta.ExecuteNonQuery();
                        break;
                    case SavePushSubscriptionOp(var ps):
                        _upsertPushSubscription.Parameters[0].Value = ps.Endpoint;
                        _upsertPushSubscription.Parameters[1].Value = (long)ps.UserId;
                        _upsertPushSubscription.Parameters[2].Value = (object?)ps.KeyHash ?? DBNull.Value;
                        _upsertPushSubscription.Parameters[3].Value = ps.P256dh;
                        _upsertPushSubscription.Parameters[4].Value = ps.Auth;
                        _upsertPushSubscription.ExecuteNonQuery();
                        break;
                    case DeletePushSubscriptionOp(var endpoint):
                        _deletePushSubscription.Parameters[0].Value = endpoint;
                        _deletePushSubscription.ExecuteNonQuery();
                        break;
                    case SaveUserKeyOp(var k):
                        _upsertUserKey.Parameters[0].Value = k.KeyHash;
                        _upsertUserKey.Parameters[1].Value = (long)k.UserId;
                        _upsertUserKey.ExecuteNonQuery();
                        break;
                    case DeleteUserKeyOp(var hash):
                        _deleteUserKey.Parameters[0].Value = hash;
                        _deleteUserKey.ExecuteNonQuery();
                        break;
                    case SaveAvatarOp(var id, var avatar):
                        if (avatar == null)
                        {
                            _deleteAvatar.Parameters[0].Value = (long)id;
                            _deleteAvatar.ExecuteNonQuery();
                        }
                        else
                        {
                            _upsertAvatar.Parameters[0].Value = (long)id;
                            _upsertAvatar.Parameters[1].Value = avatar.ContentType;
                            _upsertAvatar.Parameters[2].Value = avatar.Data;
                            _upsertAvatar.ExecuteNonQuery();
                        }
                        break;
                    case LoadAvatarOp a:
                        a.Result = SelectAvatar(a.UserId);
                        break;
                    case QueryOp q:
                        // Same connection, same transaction: sees the appends just above.
                        q.Result = SelectBefore(q.RoomId, q.BeforeId, q.Limit);
                        break;
                }
            }

            tx.Commit();
        }
        catch (Exception e)
        {
            _logger.LogError(e, "Chat storage batch of {Count} operation(s) failed", batch.Count);
        }
        finally
        {
            _tx = null;
        }

        // Answer after the commit (or the failure: an empty page beats a client that waits
        // forever).
        foreach (var op in batch)
        {
            try
            {
                switch (op)
                {
                    case QueryOp q: q.OnResult(q.Result); break;
                    case QueryGameStatsOp gs: gs.OnResult(gs.Result); break;
                    case LoadAvatarOp a: a.OnResult(a.Result); break;
                    case FlushOp f: f.Done.TrySetResult(); break;
                }
            }
            catch (Exception e)
            {
                _logger.LogError(e, "Chat storage callback failed");
            }
        }
    }

    private List<ChatMessage> SelectBefore(string roomId, uint beforeId, int limit)
    {
        _selectBefore.Parameters[0].Value = roomId;
        _selectBefore.Parameters[1].Value = (long)beforeId;
        _selectBefore.Parameters[2].Value = limit;

        var result = new List<ChatMessage>(Math.Min(limit, 256));
        using var reader = _selectBefore.ExecuteReader();
        while (reader.Read())
        {
            result.Add(new ChatMessage(
                (uint)reader.GetInt64(0), roomId, (uint)reader.GetInt64(1),
                reader.GetString(2), reader.GetString(3), reader.GetInt64(4)));
        }
        return result;
    }

    private StoredAvatar? SelectAvatar(uint userId)
    {
        _selectAvatar.Parameters[0].Value = (long)userId;
        using var reader = _selectAvatar.ExecuteReader();
        return reader.Read() ? new StoredAvatar(reader.GetString(0), (byte[])reader[1]) : null;
    }

    // ---- retention --------------------------------------------------------------------

    private void Prune()
    {
        if (_maxMessagesPerRoom > 0)
        {
            foreach (var roomId in RoomIds())
            {
                using var cmd = _db.CreateCommand();
                cmd.CommandText = """
                    DELETE FROM messages WHERE room_id = $room AND id <=
                        (SELECT id FROM messages WHERE room_id = $room ORDER BY id DESC LIMIT 1 OFFSET $keep);
                    """;
                cmd.Parameters.AddWithValue("$room", roomId);
                cmd.Parameters.AddWithValue("$keep", _maxMessagesPerRoom);
                var removed = cmd.ExecuteNonQuery();
                if (removed > 0)
                    _logger.LogInformation("Chat storage: pruned {Count} old message(s) from {RoomId}", removed, roomId);
            }
        }

        if (_analyticsRetentionDays > 0)
        {
            using var cmd = _db.CreateCommand();
            // Raw analytics only: the daily counters and the totals on the games stay.
            cmd.CommandText = """
                DELETE FROM game_play_sessions WHERE started_ms < $cutoff;
                DELETE FROM game_play_events WHERE ms < $cutoff;
                DELETE FROM game_hits WHERE ms < $cutoff;
                """;
            cmd.Parameters.AddWithValue("$cutoff",
                DateTimeOffset.UtcNow.AddDays(-_analyticsRetentionDays).ToUnixTimeMilliseconds());
            cmd.ExecuteNonQuery();
        }

        if (_userRetentionDays > 0)
        {
            using var cmd = _db.CreateCommand();
            // Guests only: a claimed account is somebody's, however long they stay away.
            cmd.CommandText = """
                DELETE FROM users WHERE last_seen < $cutoff AND login IS NULL;
                DELETE FROM user_keys WHERE user_id NOT IN (SELECT id FROM users);
                DELETE FROM avatars WHERE user_id NOT IN (SELECT id FROM users);
                DELETE FROM channel_members WHERE user_id NOT IN (SELECT id FROM users);
                DELETE FROM push_subscriptions WHERE user_id NOT IN (SELECT id FROM users);
                DELETE FROM api_tokens WHERE user_id NOT IN (SELECT id FROM users);
                """;
            cmd.Parameters.AddWithValue("$cutoff",
                DateTimeOffset.UtcNow.AddDays(-_userRetentionDays).ToUnixTimeMilliseconds());
            cmd.ExecuteNonQuery();
        }
    }

    // ---- games analytics ----------------------------------------------------------------

    private void Exec(string sql, params (string Name, object Value)[] args)
    {
        using var cmd = _db.CreateCommand();
        cmd.Transaction = _tx;
        cmd.CommandText = sql;
        foreach (var (name, value) in args)
            cmd.Parameters.AddWithValue(name, value);
        cmd.ExecuteNonQuery();
    }

    private List<T> Select<T>(string sql, Func<SqliteDataReader, T> row, params (string Name, object Value)[] args)
    {
        using var cmd = _db.CreateCommand();
        cmd.Transaction = _tx;
        cmd.CommandText = sql;
        foreach (var (name, value) in args)
            cmd.Parameters.AddWithValue(name, value);
        using var reader = cmd.ExecuteReader();
        var rows = new List<T>();
        while (reader.Read())
            rows.Add(row(reader));
        return rows;
    }

    // A player is a user, or an anonymous visitor's random id.
    private const string PlayerKey = "CASE WHEN user_id > 0 THEN 'u' || user_id ELSE 'v' || visitor_id END";

    private GameStatsData SelectGameStats(string gameId, long sinceMs)
    {
        var all = gameId.Length == 0;
        var gameFilter = all ? "1 = 1" : "game_id = $g";
        var args = new (string, object)[] { ("$g", gameId), ("$since", sinceMs),
            ("$sinceDay", DateTimeOffset.FromUnixTimeMilliseconds(Math.Max(0, sinceMs)).UtcDateTime.ToString("yyyy-MM-dd")) };

        var playersByDay = Select($"""
            SELECT date(started_ms / 1000, 'unixepoch') AS d, COUNT(DISTINCT {PlayerKey})
            FROM game_play_sessions WHERE {gameFilter} AND own = 0 AND started_ms >= $since GROUP BY d;
            """, r => (r.GetString(0), r.GetInt64(1)), args).ToDictionary(x => x.Item1, x => x.Item2);
        var days = Select("""
            SELECT day, views, launches, plays, active_ms FROM game_daily
            WHERE game_id = $g AND day >= $sinceDay ORDER BY day;
            """, r => new GameDay(r.GetString(0), r.GetInt64(1), r.GetInt64(2), r.GetInt64(3), r.GetInt64(4),
                playersByDay.GetValueOrDefault(r.GetString(0))), args);

        var sessions = Select($"""
            SELECT active_ms FROM game_play_sessions WHERE {gameFilter} AND own = 0 AND started_ms >= $since
            ORDER BY started_ms DESC LIMIT 50000;
            """, r => r.GetInt64(0), args);
        var players = Select($"""
            SELECT COUNT(DISTINCT {PlayerKey}) FROM game_play_sessions
            WHERE {gameFilter} AND own = 0 AND started_ms >= $since;
            """, r => r.GetInt64(0), args).Single();
        var returning = Select($"""
            SELECT COUNT(*) FROM (SELECT {PlayerKey} AS p FROM game_play_sessions
                WHERE {gameFilter} AND own = 0 AND started_ms >= $since
                GROUP BY p HAVING COUNT(DISTINCT date(started_ms / 1000, 'unixepoch')) >= 2);
            """, r => r.GetInt64(0), args).Single();

        IReadOnlyList<NamedCount> events = [], levels = [];
        if (!all)
        {
            events = Select("""
                SELECT name, COUNT(*) FROM game_play_events
                WHERE game_id = $g AND own = 0 AND ms >= $since AND name <> 'level_complete'
                GROUP BY name ORDER BY 2 DESC, name LIMIT 50;
                """, r => new NamedCount(r.GetString(0), r.GetInt64(1)), args);
            levels = Select("""
                SELECT level, COUNT(DISTINCT session_id) FROM game_play_events
                WHERE game_id = $g AND own = 0 AND ms >= $since AND name = 'level_complete'
                GROUP BY level ORDER BY MIN(ms) LIMIT 100;
                """, r => new NamedCount(r.GetString(0), r.GetInt64(1)), args);
        }
        var sources = Select($"""
            SELECT source, COUNT(*) FROM game_hits WHERE {gameFilter} AND kind = 'view' AND ms >= $since
            GROUP BY source ORDER BY 2 DESC;
            """, r => new NamedCount(r.GetString(0), r.GetInt64(1)), args);
        return new GameStatsData(days, sessions, players, returning, events, levels, sources);
    }

    // ---- helpers ----------------------------------------------------------------------

    private static IReadOnlyList<string> ReadTags(string json)
    {
        try { return System.Text.Json.JsonSerializer.Deserialize<List<string>>(json) ?? []; }
        catch (System.Text.Json.JsonException) { return []; }
    }

    private void Execute(string sql)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = sql;
        cmd.ExecuteNonQuery();
    }

    private long Scalar(string sql)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = sql;
        return Convert.ToInt64(cmd.ExecuteScalar());
    }

    public void Dispose()
    {
        if (_queue.IsAddingCompleted)
            return;
        _queue.CompleteAdding();
        // Let the worker commit what is still queued before the connection goes away.
        if (_worker != null && !_worker.Join(TimeSpan.FromSeconds(10)))
            _logger.LogWarning("Chat storage worker did not finish in time; some writes may be lost");

        foreach (var command in _commands)
            command.Dispose();
        _db.Dispose();
    }
}

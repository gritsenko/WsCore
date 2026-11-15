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
    private sealed record QueryOp(string RoomId, uint BeforeId, int Limit, Action<IReadOnlyList<ChatMessage>> OnResult) : Op
    {
        public IReadOnlyList<ChatMessage> Result = [];
    }
    private sealed record FlushOp(TaskCompletionSource Done) : Op;

    private readonly SqliteConnection _db;
    private readonly ILogger _logger;
    private readonly int _maxMessagesPerRoom;
    private readonly int _userRetentionDays;
    private readonly BlockingCollection<Op> _queue = new(new ConcurrentQueue<Op>(), QueueCapacity);
    private Thread? _worker;
    private long _lastPrune = Stopwatch.GetTimestamp();
    private long _droppedWrites;

    private SqliteCommand _insertMessage = null!;
    private SqliteCommand _upsertUser = null!;
    private SqliteCommand _deleteUser = null!;
    private SqliteCommand _selectBefore = null!;

    public bool IsPersistent => true;

    public SqliteChatStorage(string path, int maxMessagesPerRoom, int userRetentionDays, ILogger logger)
    {
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
            CREATE TABLE IF NOT EXISTS users(
                id        INTEGER PRIMARY KEY,
                key_hash  TEXT    NOT NULL UNIQUE,
                name      TEXT    NOT NULL,
                last_seen INTEGER NOT NULL
            );
            """);
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
            cmd.CommandText = "SELECT id, key_hash, name, last_seen FROM users;";
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
                users.Add(new StoredUser((uint)reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetInt64(3)));
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
        return new StorageSnapshot(epoch, nextMessageId, nextUserId, users, rooms);
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
            INSERT INTO users(id, key_hash, name, last_seen) VALUES($id, $hash, $name, $seen)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen;
            """;
        AddParameters(_upsertUser, "$id", "$hash", "$name", "$seen");

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
    }

    private static void AddParameters(SqliteCommand command, params string[] names)
    {
        foreach (var name in names)
            command.Parameters.Add(new SqliteParameter { ParameterName = name });
    }

    // ---- queueing (tick thread) -------------------------------------------------------

    public void Append(ChatMessage message) => EnqueueWrite(new AppendOp(message));
    public void SaveUser(StoredUser user) => EnqueueWrite(new SaveUserOp(user));
    public void DeleteUser(uint userId) => EnqueueWrite(new DeleteUserOp(userId));

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
            _insertMessage.Transaction = tx;
            _upsertUser.Transaction = tx;
            _deleteUser.Transaction = tx;
            _selectBefore.Transaction = tx;

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
                        _upsertUser.Parameters[1].Value = u.KeyHash;
                        _upsertUser.Parameters[2].Value = u.Name;
                        _upsertUser.Parameters[3].Value = u.LastSeenMs;
                        _upsertUser.ExecuteNonQuery();
                        break;
                    case DeleteUserOp(var id):
                        _deleteUser.Parameters[0].Value = (long)id;
                        _deleteUser.ExecuteNonQuery();
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

        // Answer after the commit (or the failure: an empty page beats a client that waits
        // forever).
        foreach (var op in batch)
        {
            try
            {
                switch (op)
                {
                    case QueryOp q: q.OnResult(q.Result); break;
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

        if (_userRetentionDays > 0)
        {
            using var cmd = _db.CreateCommand();
            cmd.CommandText = "DELETE FROM users WHERE last_seen < $cutoff;";
            cmd.Parameters.AddWithValue("$cutoff",
                DateTimeOffset.UtcNow.AddDays(-_userRetentionDays).ToUnixTimeMilliseconds());
            cmd.ExecuteNonQuery();
        }
    }

    // ---- helpers ----------------------------------------------------------------------

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

        _insertMessage?.Dispose();
        _upsertUser?.Dispose();
        _deleteUser?.Dispose();
        _selectBefore?.Dispose();
        _db.Dispose();
    }
}

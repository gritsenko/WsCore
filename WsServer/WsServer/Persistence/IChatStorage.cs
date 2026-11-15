namespace WsServer.Persistence;

/// <summary>One stored chat message. Ids are global (across rooms) and strictly increasing.</summary>
public sealed record ChatMessage(uint Id, string RoomId, uint UserId, string Name, string Text, long SentAtMs);

/// <summary>A known user as persisted: the key is stored only as a hash.</summary>
public sealed record StoredUser(uint Id, string KeyHash, string Name, long LastSeenMs);

/// <summary>The most recent messages of one room, oldest first.</summary>
public sealed record StoredRoomHistory(string RoomId, IReadOnlyList<ChatMessage> Recent, bool HasOlder);

/// <summary>Everything the server keeps in memory, read once at startup.</summary>
public sealed record StorageSnapshot(
    uint Epoch,
    uint NextMessageId,
    uint NextUserId,
    IReadOnlyList<StoredUser> Users,
    IReadOnlyList<StoredRoomHistory> Rooms);

/// <summary>
/// Durable storage behind the chat history and the user directory.
///
/// Threading contract: <see cref="Load"/> is called once, before anything else. All other
/// members are called from the tick thread and never block on I/O — writes are queued
/// (write-behind) and a query's result is handed to its callback on the storage's own
/// thread. Operations are executed strictly in the order they were queued, so a query
/// always sees every message appended before it.
/// </summary>
public interface IChatStorage : IDisposable
{
    /// <summary>False for the in-memory fallback: nothing survives a restart.</summary>
    bool IsPersistent { get; }

    StorageSnapshot Load(int recentPerRoom);

    void Append(ChatMessage message);

    void SaveUser(StoredUser user);

    void DeleteUser(uint userId);

    /// <summary>
    /// Up to <paramref name="limit"/> messages of the room with Id &lt; beforeId, newest
    /// first. The callback runs on the storage thread (never inline).
    /// </summary>
    void QueryBefore(string roomId, uint beforeId, int limit, Action<IReadOnlyList<ChatMessage>> onResult);

    /// <summary>Completes once everything queued so far has been committed.</summary>
    Task FlushAsync();
}

/// <summary>
/// No persistence (tests, load test, or a database that could not be opened): history is
/// whatever the in-memory cache holds, users are forgotten on restart.
/// </summary>
public sealed class NullChatStorage : IChatStorage
{
    public bool IsPersistent => false;

    // A fresh epoch per process: clients must drop message ids cached from a previous run.
    public StorageSnapshot Load(int recentPerRoom) =>
        new((uint)Random.Shared.Next(1, int.MaxValue), 1, 1, [], []);

    public void Append(ChatMessage message) { }
    public void SaveUser(StoredUser user) { }
    public void DeleteUser(uint userId) { }

    public void QueryBefore(string roomId, uint beforeId, int limit, Action<IReadOnlyList<ChatMessage>> onResult)
        => ThreadPool.QueueUserWorkItem(_ => onResult([]));

    public Task FlushAsync() => Task.CompletedTask;
    public void Dispose() { }
}

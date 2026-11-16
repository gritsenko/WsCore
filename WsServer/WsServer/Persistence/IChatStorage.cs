namespace WsServer.Persistence;

/// <summary>One stored chat message. Ids are global (across rooms) and strictly increasing.</summary>
public sealed record ChatMessage(uint Id, string RoomId, uint UserId, string Name, string Text, long SentAtMs);

/// <summary>
/// A known user as persisted. <see cref="Login"/> / <see cref="PasswordHash"/> are set once
/// the user claimed the account (the login is stored lower-cased; it is unique).
/// </summary>
public sealed record StoredUser(uint Id, string Name, long LastSeenMs)
{
    public string? Login { get; init; }
    public string? PasswordHash { get; init; }
    public string About { get; init; } = string.Empty;
    /// <summary>0 = no avatar; otherwise changes whenever the avatar does (cache buster).</summary>
    public uint AvatarVersion { get; init; }
    /// <summary>A server admin (every right in every channel).</summary>
    public bool IsAdmin { get; init; }
}

/// <summary>A channel's (room's) settings that differ from the defaults.</summary>
public sealed record StoredChannel(string RoomId, byte DefaultPermissions);

/// <summary>
/// A user's standing in one channel: admin rights + title, and / or a restriction
/// (denied permissions, a ban) lasting until <see cref="UntilMs"/> (0 = forever).
/// </summary>
public sealed record StoredChannelMember(string RoomId, uint UserId)
{
    public byte AdminRights { get; init; }
    public string Title { get; init; } = string.Empty;
    public byte Denied { get; init; }
    public bool Banned { get; init; }
    public long UntilMs { get; init; }
}

/// <summary>
/// One key (device) of a user: a user is whoever presents a key whose hash is listed
/// here. Only the hash is stored — the key itself is a bearer secret.
/// </summary>
public sealed record StoredUserKey(string KeyHash, uint UserId);

/// <summary>A user's avatar image, as uploaded (already validated and size-capped).</summary>
public sealed record StoredAvatar(string ContentType, byte[] Data);

/// <summary>
/// A browser's Web Push subscription: owned by a user, and by the device key it was
/// registered with (a logout of that key drops it). Keys as base64url.
/// </summary>
public sealed record StoredPushSubscription(string Endpoint, uint UserId, string? KeyHash, string P256dh, string Auth);

/// <summary>The most recent messages of one room, oldest first.</summary>
public sealed record StoredRoomHistory(string RoomId, IReadOnlyList<ChatMessage> Recent, bool HasOlder);

/// <summary>Everything the server keeps in memory, read once at startup.</summary>
public sealed record StorageSnapshot(
    uint Epoch,
    uint NextMessageId,
    uint NextUserId,
    IReadOnlyList<StoredUser> Users,
    IReadOnlyList<StoredUserKey> UserKeys,
    IReadOnlyList<StoredRoomHistory> Rooms)
{
    public IReadOnlyList<StoredChannel> Channels { get; init; } = [];
    public IReadOnlyList<StoredChannelMember> ChannelMembers { get; init; } = [];
    /// <summary>Server-wide settings (key → value), e.g. the generated VAPID keys.</summary>
    public IReadOnlyDictionary<string, string> Meta { get; init; } = new Dictionary<string, string>();
    public IReadOnlyList<StoredPushSubscription> PushSubscriptions { get; init; } = [];
}

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

    /// <summary>Removes the message (a deletion); a no-op if it is not stored.</summary>
    void DeleteMessage(uint messageId);

    void SaveChannel(StoredChannel channel);

    /// <summary>Stores the user's standing in a channel (replacing the previous one).</summary>
    void SaveChannelMember(StoredChannelMember member);

    void DeleteChannelMember(string roomId, uint userId);

    /// <summary>Stores a server-wide setting (see <see cref="StorageSnapshot.Meta"/>).</summary>
    void SaveMeta(string key, string value);

    /// <summary>Stores a push subscription (replacing the one with the same endpoint).</summary>
    void SavePushSubscription(StoredPushSubscription subscription);

    void DeletePushSubscription(string endpoint);

    /// <summary>Removes the user with its keys, avatar, channel standings and push subscriptions.</summary>
    void DeleteUser(uint userId);

    /// <summary>Makes <paramref name="keyHash"/> a key of the user (moving it from another user).</summary>
    void SaveUserKey(StoredUserKey key);

    void DeleteUserKey(string keyHash);

    /// <summary>Stores the user's avatar; null removes it.</summary>
    void SaveAvatar(uint userId, StoredAvatar? avatar);

    /// <summary>
    /// The user's avatar (null if none). Unlike the rest of the interface this may be
    /// called from any thread (the HTTP endpoint); the callback never runs inline.
    /// </summary>
    void LoadAvatar(uint userId, Action<StoredAvatar?> onResult);

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
/// whatever the in-memory cache holds, users are forgotten on restart. Avatars are kept
/// in memory so they work for the lifetime of the process.
/// </summary>
public sealed class NullChatStorage : IChatStorage
{
    public bool IsPersistent => false;

    // A fresh epoch per process: clients must drop message ids cached from a previous run.
    public StorageSnapshot Load(int recentPerRoom) =>
        new((uint)Random.Shared.Next(1, int.MaxValue), 1, 1, [], [], []);

    private readonly System.Collections.Concurrent.ConcurrentDictionary<uint, StoredAvatar> _avatars = new();

    public void Append(ChatMessage message) { }
    public void DeleteMessage(uint messageId) { }
    public void SaveChannel(StoredChannel channel) { }
    public void SaveChannelMember(StoredChannelMember member) { }
    public void DeleteChannelMember(string roomId, uint userId) { }
    public void SaveUser(StoredUser user) { }
    public void DeleteUser(uint userId) => _avatars.TryRemove(userId, out _);
    public void SaveUserKey(StoredUserKey key) { }
    public void DeleteUserKey(string keyHash) { }
    public void SaveMeta(string key, string value) { }
    public void SavePushSubscription(StoredPushSubscription subscription) { }
    public void DeletePushSubscription(string endpoint) { }

    public void SaveAvatar(uint userId, StoredAvatar? avatar)
    {
        if (avatar == null) _avatars.TryRemove(userId, out _);
        else _avatars[userId] = avatar;
    }

    public void LoadAvatar(uint userId, Action<StoredAvatar?> onResult)
    {
        var avatar = _avatars.GetValueOrDefault(userId);
        ThreadPool.QueueUserWorkItem(_ => onResult(avatar));
    }

    public void QueryBefore(string roomId, uint beforeId, int limit, Action<IReadOnlyList<ChatMessage>> onResult)
        => ThreadPool.QueueUserWorkItem(_ => onResult([]));

    public Task FlushAsync() => Task.CompletedTask;
    public void Dispose() { }
}

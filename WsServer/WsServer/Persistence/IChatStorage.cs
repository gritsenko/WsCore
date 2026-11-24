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
    /// <summary>Hidden from others on every leaderboard (a display rule; scores are still kept).</summary>
    public bool LeaderboardHidden { get; init; }
}

/// <summary>
/// A channel's (room's) settings that differ from the defaults. A channel with a
/// <see cref="Name"/> was created by an admin (a built-in room has none — its name comes
/// from the code); <see cref="IsPrivate"/> = only members with access see and enter it.
/// </summary>
public sealed record StoredChannel(string RoomId, byte DefaultPermissions)
{
    public string? Name { get; init; }
    public bool IsPrivate { get; init; }
    public long CreatedMs { get; init; }
    /// <summary>A created channel that is a voice channel (voice + its text chat).</summary>
    public bool IsVoice { get; init; }
}

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
    /// <summary>May see and enter the channel while it is private.</summary>
    public bool HasAccess { get; init; }
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

/// <summary>
/// A game of the games portal (its metadata; the builds are files on disk). A draft
/// (<see cref="IsPublic"/> false) is seen only by its owner and server admins.
/// <see cref="NextReleaseNo"/> is never handed out twice, so a release's URL never changes
/// content.
/// </summary>
public sealed record StoredGame(string Id, string Slug, uint OwnerUserId, string Title)
{
    public string Tagline { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public IReadOnlyList<string> Tags { get; init; } = [];
    public bool IsPublic { get; init; }
    public long CreatedMs { get; init; }
    public long UpdatedMs { get; init; }
    public uint NextReleaseNo { get; init; } = 1;
}

/// <summary>
/// A picture of a game — its cover (one; cards, the page, link previews), its header (one,
/// a wide strip atop the page) or a screenshot (ordered by <see cref="Order"/>). The file is
/// on disk next to the builds; <see cref="Width"/> / <see cref="Height"/> are read from it.
/// </summary>
public sealed record StoredGameMedia(string Id, string GameId, string Kind, string ContentType, long CreatedMs)
{
    public int Order { get; init; }
    public int Width { get; init; }
    public int Height { get; init; }
    public long Bytes { get; init; }
}

/// <summary>One uploaded build of a game. Never deleted (its files may be, see GameKeepReleases).</summary>
public sealed record StoredGameRelease(string GameId, uint No, uint AuthorUserId, long CreatedMs)
{
    public string Version { get; init; } = string.Empty;
    public string Notes { get; init; } = string.Empty;
    /// <summary>The HTML entry point, relative to the release directory ('/'-separated).</summary>
    public string EntryPath { get; init; } = "index.html";
    public int Files { get; init; }
    public long Bytes { get; init; }
}

/// <summary>
/// An API token (the agent / scripts publishing games). Only its SHA-256 is stored; the
/// token itself is shown once, when it is created.
/// </summary>
public sealed record StoredApiToken(string Hash, uint UserId, string Name, long CreatedMs, long LastUsedMs);

/// <summary>A game's all-time audience counters (authors excluded), kept on its row.</summary>
public sealed record StoredGameCounters(string GameId, long Views, long Launches, long Plays, long ActiveMs);

/// <summary>
/// One play session of a game (from "Play" to leaving): who (a user, or an anonymous
/// visitor's random id), how long they actually played (attention time, clamped by the
/// server) and whether it counted as a play. Upserted as it goes.
/// </summary>
public sealed record StoredPlaySession(string Id, string GameId, uint ReleaseNo, long StartedMs)
{
    public uint UserId { get; init; }
    public string VisitorId { get; init; } = string.Empty;
    /// <summary>The game's own people (its owner, server admins): kept, but never counted.</summary>
    public bool Own { get; init; }
    public string Device { get; init; } = string.Empty;
    public string Source { get; init; } = string.Empty;
    public long LastSeenMs { get; init; }
    public long ActiveMs { get; init; }
    public bool Counted { get; init; }
    public bool Ended { get; init; }
}

/// <summary>An event a game reported through the jam bridge (levelComplete / logEvent), or a mock-ad event.</summary>
public sealed record StoredPlayEvent(string SessionId, string GameId, bool Own, string Name, string Level, string Params, long Ms);

/// <summary>A page view or a launch of a game (authors' own are not recorded).</summary>
public sealed record StoredGameHit(string GameId, string Kind, uint UserId, string VisitorId, string Source, long Ms);

/// <summary>Additions to one game's (or, with an empty id, the whole portal's) counters of one UTC day.</summary>
public sealed record GameDailyDelta(string GameId, string Day, long Views, long Launches, long Plays, long ActiveMs, long NewPlayers = 0);

/// <summary>One day of a game's counters.</summary>
public sealed record GameDay(string Day, long Views, long Launches, long Plays, long ActiveMs, long Players);

/// <summary>A count by name (an event, a level, a traffic source).</summary>
public sealed record NamedCount(string Name, long Count);

/// <summary>One game's sums over a period (the portal's table).</summary>
public sealed record GamePeriod(string GameId, long Views, long Launches, long Plays, long ActiveMs, long Players);

/// <summary>What the storage knows about a game's audience since a moment (authors excluded).</summary>
public sealed record GameStatsData(
    IReadOnlyList<GameDay> Days,
    IReadOnlyList<long> SessionActiveMs,
    long Players,
    long ReturningPlayers,
    IReadOnlyList<NamedCount> Events,
    IReadOnlyList<NamedCount> Levels,
    IReadOnlyList<NamedCount> Sources)
{
    /// <summary>For the whole portal (an empty game id): every game's sums over the period.</summary>
    public IReadOnlyList<GamePeriod> Games { get; init; } = [];
}

/// <summary>
/// A game's leaderboard: created by its first score (the jam / Yandex shape); title, order
/// and score format are set by the game's people afterwards.
/// </summary>
public sealed record StoredLeaderboard(long Id, string GameId, string Name, long CreatedMs)
{
    public string Title { get; init; } = string.Empty;
    /// <summary>Lower is better (times, fewest moves).</summary>
    public bool InvertSortOrder { get; init; }
    /// <summary><c>numeric</c> or <c>time</c> (milliseconds).</summary>
    public string ScoreType { get; init; } = "numeric";
    public int DecimalOffset { get; init; }
}

/// <summary>One player's best on a board (one row per board × player).</summary>
public sealed record StoredLeaderboardEntry(long BoardId, uint UserId, long Score)
{
    /// <summary>The game's string for the best score (≤ 1024 chars).</summary>
    public string ExtraData { get; init; } = string.Empty;
    public int Submissions { get; init; }
    /// <summary>Set by the game's own people (its owner, server admins) — shown, flagged.</summary>
    public bool Own { get; init; }
    public long CreatedMs { get; init; }
    public long UpdatedMs { get; init; }
}

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
    public IReadOnlyList<StoredGame> Games { get; init; } = [];
    public IReadOnlyList<StoredGameRelease> GameReleases { get; init; } = [];
    public IReadOnlyList<StoredApiToken> ApiTokens { get; init; } = [];
    public IReadOnlyList<StoredGameCounters> GameCounters { get; init; } = [];
    public IReadOnlyList<StoredLeaderboard> Leaderboards { get; init; } = [];
    public IReadOnlyList<StoredLeaderboardEntry> LeaderboardEntries { get; init; } = [];
    public IReadOnlyList<StoredGameMedia> GameMedia { get; init; } = [];
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

    /// <summary>Removes a created channel: its settings, members and chat history.</summary>
    void DeleteChannel(string roomId);

    /// <summary>Stores a server-wide setting (see <see cref="StorageSnapshot.Meta"/>).</summary>
    void SaveMeta(string key, string value);

    /// <summary>Stores a push subscription (replacing the one with the same endpoint).</summary>
    void SavePushSubscription(StoredPushSubscription subscription);

    void DeletePushSubscription(string endpoint);

    /// <summary>Stores a game (replacing the previous version of it).</summary>
    void SaveGame(StoredGame game);

    /// <summary>Stores a release (replacing one with the same game and number).</summary>
    void SaveGameRelease(StoredGameRelease release);

    void SaveApiToken(StoredApiToken token);

    void SaveGameMedia(StoredGameMedia media);
    void DeleteGameMedia(string mediaId);

    // ---- leaderboards ----

    void SaveLeaderboard(StoredLeaderboard board);
    /// <summary>Removes the board and its entries.</summary>
    void DeleteLeaderboard(long boardId);
    void SaveLeaderboardEntry(StoredLeaderboardEntry entry);
    /// <summary>Removes every entry of the board (a reset), keeping the board.</summary>
    void DeleteLeaderboardEntries(long boardId);

    // ---- games analytics (write-behind like everything else) ----

    void SaveGameCounters(StoredGameCounters counters);
    void SavePlaySession(StoredPlaySession session);
    void AppendPlayEvents(IReadOnlyList<StoredPlayEvent> events);
    void AppendGameHit(StoredGameHit hit);
    void AddGameDaily(GameDailyDelta delta);

    /// <summary>
    /// A game's audience since <paramref name="sinceMs"/> (an empty id = the whole portal).
    /// The callback runs on the storage thread (never inline).
    /// </summary>
    void QueryGameStats(string gameId, long sinceMs, Action<GameStatsData> onResult);

    void DeleteApiToken(string hash);

    /// <summary>Removes the user with its keys, avatar, channel standings, push subscriptions and API tokens.</summary>
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
    public void DeleteChannel(string roomId) { }
    public void SaveUser(StoredUser user) { }
    public void DeleteUser(uint userId) => _avatars.TryRemove(userId, out _);
    public void SaveUserKey(StoredUserKey key) { }
    public void DeleteUserKey(string keyHash) { }
    public void SaveMeta(string key, string value) { }
    public void SavePushSubscription(StoredPushSubscription subscription) { }
    public void DeletePushSubscription(string endpoint) { }
    public void SaveGame(StoredGame game) { }
    public void SaveGameRelease(StoredGameRelease release) { }
    public void SaveApiToken(StoredApiToken token) { }
    public void DeleteApiToken(string hash) { }
    public void SaveGameMedia(StoredGameMedia media) { }
    public void DeleteGameMedia(string mediaId) { }
    public void SaveLeaderboard(StoredLeaderboard board) { }
    public void DeleteLeaderboard(long boardId) { }
    public void SaveLeaderboardEntry(StoredLeaderboardEntry entry) { }
    public void DeleteLeaderboardEntries(long boardId) { }
    public void SaveGameCounters(StoredGameCounters counters) { }
    public void SavePlaySession(StoredPlaySession session) { }
    public void AppendPlayEvents(IReadOnlyList<StoredPlayEvent> events) { }
    public void AppendGameHit(StoredGameHit hit) { }
    public void AddGameDaily(GameDailyDelta delta) { }

    public void QueryGameStats(string gameId, long sinceMs, Action<GameStatsData> onResult)
        => ThreadPool.QueueUserWorkItem(_ => onResult(new GameStatsData([], [], 0, 0, [], [], [])));

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

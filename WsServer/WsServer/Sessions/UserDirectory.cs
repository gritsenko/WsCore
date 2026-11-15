using System.Security.Cryptography;
using System.Text;
using Game.ServerLogic.Presence.Events;
using WsServer.Persistence;

namespace WsServer.Sessions;

/// <summary>
/// A known user: the stable identity behind any number of connections (reconnects, a
/// second tab). Unlike a <see cref="ClientSession"/> it outlives its connections — that
/// is what lets the member list show someone as offline instead of forgetting them.
/// </summary>
public sealed class UserAccount(uint id, string keyHash, string name, long lastSeenMs)
{
    public uint Id { get; } = id;
    public string KeyHash { get; } = keyHash;
    public string Name { get; set; } = name;
    public long LastSeenMs { get; set; } = lastSeenMs;

    /// <summary>Live connections of this user (empty = offline).</summary>
    public List<ClientSession> Sessions { get; } = new();

    // What was last announced to clients, to announce only real changes.
    public byte PublishedStatus { get; set; } = PresenceStatus.Offline;
    public string? PublishedRoomId { get; set; }
    public string PublishedName { get; set; } = name;

    public bool IsOnline => Sessions.Count > 0;

    public byte Status
    {
        get
        {
            if (Sessions.Count == 0)
                return PresenceStatus.Offline;
            foreach (var session in Sessions)
            {
                if (!session.IsAway)
                    return PresenceStatus.Online; // active in any tab = online
            }
            return PresenceStatus.Away;
        }
    }
}

/// <summary>
/// Every user the server knows, loaded from storage at startup and written back
/// (write-behind) on change. Tick thread only.
/// </summary>
public sealed class UserDirectory
{
    private readonly IChatStorage _storage;
    private readonly int _maxUsers;
    private readonly Dictionary<string, UserAccount> _byKeyHash = new();
    private uint _nextId;

    public UserDirectory(IChatStorage storage, StorageSnapshot snapshot, GameServerOptions options)
    {
        _storage = storage;
        _maxUsers = Math.Max(1, options.MaxKnownUsers);
        _nextId = Math.Max(1, snapshot.NextUserId);
        foreach (var u in snapshot.Users)
            _byKeyHash[u.KeyHash] = new UserAccount(u.Id, u.KeyHash, u.Name, u.LastSeenMs);
    }

    public IReadOnlyCollection<UserAccount> Users => _byKeyHash.Values;

    /// <summary>
    /// A user key must look like a random token: 16–64 URL-safe characters. Anything else
    /// is refused (the connection simply stays anonymous).
    /// </summary>
    public static bool IsValidKey(string key)
    {
        if (key.Length is < 16 or > 64)
            return false;
        foreach (var ch in key)
        {
            if (!char.IsAsciiLetterOrDigit(ch) && ch != '-' && ch != '_')
                return false;
        }
        return true;
    }

    /// <summary>The user owning <paramref name="key"/>, created on first sight.</summary>
    public UserAccount GetOrCreate(string key, string name)
    {
        // Only the hash is kept (in memory and on disk): the key is a bearer secret.
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key)));
        if (_byKeyHash.TryGetValue(hash, out var existing))
            return existing;

        if (_byKeyHash.Count >= _maxUsers)
            EvictLongestOffline();

        var user = new UserAccount(_nextId++, hash, name, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        _byKeyHash[hash] = user;
        Save(user);
        return user;
    }

    public void Save(UserAccount user)
        => _storage.SaveUser(new StoredUser(user.Id, user.KeyHash, user.Name, user.LastSeenMs));

    // Bounds memory against a client minting fresh keys forever.
    private void EvictLongestOffline()
    {
        UserAccount? victim = null;
        foreach (var user in _byKeyHash.Values)
        {
            if (!user.IsOnline && (victim == null || user.LastSeenMs < victim.LastSeenMs))
                victim = user;
        }
        if (victim == null)
            return; // everyone is online — let it grow
        _byKeyHash.Remove(victim.KeyHash);
        _storage.DeleteUser(victim.Id);
    }
}

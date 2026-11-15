using System.Security.Cryptography;
using System.Text;
using Game.ServerLogic.Presence.Events;
using WsServer.Persistence;

namespace WsServer.Sessions;

/// <summary>
/// A known user: the stable identity behind any number of connections (reconnects, a
/// second tab). Unlike a <see cref="ClientSession"/> it outlives its connections — that
/// is what lets the member list show someone as offline instead of forgetting them.
///
/// A user starts as a guest, reachable only through the random key one browser keeps.
/// Claiming it (a login + password) turns it into an account that can be entered from
/// other devices; each device then holds its own key (<see cref="KeyHashes"/>).
/// </summary>
public sealed class UserAccount(uint id, string name, long lastSeenMs)
{
    public uint Id { get; } = id;
    public string Name { get; set; } = name;
    public long LastSeenMs { get; set; } = lastSeenMs;

    /// <summary>Hashes of the keys that identify as this user (one per browser / device).</summary>
    public HashSet<string> KeyHashes { get; } = new();

    /// <summary>Lower-cased login of a claimed account; null for a guest.</summary>
    public string? Login { get; set; }
    public string? PasswordHash { get; set; }
    public bool IsClaimed => Login != null;

    public string About { get; set; } = string.Empty;
    /// <summary>0 = no avatar; otherwise a value that changes with the image.</summary>
    public uint AvatarVersion { get; set; }

    /// <summary>Live connections of this user (empty = offline).</summary>
    public List<ClientSession> Sessions { get; } = new();

    // What was last announced to clients, to announce only real changes.
    public byte PublishedStatus { get; set; } = PresenceStatus.Offline;
    public string? PublishedRoomId { get; set; }
    public string PublishedName { get; set; } = name;
    public string PublishedAbout { get; set; } = string.Empty;
    public uint PublishedAvatarVersion { get; set; }

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
    public const int MinLoginLength = 3;
    public const int MaxLoginLength = 32;
    public const int MinPasswordLength = 8;
    public const int MaxPasswordLength = 128;

    private readonly IChatStorage _storage;
    private readonly int _maxUsers;
    private readonly Dictionary<uint, UserAccount> _byId = new();
    private readonly Dictionary<string, UserAccount> _byKeyHash = new();
    private readonly Dictionary<string, UserAccount> _byLogin = new();
    private uint _nextId;

    public UserDirectory(IChatStorage storage, StorageSnapshot snapshot, GameServerOptions options)
    {
        _storage = storage;
        _maxUsers = Math.Max(1, options.MaxKnownUsers);
        _nextId = Math.Max(1, snapshot.NextUserId);
        foreach (var u in snapshot.Users)
        {
            var user = new UserAccount(u.Id, u.Name, u.LastSeenMs)
            {
                Login = u.Login,
                PasswordHash = u.PasswordHash,
                About = u.About,
                AvatarVersion = u.AvatarVersion,
                PublishedAbout = u.About,
                PublishedAvatarVersion = u.AvatarVersion,
            };
            _byId[user.Id] = user;
            if (user.Login != null)
                _byLogin[user.Login] = user;
        }
        foreach (var key in snapshot.UserKeys)
        {
            if (!_byId.TryGetValue(key.UserId, out var user))
                continue; // the user was pruned
            user.KeyHashes.Add(key.KeyHash);
            _byKeyHash[key.KeyHash] = user;
        }
    }

    public IReadOnlyCollection<UserAccount> Users => _byId.Values;

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

    /// <summary>
    /// The canonical (lower-cased) form of a login, or null if it is not one: 3–32 of
    /// latin letters, digits, '.', '_' and '-'. Logins are case-insensitive.
    /// </summary>
    public static string? NormalizeLogin(string login)
    {
        login = login.Trim();
        if (login.Length is < MinLoginLength or > MaxLoginLength)
            return null;
        foreach (var ch in login)
        {
            if (!char.IsAsciiLetterOrDigit(ch) && ch != '.' && ch != '_' && ch != '-')
                return null;
        }
        return login.ToLowerInvariant();
    }

    public static bool IsValidPassword(string password)
        => password.Length is >= MinPasswordLength and <= MaxPasswordLength;

    // Only the hash is kept (in memory and on disk): the key is a bearer secret.
    public static string HashKey(string key)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key)));

    public UserAccount? FindByKeyHash(string keyHash) => _byKeyHash.GetValueOrDefault(keyHash);

    public UserAccount? FindByLogin(string normalizedLogin) => _byLogin.GetValueOrDefault(normalizedLogin);

    /// <summary>A new guest user owning <paramref name="keyHash"/>.</summary>
    public UserAccount Create(string keyHash, string name)
    {
        if (_byId.Count >= _maxUsers)
            EvictLongestOffline();

        var user = new UserAccount(_nextId++, name, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        _byId[user.Id] = user;
        Save(user);
        BindKey(keyHash, user);
        return user;
    }

    /// <summary>
    /// Makes <paramref name="keyHash"/> a key of <paramref name="user"/> (a device logged
    /// in, or identified again). A key identifies one user: if it was someone else's,
    /// they lose it.
    /// </summary>
    public void BindKey(string keyHash, UserAccount user)
    {
        if (_byKeyHash.TryGetValue(keyHash, out var previous) && previous != user)
            previous.KeyHashes.Remove(keyHash);
        // Written even if nothing changed in memory: storage may have dropped the key of
        // a guest who stayed away past the retention period while the server kept running.
        user.KeyHashes.Add(keyHash);
        _byKeyHash[keyHash] = user;
        _storage.SaveUserKey(new StoredUserKey(keyHash, user.Id));
    }

    /// <summary>The key stops identifying anyone (a device logged out).</summary>
    public void UnbindKey(string keyHash)
    {
        if (!_byKeyHash.Remove(keyHash, out var user))
            return;
        user.KeyHashes.Remove(keyHash);
        _storage.DeleteUserKey(keyHash);
    }

    /// <summary>Claims the user. False if the login is taken (or the user is claimed already).</summary>
    public bool SetCredentials(UserAccount user, string normalizedLogin, string passwordHash)
    {
        if (user.IsClaimed || _byLogin.ContainsKey(normalizedLogin))
            return false;
        user.Login = normalizedLogin;
        user.PasswordHash = passwordHash;
        _byLogin[normalizedLogin] = user;
        Save(user);
        return true;
    }

    public void Save(UserAccount user)
        => _storage.SaveUser(new StoredUser(user.Id, user.Name, user.LastSeenMs)
        {
            Login = user.Login,
            PasswordHash = user.PasswordHash,
            About = user.About,
            AvatarVersion = user.AvatarVersion,
        });

    public void SaveAvatar(UserAccount user, StoredAvatar? avatar) => _storage.SaveAvatar(user.Id, avatar);

    // Bounds memory against a client minting fresh keys forever. Claimed accounts are
    // never evicted: they belong to someone who can come back with a password.
    private void EvictLongestOffline()
    {
        UserAccount? victim = null;
        foreach (var user in _byId.Values)
        {
            if (!user.IsOnline && !user.IsClaimed && (victim == null || user.LastSeenMs < victim.LastSeenMs))
                victim = user;
        }
        if (victim == null)
            return; // everyone is online or claimed — let it grow
        _byId.Remove(victim.Id);
        foreach (var keyHash in victim.KeyHashes)
            _byKeyHash.Remove(keyHash);
        _storage.DeleteUser(victim.Id);
    }
}

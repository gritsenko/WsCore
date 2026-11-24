using System.Security.Cryptography;
using System.Text;
using WsServer.Persistence;

namespace WsServer.Games;

/// <summary>
/// API tokens: how an agent or a script acts as a user over HTTP (publishing games).
/// A token is <c>tox_</c> + 32 random bytes (base64url), shown once when it is made; only
/// its SHA-256 is kept, like the user keys. A token unused for
/// <see cref="GameServerOptions.ApiTokenIdleDays"/> stops working.
///
/// Threading: tokens are made and revoked on the tick thread and checked on HTTP threads,
/// so the table is behind a lock (it is tiny and rarely touched).
/// </summary>
public sealed class ApiTokens
{
    public const string Prefix = "tox_";
    public const int MaxNameLength = 40;

    // A use is written back at most this often — "last used" is for the token list, not an audit log.
    private const long LastUsedWriteIntervalMs = 60 * 60 * 1000;

    private readonly IChatStorage _storage;
    private readonly GameServerOptions _options;
    private readonly object _lock = new();
    private readonly Dictionary<string, StoredApiToken> _byHash = new();

    /// <summary>Replaceable in tests (idle expiry).</summary>
    public Func<long> NowMs { get; set; } = () => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    public ApiTokens(IChatStorage storage, StorageSnapshot snapshot, GameServerOptions options)
    {
        _storage = storage;
        _options = options;
        foreach (var token in snapshot.ApiTokens)
            _byHash[token.Hash] = token;
    }

    /// <summary>The public id of a token (its list entry / revoke handle): a prefix of its hash.</summary>
    public static string IdOf(string hash) => hash[..12];

    public static string Hash(string token)
        => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    /// <summary>
    /// Makes a token for the user. Returns the token itself (never stored) and its record,
    /// or null when the user already has <see cref="GameServerOptions.ApiTokensPerUser"/>.
    /// </summary>
    public (string Token, StoredApiToken Record)? Create(uint userId, string name)
    {
        name = InputSanitizer.Clean(name ?? string.Empty, MaxNameLength);
        var token = Prefix + Base64Url(RandomNumberGenerator.GetBytes(32));
        var record = new StoredApiToken(Hash(token), userId, name, NowMs(), 0);
        lock (_lock)
        {
            if (_byHash.Values.Count(t => t.UserId == userId) >= _options.ApiTokensPerUser)
                return null;
            _byHash[record.Hash] = record;
        }
        _storage.SaveApiToken(record);
        return (token, record);
    }

    /// <summary>The user's tokens, newest first.</summary>
    public IReadOnlyList<StoredApiToken> ListFor(uint userId)
    {
        lock (_lock)
            return _byHash.Values.Where(t => t.UserId == userId).OrderByDescending(t => t.CreatedMs).ToList();
    }

    /// <summary>Revokes the user's token with the given public id. False if there is none.</summary>
    public bool Revoke(uint userId, string id)
    {
        StoredApiToken? found;
        lock (_lock)
        {
            found = _byHash.Values.FirstOrDefault(t => t.UserId == userId && IdOf(t.Hash) == id);
            if (found == null)
                return false;
            _byHash.Remove(found.Hash);
        }
        _storage.DeleteApiToken(found.Hash);
        return true;
    }

    /// <summary>Drops every token of the user (they stopped being allowed to publish, or are gone).</summary>
    public void RevokeAll(uint userId)
    {
        List<StoredApiToken> removed;
        lock (_lock)
        {
            removed = _byHash.Values.Where(t => t.UserId == userId).ToList();
            foreach (var token in removed)
                _byHash.Remove(token.Hash);
        }
        foreach (var token in removed)
            _storage.DeleteApiToken(token.Hash);
    }

    /// <summary>
    /// The user a presented token belongs to, or null (unknown, malformed or idle too
    /// long). Any thread. A successful check counts as a use.
    /// </summary>
    public uint? Authenticate(string? token)
    {
        if (string.IsNullOrEmpty(token) || !token.StartsWith(Prefix, StringComparison.Ordinal) || token.Length > 100)
            return null;
        var hash = Hash(token);
        var now = NowMs();
        StoredApiToken? write = null;
        uint userId;
        lock (_lock)
        {
            if (!_byHash.TryGetValue(hash, out var record))
                return null;
            var lastActive = Math.Max(record.CreatedMs, record.LastUsedMs);
            if (_options.ApiTokenIdleDays > 0 && now - lastActive > _options.ApiTokenIdleDays * 86_400_000)
                return null;
            userId = record.UserId;
            if (now - record.LastUsedMs >= LastUsedWriteIntervalMs)
            {
                write = record with { LastUsedMs = now };
                _byHash[hash] = write;
            }
        }
        if (write != null)
            _storage.SaveApiToken(write);
        return userId;
    }

    private static string Base64Url(byte[] bytes)
        => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}

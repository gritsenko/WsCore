using System.Diagnostics;
using System.Text.Json;
using System.Threading.Channels;
using Game.ServerLogic.Presence.Events;
using WsServer.Moderation;
using WsServer.Persistence;
using WsServer.Sessions;

namespace WsServer.Push;

/// <summary>One browser's push subscription, owned by a user (and the device key it came with).</summary>
public sealed record PushSubscription(string Endpoint, uint UserId, string? KeyHash, byte[] P256dh, byte[] Auth);

/// <summary>What a push service answered.</summary>
public enum PushSendResult
{
    Delivered,
    /// <summary>The subscription is dead (404 / 410): forget it.</summary>
    Gone,
    /// <summary>Anything else (rate limited, payload refused, network error): drop this message.</summary>
    Failed,
}

/// <summary>Delivers one encrypted message to one subscription. Replaced in tests.</summary>
public interface IPushSender
{
    Task<PushSendResult> SendAsync(PushSubscription subscription, byte[] payload, VapidKeys keys, CancellationToken ct);
}

/// <summary>
/// Web Push for chat: keeps the users' browser subscriptions and notifies a user about a
/// message in a room while they are not looking — i.e. when the user is <b>offline</b>
/// (no connection) or <b>away</b> (every connection idle). A user who is online is told
/// by the open page itself (the tab title counter and a page-shown notification), so the
/// server never pushes to them: one source per message, no duplicates.
///
/// Threading: <see cref="Subscribe"/> / <see cref="Unsubscribe"/> / <see cref="NotifyChat"/>
/// run on the tick thread and never block — encryption and the HTTP requests happen on a
/// few background workers fed by a bounded channel (overflow drops notifications, never
/// chat). Workers remove subscriptions the push service reports gone, hence the lock.
///
/// Bounds: a user has at most <see cref="GameServerOptions.PushMaxSubscriptionsPerUser"/>
/// subscriptions (oldest replaced), and gets at most one push per room every
/// <see cref="GameServerOptions.PushMinIntervalSeconds"/> — later messages of a burst
/// are skipped (the notification for the room shows "and more" on the device anyway).
/// </summary>
public sealed class PushService : IDisposable
{
    private const string VapidPublicMeta = "vapid_public";
    private const string VapidPrivateMeta = "vapid_private";
    private const int MaxEndpointLength = 2048;
    private const int MaxBodyChars = 200;
    private const int Workers = 4;

    private readonly IChatStorage _storage;
    private readonly UserDirectory _users;
    private readonly ChannelPermissions _permissions;
    private readonly IPushSender _sender;
    private readonly GameServerOptions _options;
    private readonly ILogger<PushService> _logger;

    private readonly object _lock = new();
    private readonly Dictionary<string, PushSubscription> _byEndpoint = new();
    // Insertion-ordered per user, so the oldest is the one replaced at the cap.
    private readonly Dictionary<uint, List<PushSubscription>> _byUser = new();
    // (user, room) → Stopwatch timestamp before which no further push goes out. Tick thread.
    private readonly Dictionary<(uint, string), long> _quietUntil = new();

    private readonly Channel<(PushSubscription Subscription, byte[] Payload)> _queue;
    private readonly CancellationTokenSource _stop = new();
    private readonly Task[] _workers;
    private int _pending;

    /// <summary>Null when push is disabled (<see cref="GameServerOptions.PushEnabled"/>).</summary>
    public VapidKeys? Keys { get; }

    public bool Enabled => Keys != null;

    /// <summary>Messages queued or being sent (tests wait for it to reach 0).</summary>
    public int Pending => Volatile.Read(ref _pending);

    public PushService(
        IChatStorage storage,
        StorageSnapshot snapshot,
        UserDirectory users,
        ChannelPermissions permissions,
        IPushSender sender,
        GameServerOptions options,
        ILogger<PushService> logger)
    {
        _storage = storage;
        _users = users;
        _permissions = permissions;
        _sender = sender;
        _options = options;
        _logger = logger;
        _queue = Channel.CreateBounded<(PushSubscription, byte[])>(new BoundedChannelOptions(4096)
        {
            FullMode = BoundedChannelFullMode.DropWrite,
            SingleWriter = true,
        });

        if (options.PushEnabled)
        {
            Keys = LoadKeys(snapshot);
            foreach (var s in snapshot.PushSubscriptions)
            {
                try
                {
                    AddLocked(new PushSubscription(s.Endpoint, s.UserId, s.KeyHash,
                        Base64Url.Decode(s.P256dh), Base64Url.Decode(s.Auth)));
                }
                catch (FormatException)
                {
                    storage.DeletePushSubscription(s.Endpoint);
                }
            }
        }

        _workers = Enumerable.Range(0, Workers).Select(_ => Task.Run(WorkAsync)).ToArray();
    }

    // Configured keys win; otherwise the ones generated on an earlier run (stored, so
    // existing browser subscriptions stay valid); otherwise new ones.
    private VapidKeys LoadKeys(StorageSnapshot snapshot)
    {
        if (!string.IsNullOrEmpty(_options.PushVapidPublicKey) || !string.IsNullOrEmpty(_options.PushVapidPrivateKey))
        {
            var configured = VapidKeys.TryParse(_options.PushVapidPublicKey, _options.PushVapidPrivateKey);
            if (configured != null)
                return configured;
            _logger.LogError("Push: the configured VAPID key pair is invalid; using a stored / generated one");
        }

        var stored = VapidKeys.TryParse(
            snapshot.Meta.GetValueOrDefault(VapidPublicMeta), snapshot.Meta.GetValueOrDefault(VapidPrivateMeta));
        if (stored != null)
            return stored;

        var keys = VapidKeys.Generate();
        _storage.SaveMeta(VapidPublicMeta, keys.PublicKey);
        _storage.SaveMeta(VapidPrivateMeta, keys.PrivateKey);
        if (_storage.IsPersistent)
            _logger.LogInformation("Push: generated a new VAPID key pair");
        return keys;
    }

    // ---- subscriptions (tick thread) ---------------------------------------------------

    public IReadOnlyList<PushSubscription> SubscriptionsOf(uint userId)
    {
        lock (_lock)
            return _byUser.TryGetValue(userId, out var list) ? list.ToArray() : [];
    }

    /// <summary>
    /// Stores (or re-binds to <paramref name="user"/>) a subscription. Malformed input is
    /// ignored: the endpoint must be an https URL, the key a P-256 point, the secret 16 bytes.
    /// </summary>
    public bool Subscribe(UserAccount user, string? keyHash, string endpoint, string p256dh, string auth)
    {
        if (!Enabled || !IsValidEndpoint(endpoint))
            return false;
        byte[] key, secret;
        try
        {
            key = Base64Url.Decode(p256dh);
            secret = Base64Url.Decode(auth);
            WebPushCrypto.DecodePoint(key);
        }
        catch (FormatException)
        {
            return false;
        }
        if (secret.Length != 16)
            return false;

        var subscription = new PushSubscription(endpoint, user.Id, keyHash, key, secret);
        PushSubscription? evicted = null;
        lock (_lock)
        {
            if (_byEndpoint.TryGetValue(endpoint, out var existing)
                && existing.UserId == user.Id && existing.KeyHash == keyHash
                && existing.P256dh.AsSpan().SequenceEqual(key) && existing.Auth.AsSpan().SequenceEqual(secret))
                return true; // unchanged: the usual re-send on connect
            RemoveLocked(endpoint);
            AddLocked(subscription);
            var list = _byUser[user.Id];
            if (list.Count > Math.Max(1, _options.PushMaxSubscriptionsPerUser))
            {
                evicted = list[0];
                RemoveLocked(evicted.Endpoint);
            }
        }

        if (evicted != null)
            _storage.DeletePushSubscription(evicted.Endpoint);
        _storage.SavePushSubscription(new StoredPushSubscription(
            endpoint, user.Id, keyHash, Base64Url.Encode(key), Base64Url.Encode(secret)));
        _logger.LogInformation("Push: user {UserId} subscribed a device", user.Id);
        return true;
    }

    /// <summary>Forgets the subscription if it is the user's.</summary>
    public void Unsubscribe(UserAccount user, string endpoint)
    {
        lock (_lock)
        {
            if (!_byEndpoint.TryGetValue(endpoint, out var existing) || existing.UserId != user.Id)
                return;
            RemoveLocked(endpoint);
        }
        _storage.DeletePushSubscription(endpoint);
    }

    /// <summary>A device key was logged out: its subscriptions no longer belong to that user.</summary>
    public void RemoveDevice(string keyHash)
    {
        List<string> removed;
        lock (_lock)
        {
            removed = _byEndpoint.Values.Where(s => s.KeyHash == keyHash).Select(s => s.Endpoint).ToList();
            foreach (var endpoint in removed)
                RemoveLocked(endpoint);
        }
        foreach (var endpoint in removed)
            _storage.DeletePushSubscription(endpoint);
    }

    private static bool IsValidEndpoint(string endpoint) =>
        endpoint.Length is > 0 and <= MaxEndpointLength
        && Uri.TryCreate(endpoint, UriKind.Absolute, out var uri)
        && uri.Scheme == Uri.UriSchemeHttps;

    private void AddLocked(PushSubscription subscription)
    {
        _byEndpoint[subscription.Endpoint] = subscription;
        if (!_byUser.TryGetValue(subscription.UserId, out var list))
            _byUser[subscription.UserId] = list = new List<PushSubscription>();
        list.Add(subscription);
    }

    private void RemoveLocked(string endpoint)
    {
        if (!_byEndpoint.Remove(endpoint, out var subscription))
            return;
        if (_byUser.TryGetValue(subscription.UserId, out var list))
        {
            list.RemoveAll(s => s.Endpoint == endpoint);
            if (list.Count == 0)
                _byUser.Remove(subscription.UserId);
        }
    }

    // ---- notifying (tick thread) -------------------------------------------------------

    /// <summary>
    /// A chat message was posted: push it to every subscribed user who is not looking
    /// (offline or away), may see the room (not banned) and did not write it.
    /// </summary>
    public void NotifyChat(string roomId, string roomName, uint messageId, uint authorUserId, string authorName,
        string text, long sentAtMs)
    {
        if (!Enabled)
            return;

        List<(uint UserId, PushSubscription[] Subscriptions)> targets;
        lock (_lock)
        {
            if (_byUser.Count == 0)
                return;
            targets = _byUser.Select(p => (p.Key, p.Value.ToArray())).ToList();
        }

        var author = authorUserId != 0 ? _users.FindById(authorUserId) : null;
        byte[]? payload = null;
        var now = Stopwatch.GetTimestamp();
        foreach (var (userId, subscriptions) in targets)
        {
            if (userId == authorUserId)
                continue;
            var user = _users.FindById(userId);
            if (user == null)
            {
                // The user was forgotten (retention): so are their devices.
                foreach (var s in subscriptions)
                    Forget(s);
                continue;
            }
            if (user.Status == PresenceStatus.Online || _permissions.IsBanned(user, roomId))
                continue;

            var quietKey = (userId, roomId);
            if (_quietUntil.TryGetValue(quietKey, out var until) && now < until)
                continue;
            _quietUntil[quietKey] = now + (long)(_options.PushMinIntervalSeconds * Stopwatch.Frequency);

            payload ??= BuildPayload(roomId, roomName, messageId, author, authorName, text, sentAtMs);
            foreach (var s in subscriptions)
                Enqueue(s, payload);
        }

        // Keep the throttle table from growing with stale entries.
        if (_quietUntil.Count > 4096)
        {
            foreach (var key in _quietUntil.Where(p => p.Value <= now).Select(p => p.Key).ToList())
                _quietUntil.Remove(key);
        }
    }

    private static byte[] BuildPayload(string roomId, string roomName, uint messageId, UserAccount? author,
        string authorName, string text, long sentAtMs)
    {
        var body = text.Length > MaxBodyChars ? text[..MaxBodyChars] + "…" : text;
        // Read by the service worker (public/sw.js). The avatar path is relative to the
        // server's origin (the page's in production).
        return JsonSerializer.SerializeToUtf8Bytes(new
        {
            type = "chat",
            roomId,
            roomName,
            messageId,
            author = authorName,
            avatar = author is { AvatarVersion: > 0 } ? $"/avatars/{author.Id}?v={author.AvatarVersion}" : null,
            body,
            sentAtMs,
        });
    }

    private void Enqueue(PushSubscription subscription, byte[] payload)
    {
        Interlocked.Increment(ref _pending);
        if (!_queue.Writer.TryWrite((subscription, payload)))
        {
            Interlocked.Decrement(ref _pending);
            _logger.LogWarning("Push: queue full, notification dropped");
        }
    }

    private void Forget(PushSubscription subscription)
    {
        lock (_lock)
        {
            // Only if it was not re-subscribed meanwhile (same endpoint, new keys / user).
            if (!_byEndpoint.TryGetValue(subscription.Endpoint, out var current) || !ReferenceEquals(current, subscription))
                return;
            RemoveLocked(subscription.Endpoint);
        }
        _storage.DeletePushSubscription(subscription.Endpoint);
    }

    // ---- workers -----------------------------------------------------------------------

    private async Task WorkAsync()
    {
        try
        {
            await foreach (var (subscription, payload) in _queue.Reader.ReadAllAsync(_stop.Token))
            {
                try
                {
                    var result = await _sender.SendAsync(subscription, payload, Keys!, _stop.Token);
                    if (result == PushSendResult.Gone)
                    {
                        Forget(subscription);
                        _logger.LogInformation("Push: a subscription of user {UserId} expired", subscription.UserId);
                    }
                }
                catch (OperationCanceledException) when (_stop.IsCancellationRequested)
                {
                    return;
                }
                catch (Exception e)
                {
                    _logger.LogWarning(e, "Push: delivery failed");
                }
                finally
                {
                    Interlocked.Decrement(ref _pending);
                }
            }
        }
        catch (OperationCanceledException)
        {
        }
    }

    public void Dispose()
    {
        _queue.Writer.TryComplete();
        _stop.Cancel();
        try { Task.WaitAll(_workers, TimeSpan.FromSeconds(2)); }
        catch (AggregateException) { }
        _stop.Dispose();
    }
}

/// <summary>Sends pushes over HTTP: encrypts (RFC 8291), signs (VAPID) and POSTs.</summary>
public sealed class WebPushSender(HttpClient http, GameServerOptions options, ILogger<WebPushSender> logger) : IPushSender
{
    public async Task<PushSendResult> SendAsync(PushSubscription subscription, byte[] payload, VapidKeys keys,
        CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, subscription.Endpoint)
        {
            Content = new ByteArrayContent(WebPushCrypto.Encrypt(payload, subscription.P256dh, subscription.Auth)),
        };
        request.Content.Headers.ContentType = new("application/octet-stream");
        request.Content.Headers.ContentEncoding.Add("aes128gcm");
        request.Headers.TryAddWithoutValidation("TTL", ((int)options.PushTtlSeconds).ToString());
        request.Headers.TryAddWithoutValidation("Urgency", "normal");
        request.Headers.TryAddWithoutValidation("Authorization",
            keys.AuthorizationHeader(subscription.Endpoint, options.PushSubject, DateTimeOffset.UtcNow.AddHours(12)));

        using var response = await http.SendAsync(request, ct);
        var status = (int)response.StatusCode;
        if (response.IsSuccessStatusCode)
            return PushSendResult.Delivered;
        if (status is 404 or 410)
            return PushSendResult.Gone;
        logger.LogWarning("Push: the push service answered {Status} for user {UserId}", status, subscription.UserId);
        return PushSendResult.Failed;
    }
}

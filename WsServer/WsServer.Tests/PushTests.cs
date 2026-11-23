using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Game.ServerLogic.Account.Requests;
using Game.ServerLogic.Chat.Requests;
using Game.ServerLogic.Moderation.Requests;
using Game.ServerLogic.Presence.Events;
using Game.ServerLogic.Presence.Requests;
using Game.ServerLogic.Push.Events;
using Game.ServerLogic.Push.Requests;
using Microsoft.Extensions.DependencyInjection;
using WsServer.Push;
using static WsServer.Tests.TestSupport;

namespace WsServer.Tests;

/// <summary>
/// Web Push: the RFC 8291 encryption and the VAPID signature, and who gets notified about
/// a chat message (offline / away users, never the author, the online or the banned).
/// </summary>
public class PushTests
{
    private const string AnnKey = "ann-key-0123456789abcdef";
    private const string BobKey = "bob-key-0123456789abcdef";

    // ---- crypto ------------------------------------------------------------------------

    [Fact]
    public void Encrypt_MatchesTheRfc8291Example()
    {
        // RFC 8291, Section 5 / Appendix A.
        var plaintext = "When I grow up, I want to be a watermelon"u8.ToArray();
        var asPublic = Base64Url.Decode("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8");
        var asPrivate = Base64Url.Decode("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw");
        var uaPublic = Base64Url.Decode("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4");
        var auth = Base64Url.Decode("BTBZMqHH6r4Tts7J_aSIgg");
        var salt = Base64Url.Decode("DGv6ra1nlYgDCS1FRnbzlw");
        using var ephemeral = ECDiffieHellman.Create(new ECParameters
        {
            Curve = ECCurve.NamedCurves.nistP256,
            Q = WebPushCrypto.DecodePoint(asPublic),
            D = asPrivate,
        });

        var body = WebPushCrypto.Encrypt(plaintext, uaPublic, auth, salt, ephemeral);

        // Header and ciphertext are base64url-encoded separately in the RFC.
        var header = Base64Url.Decode(
            "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml" +
            "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8");
        var ciphertext = Base64Url.Decode(
            "8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ");
        Assert.Equal(86, header.Length);
        var expected = header.Concat(ciphertext).ToArray();
        Assert.Equal(Base64Url.Encode(expected), Base64Url.Encode(body));
    }

    [Fact]
    public void Encrypt_RoundTripsThroughAReceiver()
    {
        using var receiver = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256);
        var uaPublic = WebPushCrypto.EncodePoint(receiver.ExportParameters(false).Q);
        var auth = RandomNumberGenerator.GetBytes(16);
        var payload = Encoding.UTF8.GetBytes("""{"body":"привет"}""");

        var body = WebPushCrypto.Encrypt(payload, uaPublic, auth);

        Assert.Equal(payload, Decrypt(body, receiver, uaPublic, auth));
    }

    [Fact]
    public void VapidHeader_IsAnEs256JwtForThePushServiceOrigin()
    {
        var keys = VapidKeys.Generate();
        var header = keys.AuthorizationHeader("https://fcm.googleapis.com/fcm/send/abc", "mailto:a@b.c",
            DateTimeOffset.FromUnixTimeSeconds(2_000_000_000));

        Assert.StartsWith("vapid t=", header);
        Assert.EndsWith(", k=" + keys.PublicKey, header);
        var jwt = header["vapid t=".Length..header.IndexOf(',')];
        var parts = jwt.Split('.');
        var claims = JsonDocument.Parse(Base64Url.Decode(parts[1])).RootElement;
        Assert.Equal("https://fcm.googleapis.com", claims.GetProperty("aud").GetString());
        Assert.Equal(2_000_000_000, claims.GetProperty("exp").GetInt64());
        Assert.Equal("mailto:a@b.c", claims.GetProperty("sub").GetString());

        using var verifier = ECDsa.Create(new ECParameters
        {
            Curve = ECCurve.NamedCurves.nistP256,
            Q = WebPushCrypto.DecodePoint(Base64Url.Decode(keys.PublicKey)),
        });
        Assert.True(verifier.VerifyData(Encoding.ASCII.GetBytes(parts[0] + "." + parts[1]),
            Base64Url.Decode(parts[2]), HashAlgorithmName.SHA256));

        // The pair survives a round trip through its string form (configuration / database).
        Assert.Equal(keys.PublicKey, VapidKeys.TryParse(keys.PublicKey, keys.PrivateKey)!.PublicKey);
        Assert.Null(VapidKeys.TryParse(keys.PublicKey, VapidKeys.Generate().PrivateKey));
    }

    // ---- who is notified ---------------------------------------------------------------

    private sealed class RecordingSender : IPushSender
    {
        public readonly ConcurrentQueue<(string Endpoint, JsonElement Payload)> Sent = new();
        public readonly HashSet<string> GoneEndpoints = new();

        public Task<PushSendResult> SendAsync(PushSubscription subscription, byte[] payload, VapidKeys keys,
            CancellationToken ct)
        {
            Sent.Enqueue((subscription.Endpoint, JsonDocument.Parse(payload).RootElement.Clone()));
            lock (GoneEndpoints)
                return Task.FromResult(GoneEndpoints.Contains(subscription.Endpoint)
                    ? PushSendResult.Gone
                    : PushSendResult.Delivered);
        }
    }

    private static ServerHarness Harness(RecordingSender sender, Action<GameServerOptions>? configure = null) =>
        new(o =>
        {
            o.PushMinIntervalSeconds = 0;
            o.PushRequestCooldownSeconds = 0;
            o.ModerationRequestCooldownSeconds = 0;
            configure?.Invoke(o);
        }, services => services.AddSingleton<IPushSender>(sender));

    private static PushSubscribeRequest Subscription(string endpoint)
    {
        using var key = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256);
        return new PushSubscribeRequest
        {
            Endpoint = endpoint,
            P256dh = Base64Url.Encode(WebPushCrypto.EncodePoint(key.ExportParameters(false).Q)),
            Auth = Base64Url.Encode(RandomNumberGenerator.GetBytes(16)),
        };
    }

    private static async Task<RecordingConnection> Join(ServerHarness h, string key, string name)
    {
        var conn = await h.Connect();
        await h.Request(conn, new IdentifyRequest { UserKey = key, Name = name });
        return conn;
    }

    private static async Task Delivered(ServerHarness h) =>
        await WaitUntil(() => h.Service<PushService>().Pending == 0);

    [Fact]
    public async Task IdentifiedConnection_GetsTheVapidKey()
    {
        var sender = new RecordingSender();
        await using var h = Harness(sender);
        var ann = await Join(h, AnnKey, "Ann");

        var config = h.Events<PushConfigEvent>(ann).Single();
        Assert.Equal(h.Service<PushService>().Keys!.PublicKey, config.PublicKey);
        Assert.Equal(65, Base64Url.Decode(config.PublicKey).Length);
    }

    [Fact]
    public async Task Disabled_SendsNoKey_AndStoresNothing()
    {
        var sender = new RecordingSender();
        await using var h = Harness(sender, o => o.PushEnabled = false);
        var ann = await Join(h, AnnKey, "Ann");
        await h.Request(ann, Subscription("https://push.example/ann"));

        Assert.Empty(h.Events<PushConfigEvent>(ann));
        Assert.Empty(h.Service<PushService>().SubscriptionsOf(h.Events<PresenceSnapshotEvent>(ann).Single().YourUserId));
    }

    [Fact]
    public async Task OfflineAndAwayUsers_ArePushed_OnlineUsersAndTheAuthorAreNot()
    {
        var sender = new RecordingSender();
        await using var h = Harness(sender);
        var ann = await Join(h, AnnKey, "Ann");
        await h.Request(ann, Subscription("https://push.example/ann"));
        var bob = await Join(h, BobKey, "Bob");
        await h.Request(bob, Subscription("https://push.example/bob"));

        // Both online: nobody is pushed (the open page tells them).
        await h.Request(ann, new ChatMessageRequest { Message = "hi" });
        await Delivered(h);
        Assert.Empty(sender.Sent);

        // Bob away → pushed; Ann is the author → not.
        await h.Request(bob, new SetAwayRequest { Away = true });
        await h.Request(ann, new ChatMessageRequest { Message = "still there?" });
        await Delivered(h);
        var (endpoint, payload) = Assert.Single(sender.Sent);
        Assert.Equal("https://push.example/bob", endpoint);
        Assert.Equal("chat", payload.GetProperty("type").GetString());
        Assert.Equal("lobby", payload.GetProperty("roomId").GetString());
        Assert.Equal("Ann", payload.GetProperty("author").GetString());
        Assert.Equal("still there?", payload.GetProperty("body").GetString());

        // Bob offline → pushed too.
        await h.Disconnect(bob);
        await h.Request(ann, new ChatMessageRequest { Message = "bye" });
        await Delivered(h);
        Assert.Equal(2, sender.Sent.Count);
        Assert.Equal("bye", sender.Sent.Last().Payload.GetProperty("body").GetString());
    }

    [Fact]
    public async Task Bursts_AreThrottledPerUserAndRoom()
    {
        var sender = new RecordingSender();
        await using var h = Harness(sender, o => o.PushMinIntervalSeconds = 60);
        var bob = await Join(h, BobKey, "Bob");
        await h.Request(bob, Subscription("https://push.example/bob"));
        await h.Disconnect(bob);

        var ann = await Join(h, AnnKey, "Ann");
        for (var i = 0; i < 5; i++)
            await h.Request(ann, new ChatMessageRequest { Message = "msg " + i });
        await Delivered(h);

        Assert.Equal("msg 0", Assert.Single(sender.Sent).Payload.GetProperty("body").GetString());
    }

    [Fact]
    public async Task BannedUsers_AreNotPushedAboutThatRoom()
    {
        var sender = new RecordingSender();
        await using var h = Harness(sender, o => o.AdminLogins = ["ann"]);
        var ann = await Join(h, AnnKey, "Ann");
        await h.Request(ann, new ClaimAccountRequest { Login = "ann", Password = "password123" });
        await WaitUntil(() => h.Events<PresenceSnapshotEvent>(ann).Length > 0);
        var bob = await Join(h, BobKey, "Bob");
        var bobId = h.Events<PresenceSnapshotEvent>(bob).Single().YourUserId;
        await h.Request(bob, Subscription("https://push.example/bob"));
        await h.Disconnect(bob);

        await h.Request(ann, new Game.ServerLogic.Rooms.Requests.JoinRoomRequest { RoomId = "voice" });
        await h.Request(ann, new SetChannelRestrictionRequest { RoomId = "voice", UserId = bobId, Banned = true });
        await h.Request(ann, new ChatMessageRequest { Message = "secret" });
        await Delivered(h);
        Assert.Empty(sender.Sent);

        await h.Request(ann, new Game.ServerLogic.Rooms.Requests.JoinRoomRequest { RoomId = "lobby" });
        await h.Request(ann, new ChatMessageRequest { Message = "public" });
        await Delivered(h);
        Assert.Equal("public", Assert.Single(sender.Sent).Payload.GetProperty("body").GetString());
    }

    [Fact]
    public async Task Subscriptions_AreValidated_RebindToTheNewUser_AndExpire()
    {
        var sender = new RecordingSender();
        await using var h = Harness(sender);
        var push = h.Service<PushService>();
        var ann = await Join(h, AnnKey, "Ann");
        var annId = h.Events<PresenceSnapshotEvent>(ann).Single().YourUserId;

        await h.Request(ann, Subscription("http://insecure.example/x"));
        await h.Request(ann, new PushSubscribeRequest { Endpoint = "https://push.example/x", P256dh = "AAAA", Auth = "AAAA" });
        Assert.Empty(push.SubscriptionsOf(annId));

        var device = Subscription("https://push.example/device");
        await h.Request(ann, device);
        await h.Request(ann, device); // the re-send on every connect: still one
        Assert.Single(push.SubscriptionsOf(annId));

        // The same browser now identifies as Bob: the subscription is his.
        var bob = await Join(h, BobKey, "Bob");
        var bobId = h.Events<PresenceSnapshotEvent>(bob).Single().YourUserId;
        await h.Request(bob, device);
        Assert.Empty(push.SubscriptionsOf(annId));
        Assert.Single(push.SubscriptionsOf(bobId));

        // Someone else cannot unsubscribe it; Bob can.
        await h.Request(ann, new PushUnsubscribeRequest { Endpoint = device.Endpoint });
        Assert.Single(push.SubscriptionsOf(bobId));

        // The push service says it is gone → forgotten.
        lock (sender.GoneEndpoints) sender.GoneEndpoints.Add(device.Endpoint);
        await h.Disconnect(bob);
        await h.Request(ann, new ChatMessageRequest { Message = "hello?" });
        await Delivered(h);
        await WaitUntil(() => push.SubscriptionsOf(bobId).Count == 0);
    }

    [Fact]
    public async Task Logout_DropsTheDevicesSubscription()
    {
        var sender = new RecordingSender();
        await using var h = Harness(sender);
        var push = h.Service<PushService>();
        var ann = await Join(h, AnnKey, "Ann");
        var annId = h.Events<PresenceSnapshotEvent>(ann).Single().YourUserId;
        await h.Request(ann, new ClaimAccountRequest { Login = "ann", Password = "password123" });
        await WaitUntil(() => h.Sessions.Get(ann.Id)!.User!.IsClaimed);
        await h.Request(ann, Subscription("https://push.example/ann"));
        Assert.Single(push.SubscriptionsOf(annId));

        await h.Request(ann, new LogoutRequest());
        await WaitUntil(() => push.SubscriptionsOf(annId).Count == 0);
    }

    [Fact]
    public async Task KeysAndSubscriptions_SurviveARestart()
    {
        using var db = new TempDatabase();
        var sender = new RecordingSender();
        string publicKey;
        uint annId;
        await using (var h = Harness(sender, o => o.ChatDatabasePath = db.Path))
        {
            var ann = await Join(h, AnnKey, "Ann");
            annId = h.Events<PresenceSnapshotEvent>(ann).Single().YourUserId;
            await h.Request(ann, Subscription("https://push.example/ann"));
            publicKey = h.Service<PushService>().Keys!.PublicKey;
            await h.Storage.FlushAsync();
        }

        await using (var h = Harness(sender, o => o.ChatDatabasePath = db.Path))
        {
            Assert.Equal(publicKey, h.Service<PushService>().Keys!.PublicKey);
            Assert.Single(h.Service<PushService>().SubscriptionsOf(annId));

            var bob = await Join(h, BobKey, "Bob");
            await h.Request(bob, new ChatMessageRequest { Message = "while you were out" });
            await Delivered(h);
            Assert.Equal("https://push.example/ann", Assert.Single(sender.Sent).Endpoint);
        }
    }

    private sealed class CapturingHandler(System.Net.HttpStatusCode status) : HttpMessageHandler
    {
        public HttpRequestMessage? Request;
        public byte[] Body = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Request = request;
            Body = await request.Content!.ReadAsByteArrayAsync(ct);
            return new HttpResponseMessage(status);
        }
    }

    [Fact]
    public async Task WebPushSender_PostsAnEncryptedSignedRequest()
    {
        using var receiver = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256);
        var uaPublic = WebPushCrypto.EncodePoint(receiver.ExportParameters(false).Q);
        var auth = RandomNumberGenerator.GetBytes(16);
        var subscription = new PushSubscription("https://push.example/send/abc", 7, null, uaPublic, auth);
        var keys = VapidKeys.Generate();
        var options = new GameServerOptions { PushSubject = "https://tox.example/", PushTtlSeconds = 600 };
        var logger = Microsoft.Extensions.Logging.Abstractions.NullLogger<WebPushSender>.Instance;

        var ok = new CapturingHandler(System.Net.HttpStatusCode.Created);
        var result = await new WebPushSender(new HttpClient(ok), options, logger)
            .SendAsync(subscription, "{\"body\":\"hi\"}"u8.ToArray(), keys, CancellationToken.None);

        Assert.Equal(PushSendResult.Delivered, result);
        Assert.Equal(HttpMethod.Post, ok.Request!.Method);
        Assert.Equal(subscription.Endpoint, ok.Request.RequestUri!.ToString());
        Assert.Equal("aes128gcm", Assert.Single(ok.Request.Content!.Headers.ContentEncoding));
        Assert.Equal("600", Assert.Single(ok.Request.Headers.GetValues("TTL")));
        Assert.StartsWith("vapid t=", Assert.Single(ok.Request.Headers.GetValues("Authorization")));
        Assert.Equal("{\"body\":\"hi\"}", Encoding.UTF8.GetString(Decrypt(ok.Body, receiver, uaPublic, auth)));

        var gone = new CapturingHandler(System.Net.HttpStatusCode.Gone);
        Assert.Equal(PushSendResult.Gone, await new WebPushSender(new HttpClient(gone), options, logger)
            .SendAsync(subscription, "{}"u8.ToArray(), keys, CancellationToken.None));
        var limited = new CapturingHandler(System.Net.HttpStatusCode.TooManyRequests);
        Assert.Equal(PushSendResult.Failed, await new WebPushSender(new HttpClient(limited), options, logger)
            .SendAsync(subscription, "{}"u8.ToArray(), keys, CancellationToken.None));
    }

    // A receiver per RFC 8291 (what a browser does), to check Encrypt independently.
    private static byte[] Decrypt(byte[] body, ECDiffieHellman receiver, byte[] uaPublic, byte[] auth)
    {
        var salt = body[..16];
        var idLength = body[20];
        var asPublic = body[21..(21 + idLength)];
        var ciphertext = body[(21 + idLength)..];

        using var sender = ECDiffieHellman.Create(new ECParameters
        {
            Curve = ECCurve.NamedCurves.nistP256,
            Q = WebPushCrypto.DecodePoint(asPublic),
        });
        var secret = receiver.DeriveRawSecretAgreement(sender.PublicKey);
        var keyInfo = "WebPush: info\0"u8.ToArray().Concat(uaPublic).Concat(asPublic).ToArray();
        var ikm = HKDF.DeriveKey(HashAlgorithmName.SHA256, secret, 32, auth, keyInfo);
        var prk = HKDF.Extract(HashAlgorithmName.SHA256, ikm, salt);
        var cek = HKDF.Expand(HashAlgorithmName.SHA256, prk, 16, "Content-Encoding: aes128gcm\0"u8.ToArray());
        var nonce = HKDF.Expand(HashAlgorithmName.SHA256, prk, 12, "Content-Encoding: nonce\0"u8.ToArray());

        var plaintext = new byte[ciphertext.Length - 16];
        using var aes = new AesGcm(cek, 16);
        aes.Decrypt(nonce, ciphertext[..^16], ciphertext[^16..], plaintext);
        Assert.Equal(2, plaintext[^1]); // the last-record delimiter
        return plaintext[..^1];
    }
}

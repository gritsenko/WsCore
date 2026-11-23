using Microsoft.Extensions.Logging.Abstractions;
using WsServer.Persistence;

namespace WsServer.Tests;

public class SqliteChatStorageTests
{
    private static SqliteChatStorage Open(string path, int maxPerRoom = 0, int userRetentionDays = 0)
        => new(path, maxPerRoom, userRetentionDays, NullLogger.Instance);

    private static ChatMessage Message(uint id, string room = "lobby")
        => new(id, room, UserId: 7, Name: "Ann", Text: $"m{id}", SentAtMs: 1000 + id);

    private static Task<IReadOnlyList<ChatMessage>> Query(IChatStorage storage, string room, uint beforeId, int limit)
    {
        var done = new TaskCompletionSource<IReadOnlyList<ChatMessage>>(TaskCreationOptions.RunContinuationsAsynchronously);
        storage.QueryBefore(room, beforeId, limit, done.SetResult);
        return done.Task;
    }

    [Fact]
    public async Task Messages_SurviveAReopen_WithTheSameEpochAndTheNextId()
    {
        using var db = new TempDatabase();
        uint epoch;
        using (var storage = Open(db.Path))
        {
            var fresh = storage.Load(recentPerRoom: 10);
            epoch = fresh.Epoch;
            Assert.Equal(1u, fresh.NextMessageId);
            Assert.Empty(fresh.Rooms);

            for (uint id = 1; id <= 5; id++) storage.Append(Message(id));
            storage.Append(Message(6, "game"));
            await storage.FlushAsync();
        }

        using var reopened = Open(db.Path);
        var snapshot = reopened.Load(recentPerRoom: 3);

        Assert.Equal(epoch, snapshot.Epoch);
        Assert.Equal(7u, snapshot.NextMessageId);
        var lobby = snapshot.Rooms.Single(r => r.RoomId == "lobby");
        Assert.Equal([3u, 4u, 5u], lobby.Recent.Select(m => m.Id)); // the newest 3, oldest first
        Assert.True(lobby.HasOlder);
        var game = snapshot.Rooms.Single(r => r.RoomId == "game");
        Assert.Equal([6u], game.Recent.Select(m => m.Id));
        Assert.False(game.HasOlder);
        Assert.Equal(Message(5), lobby.Recent[^1]); // every column round-trips
    }

    [Fact]
    public async Task QueryBefore_PagesBackwardsWithinOneRoom_NewestFirst()
    {
        using var db = new TempDatabase();
        using var storage = Open(db.Path);
        storage.Load(10);
        for (uint id = 1; id <= 20; id++) storage.Append(Message(id, id % 2 == 0 ? "lobby" : "game"));

        // No flush: a query is ordered behind the appends queued before it.
        var page = await Query(storage, "lobby", beforeId: 15, limit: 3);
        Assert.Equal([14u, 12u, 10u], page.Select(m => m.Id));

        var next = await Query(storage, "lobby", beforeId: 10, limit: 100);
        Assert.Equal([8u, 6u, 4u, 2u], next.Select(m => m.Id));

        Assert.Empty(await Query(storage, "lobby", beforeId: 2, limit: 10));
        Assert.Empty(await Query(storage, "nowhere", beforeId: uint.MaxValue, limit: 10));
    }

    [Fact]
    public async Task Users_AreUpserted_Deleted_AndReloaded()
    {
        using var db = new TempDatabase();
        using (var storage = Open(db.Path))
        {
            storage.Load(10);
            storage.SaveUser(new StoredUser(1, "Ann", 100));
            storage.SaveUser(new StoredUser(2, "Bob", 200));
            storage.SaveUser(new StoredUser(1, "Annie", 300)); // rename + seen later
            storage.SaveUser(new StoredUser(3, "Cy", 400));
            storage.DeleteUser(2);
            await storage.FlushAsync();
        }

        using var reopened = Open(db.Path);
        var snapshot = reopened.Load(10);

        Assert.Equal(
            [new StoredUser(1, "Annie", 300), new StoredUser(3, "Cy", 400)],
            snapshot.Users.OrderBy(u => u.Id));
        Assert.Equal(4u, snapshot.NextUserId);
    }

    [Fact]
    public async Task Retention_KeepsOnlyTheNewestMessagesPerRoom_AndRecentUsers()
    {
        using var db = new TempDatabase();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        using (var storage = Open(db.Path))
        {
            storage.Load(10);
            for (uint id = 1; id <= 10; id++) storage.Append(Message(id));
            storage.Append(Message(11, "game"));
            storage.SaveUser(new StoredUser(1, "Old", now - TimeSpan.FromDays(40).Ticks / TimeSpan.TicksPerMillisecond));
            storage.SaveUser(new StoredUser(2, "New", now));
            await storage.FlushAsync();
        }

        // Retention is applied when the database is opened (and hourly while running).
        using var reopened = Open(db.Path, maxPerRoom: 4, userRetentionDays: 30);
        var snapshot = reopened.Load(100);

        Assert.Equal([7u, 8u, 9u, 10u], snapshot.Rooms.Single(r => r.RoomId == "lobby").Recent.Select(m => m.Id));
        Assert.Equal([11u], snapshot.Rooms.Single(r => r.RoomId == "game").Recent.Select(m => m.Id));
        Assert.Equal(["New"], snapshot.Users.Select(u => u.Name));
        Assert.Equal(12u, snapshot.NextMessageId); // ids are never reused
    }

    private static Task<StoredAvatar?> Avatar(IChatStorage storage, uint userId)
    {
        var done = new TaskCompletionSource<StoredAvatar?>(TaskCreationOptions.RunContinuationsAsynchronously);
        storage.LoadAvatar(userId, done.SetResult);
        return done.Task;
    }

    [Fact]
    public async Task Accounts_Keys_AndAvatars_AreStored_AndRemovedWithTheUser()
    {
        using var db = new TempDatabase();
        var ann = new StoredUser(1, "Ann", 100) { Login = "ann", PasswordHash = "hash", About = "hello", AvatarVersion = 7 };
        using (var storage = Open(db.Path))
        {
            storage.Load(10);
            storage.SaveUser(ann);
            storage.SaveUser(new StoredUser(2, "Bob", 200));
            storage.SaveUserKey(new StoredUserKey("key-a1", 1));
            storage.SaveUserKey(new StoredUserKey("key-a2", 1));
            storage.SaveUserKey(new StoredUserKey("key-b", 2));
            storage.SaveUserKey(new StoredUserKey("key-b", 1)); // the key moved to Ann
            storage.DeleteUserKey("key-a2");
            storage.SaveAvatar(1, new StoredAvatar("image/png", [1, 2, 3]));
            storage.SaveAvatar(2, new StoredAvatar("image/jpeg", [4]));
            storage.SaveAvatar(2, null);

            var avatar = await Avatar(storage, 1); // ordered behind the writes above
            Assert.Equal("image/png", avatar!.ContentType);
            Assert.Equal([1, 2, 3], avatar.Data);
            Assert.Null(await Avatar(storage, 2));
        }

        using var reopened = Open(db.Path);
        var snapshot = reopened.Load(10);
        Assert.Equal(ann, snapshot.Users.Single(u => u.Id == 1));
        Assert.Equal(
            [new StoredUserKey("key-a1", 1), new StoredUserKey("key-b", 1)],
            snapshot.UserKeys.OrderBy(k => k.KeyHash));

        reopened.DeleteUser(1);
        Assert.Null(await Avatar(reopened, 1));
        await reopened.FlushAsync();
        reopened.Dispose();

        using var last = Open(db.Path);
        var final = last.Load(10);
        Assert.Equal([2u], final.Users.Select(u => u.Id));
        Assert.Empty(final.UserKeys);
    }

    [Fact]
    public async Task Retention_NeverForgetsAClaimedAccount()
    {
        using var db = new TempDatabase();
        var longAgo = DateTimeOffset.UtcNow.AddDays(-400).ToUnixTimeMilliseconds();
        using (var storage = Open(db.Path))
        {
            storage.Load(10);
            storage.SaveUser(new StoredUser(1, "Guest", longAgo));
            storage.SaveUserKey(new StoredUserKey("guest-key", 1));
            storage.SaveUser(new StoredUser(2, "Owner", longAgo) { Login = "owner", PasswordHash = "hash" });
            storage.SaveUserKey(new StoredUserKey("owner-key", 2));
            await storage.FlushAsync();
        }

        using var reopened = Open(db.Path, userRetentionDays: 30);
        var snapshot = reopened.Load(10);
        Assert.Equal(["Owner"], snapshot.Users.Select(u => u.Name));
        Assert.Equal([new StoredUserKey("owner-key", 2)], snapshot.UserKeys);
    }

    [Fact]
    public void ADatabaseFromBeforeAccounts_IsMigrated_KeepingUsersAndTheirKeys()
    {
        using var db = new TempDatabase();
        Directory.CreateDirectory(Path.GetDirectoryName(db.Path)!);
        using (var old = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={db.Path};Pooling=False"))
        {
            old.Open();
            using var cmd = old.CreateCommand();
            cmd.CommandText = """
                CREATE TABLE users(
                    id        INTEGER PRIMARY KEY,
                    key_hash  TEXT    NOT NULL UNIQUE,
                    name      TEXT    NOT NULL,
                    last_seen INTEGER NOT NULL
                );
                INSERT INTO users VALUES(4, 'hash-ann', 'Ann', 100), (9, 'hash-bob', 'Bob', 200);
                """;
            cmd.ExecuteNonQuery();
        }

        using (var storage = Open(db.Path))
        {
            var snapshot = storage.Load(10);
            Assert.Equal([new StoredUser(4, "Ann", 100), new StoredUser(9, "Bob", 200)], snapshot.Users.OrderBy(u => u.Id));
            Assert.Equal(
                [new StoredUserKey("hash-ann", 4), new StoredUserKey("hash-bob", 9)],
                snapshot.UserKeys.OrderBy(k => k.UserId));
            Assert.Equal(10u, snapshot.NextUserId);
        }

        // Migrating is a one-off: reopening leaves the data alone.
        using var again = Open(db.Path);
        Assert.Equal(2, again.Load(10).Users.Count);
    }

    [Fact]
    public void AnAccountsDatabase_IsMigratedToRoles_KeepingItsAccounts()
    {
        using var db = new TempDatabase();
        Directory.CreateDirectory(Path.GetDirectoryName(db.Path)!);
        using (var old = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={db.Path};Pooling=False"))
        {
            old.Open();
            using var cmd = old.CreateCommand();
            // Schema v1 exactly as the accounts release created it.
            cmd.CommandText = """
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
                CREATE TABLE user_keys(key_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL) WITHOUT ROWID;
                CREATE INDEX ix_user_keys_user ON user_keys(user_id);
                CREATE TABLE avatars(user_id INTEGER PRIMARY KEY, content_type TEXT NOT NULL, data BLOB NOT NULL);
                INSERT INTO users(id, name, last_seen, login, password_hash, about) VALUES(3, 'Igor', 100, 'gritsenko', 'hash', 'hi');
                INSERT INTO user_keys VALUES('hash-igor', 3);
                PRAGMA user_version = 1;
                """;
            cmd.ExecuteNonQuery();
        }

        using (var storage = Open(db.Path))
        {
            var snapshot = storage.Load(10);
            var igor = Assert.Single(snapshot.Users);
            Assert.Equal((3u, "gritsenko", "hash", "hi", false), (igor.Id, igor.Login, igor.PasswordHash, igor.About, igor.IsAdmin));
            Assert.Equal([new StoredUserKey("hash-igor", 3)], snapshot.UserKeys);
            Assert.Empty(snapshot.Channels);

            storage.SaveUser(igor with { IsAdmin = true });
            storage.SaveChannel(new StoredChannel("lobby", 1));
            storage.SaveChannelMember(new StoredChannelMember("voice", 3) { AdminRights = 7, Title = "boss" });
            storage.SaveChannelMember(new StoredChannelMember("voice", 5) { Denied = 1, UntilMs = 99 });
            storage.DeleteChannelMember("voice", 5);
            storage.FlushAsync().Wait();
        }

        using var again = Open(db.Path);
        var reloaded = again.Load(10);
        Assert.True(reloaded.Users.Single().IsAdmin);
        Assert.Equal([new StoredChannel("lobby", 1)], reloaded.Channels);
        Assert.Equal([new StoredChannelMember("voice", 3) { AdminRights = 7, Title = "boss" }], reloaded.ChannelMembers);
    }

    [Fact]
    public async Task CreatedChannels_AndAccess_AreStored_AndADeletedChannelTakesItsHistory()
    {
        using var db = new TempDatabase();
        using (var storage = Open(db.Path))
        {
            storage.Load(10);
            storage.SaveChannel(new StoredChannel("lobby", 1)); // a built-in room: no name
            storage.SaveChannel(new StoredChannel("c1", 3) { Name = "Штаб", IsPrivate = true, CreatedMs = 50 });
            storage.SaveChannel(new StoredChannel("c2", 3) { Name = "Мусор", CreatedMs = 60 });
            storage.SaveChannelMember(new StoredChannelMember("c1", 4) { HasAccess = true });
            storage.SaveChannelMember(new StoredChannelMember("c2", 4) { HasAccess = true });
            storage.Append(Message(1, "c1"));
            storage.Append(Message(2, "c2"));
            storage.DeleteChannel("c2");
            await storage.FlushAsync();
        }

        using var reopened = Open(db.Path);
        var snapshot = reopened.Load(10);
        Assert.Equal(
            [
                new StoredChannel("c1", 3) { Name = "Штаб", IsPrivate = true, CreatedMs = 50 },
                new StoredChannel("lobby", 1),
            ],
            snapshot.Channels.OrderBy(c => c.RoomId));
        Assert.Equal([new StoredChannelMember("c1", 4) { HasAccess = true }], snapshot.ChannelMembers);
        Assert.Equal(["c1"], snapshot.Rooms.Select(r => r.RoomId));
    }

    [Fact]
    public void APushDatabase_IsMigratedToCreatedChannels_KeepingItsRoles()
    {
        using var db = new TempDatabase();
        using (var storage = Open(db.Path))
        {
            storage.Load(10);
            storage.SaveChannel(new StoredChannel("voice", 1));
            storage.SaveChannelMember(new StoredChannelMember("voice", 3) { AdminRights = 7, Title = "boss" });
            storage.FlushAsync().Wait();
        }
        // Back to schema v3 exactly as the push release had it.
        using (var conn = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={db.Path};Pooling=False"))
        {
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                ALTER TABLE channels DROP COLUMN name;
                ALTER TABLE channels DROP COLUMN is_private;
                ALTER TABLE channels DROP COLUMN created_ms;
                ALTER TABLE channel_members DROP COLUMN has_access;
                ALTER TABLE channels DROP COLUMN is_voice;
                PRAGMA user_version = 3;
                """;
            cmd.ExecuteNonQuery();
        }

        using var migrated = Open(db.Path);
        var snapshot = migrated.Load(10);
        Assert.Equal([new StoredChannel("voice", 1)], snapshot.Channels);
        Assert.Equal([new StoredChannelMember("voice", 3) { AdminRights = 7, Title = "boss" }], snapshot.ChannelMembers);
    }

    [Fact]
    public void ACreatedChannelsDatabase_IsMigratedToVoiceChannels()
    {
        using var db = new TempDatabase();
        using (var storage = Open(db.Path))
        {
            storage.Load(10);
            storage.SaveChannel(new StoredChannel("c1", 3) { Name = "Talk", IsPrivate = true, CreatedMs = 5 });
            storage.FlushAsync().Wait();
        }
        // Back to schema v4 (created channels, no voice flag).
        using (var conn = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={db.Path};Pooling=False"))
        {
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                ALTER TABLE channels DROP COLUMN is_voice;
                PRAGMA user_version = 4;
                """;
            cmd.ExecuteNonQuery();
        }

        using (var migrated = Open(db.Path))
        {
            Assert.Equal([new StoredChannel("c1", 3) { Name = "Talk", IsPrivate = true, CreatedMs = 5 }],
                migrated.Load(10).Channels);
            migrated.SaveChannel(new StoredChannel("c2", 3) { Name = "Voice", CreatedMs = 6, IsVoice = true });
            migrated.FlushAsync().Wait();
        }
        using var reopened = Open(db.Path);
        Assert.True(reopened.Load(10).Channels.Single(c => c.RoomId == "c2").IsVoice);
    }

    [Fact]
    public void Factory_WithoutAPath_OrWithAnUnusablePath_RunsWithoutPersistence()
    {
        using var none = ChatStorageFactory.Create(new GameServerOptions(), NullLogger.Instance);
        Assert.False(none.IsPersistent);

        // A path whose parent is a file: the directory cannot be created.
        var file = Path.GetTempFileName();
        try
        {
            using var broken = ChatStorageFactory.Create(
                new GameServerOptions { ChatDatabasePath = Path.Combine(file, "sub", "chat.db") }, NullLogger.Instance);
            Assert.False(broken.IsPersistent);
        }
        finally
        {
            File.Delete(file);
        }
    }
}

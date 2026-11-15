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
            storage.SaveUser(new StoredUser(1, "hash-1", "Ann", 100));
            storage.SaveUser(new StoredUser(2, "hash-2", "Bob", 200));
            storage.SaveUser(new StoredUser(1, "hash-1", "Annie", 300)); // rename + seen later
            storage.SaveUser(new StoredUser(3, "hash-3", "Cy", 400));
            storage.DeleteUser(2);
            await storage.FlushAsync();
        }

        using var reopened = Open(db.Path);
        var snapshot = reopened.Load(10);

        Assert.Equal(
            [new StoredUser(1, "hash-1", "Annie", 300), new StoredUser(3, "hash-3", "Cy", 400)],
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
            storage.SaveUser(new StoredUser(1, "old", "Old", now - TimeSpan.FromDays(40).Ticks / TimeSpan.TicksPerMillisecond));
            storage.SaveUser(new StoredUser(2, "new", "New", now));
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

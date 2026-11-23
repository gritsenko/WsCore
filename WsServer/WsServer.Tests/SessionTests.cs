using Game.Core;
using Game.ServerLogic.Chat.Events;
using Game.ServerLogic.Chat.Requests;
using Game.ServerLogic.Connection.Events;
using Game.ServerLogic.GameState.Events;
using Game.ServerLogic.Map.Events;
using Game.ServerLogic.Map.Requests;
using Game.ServerLogic.Player.Events;
using Game.ServerLogic.Player.Requests;
using Game.ServerLogic.Rooms.Events;
using Game.ServerLogic.Rooms.Requests;
using MemoryPack;
using Microsoft.Extensions.DependencyInjection;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Rooms;
using WsServer.Sessions;
using static WsServer.Tests.TestSupport;

namespace WsServer.Tests;

/// <summary>
/// "A connection is not a player": a connection gets a session and the lobby; an avatar
/// only while in a spatial room. And every event reaches only the audience it concerns.
/// Drives the real DI graph and tick loop with in-process connections.
/// </summary>
public class SessionTests
{
    private sealed class Harness : IAsyncDisposable
    {
        private readonly ServiceProvider _services;
        private readonly ReflectionServerLogicProvider _logic;
        public GameServer Server { get; }
        public GameModel Model { get; }
        public RoomManager Rooms { get; }
        public SessionManager Sessions { get; }

        public Harness(Action<GameServerOptions>? configure = null)
        {
            _services = BuildGameServices(o =>
            {
                o.TickIntervalMs = 5;
                o.ChatCooldownSeconds = 0;
                o.HeartbeatIntervalSeconds = 0; // opt-in per test, keeps event order exact
                configure?.Invoke(o);
            });
            Server = _services.GetRequiredService<GameServer>();
            Model = _services.GetRequiredService<GameModel>();
            Rooms = _services.GetRequiredService<RoomManager>();
            Sessions = _services.GetRequiredService<SessionManager>();
            _logic = (ReflectionServerLogicProvider)_services.GetRequiredService<IServerLogicProvider>();
            Server.Start();
        }

        public async Task<RecordingConnection> Connect()
        {
            var conn = new RecordingConnection();
            Server.OnClientConnected(conn, id => conn.Id = id);
            await Settle();
            return conn;
        }

        public async Task Request(RecordingConnection conn, IClientRequest request)
        {
            Server.ProcessClientRequest(conn.Id, request);
            await Settle();
        }

        // Waits for a full tick that started after this call, i.e. one that drained
        // everything queued so far (OnTick fires after the drain within the same tick).
        public async Task Settle()
        {
            var ticks = 0;
            void Handler() => Interlocked.Increment(ref ticks);
            Server.OnTick += Handler;
            try { await WaitUntil(() => Volatile.Read(ref ticks) >= 2); }
            finally { Server.OnTick -= Handler; }
        }

        public object[] Events(RecordingConnection conn) => conn.Messages
            .Select(m => MemoryPackSerializer.Deserialize(
                _logic.ServerEventTypes.FindTypeById(m[0])!, m.AsSpan(1))!)
            .ToArray();

        public T[] Events<T>(RecordingConnection conn) where T : IServerEvent => Events(conn).OfType<T>().ToArray();

        public void Clear(params RecordingConnection[] conns)
        {
            foreach (var c in conns) c.Clear();
        }

        public async ValueTask DisposeAsync()
        {
            await Server.StopAsync(CancellationToken.None);
            await _services.DisposeAsync();
        }
    }

    [Fact]
    public async Task Connect_GetsSessionAndLobby_ButNoAvatarAndNoWorldState()
    {
        await using var h = new Harness();
        var baseline = h.Model.PlayersCount;

        var a = await h.Connect();

        Assert.Null(h.Model.GetPlayer(a.Id));
        Assert.Equal(baseline, h.Model.PlayersCount);
        Assert.NotNull(h.Sessions.Get(a.Id));
        Assert.Equal("lobby", h.Rooms.GetClientRoom(a.Id)?.Id);

        var events = h.Events(a);
        Assert.IsType<InitPlayerEvent>(events[0]);
        var result = Assert.IsType<JoinRoomResultEvent>(events[1]);
        Assert.True(result.Success);
        Assert.Equal("lobby", result.RoomId);
        Assert.Contains(events, e => e is RoomUsersUpdateEvent { RoomId: "lobby" });
        Assert.Contains(events, e => e is RoomListEvent);
        Assert.DoesNotContain(events, e => e is GameStateUpdateEvent or PlayerJoinedEvent or GameTickUpdateEvent);
    }

    [Fact]
    public async Task RoomList_DescribesServerRooms_WithModesAndPersistence()
    {
        await using var h = new Harness();
        var a = await h.Connect();
        h.Clear(a);

        await h.Request(a, new GetRoomListRequest());

        var list = Assert.Single(h.Events<RoomListEvent>(a));
        // The game room is hidden from lists (still joinable by id).
        Assert.Equal(["lobby", "voice"], list.Rooms.Select(r => r.Id));
        var voice = list.Rooms.Single(r => r.Id == "voice");
        Assert.Contains("VoiceChat", voice.SupportedModes);
        Assert.True(voice.IsPersistent);
        Assert.False(voice.IsPrivate || voice.IsCreated);
        Assert.Equal(1, list.Rooms.Single(r => r.Id == "lobby").UserCount);

        await h.Request(a, new JoinRoomRequest("game"));
        var joined = Assert.Single(h.Events<JoinRoomResultEvent>(a));
        Assert.True(joined.Success);
        Assert.Contains("Spatial", joined.Room!.SupportedModes);
    }

    [Fact]
    public async Task JoinGame_SpawnsAvatar_JoinerGetsState_OnlySpatialMembersHearOfIt()
    {
        await using var h = new Harness();
        var lobby = await h.Connect();
        var inGame = await h.Connect();
        await h.Request(inGame, new JoinRoomRequest("game"));
        var joiner = await h.Connect();
        await h.Request(joiner, new UpdatePlayerSlotsRequest { Body = 2, Gun = 3, Armor = 1 });
        await h.Request(joiner, new SetPlayerNameRequest { Name = "Joiner" });
        h.Clear(lobby, inGame, joiner);

        await h.Request(joiner, new JoinRoomRequest("game"));

        var player = h.Model.GetPlayer(joiner.Id);
        Assert.NotNull(player);
        Assert.Equal("Joiner", player.Name);
        Assert.Equal((2, 3, 1), (player.BodyIndex, player.WeaponIndex, player.ArmorIndex));

        var joinerEvents = h.Events(joiner);
        var result = Assert.IsType<JoinRoomResultEvent>(joinerEvents[0]);
        Assert.True(result.Success);
        Assert.Contains("Spatial", result.Room!.SupportedModes);
        var state = Assert.IsType<GameStateUpdateEvent>(joinerEvents[1]);
        Assert.Contains(state.PlayerStateData, p => p.Id == joiner.Id && p.Name == "Joiner");
        Assert.Empty(h.Events<PlayerJoinedEvent>(joiner));

        Assert.Contains(h.Events<PlayerJoinedEvent>(inGame), e => e.PlayerStateData.Id == joiner.Id);
        Assert.Empty(h.Events<PlayerJoinedEvent>(lobby));
        Assert.Empty(h.Events<GameTickUpdateEvent>(lobby));
        Assert.NotEmpty(h.Events<GameTickUpdateEvent>(joiner));
    }

    [Fact]
    public async Task LeaveGame_RemovesAvatar_PlayerLeftOnlyToSpatialMembers()
    {
        await using var h = new Harness();
        var baseline = h.Model.PlayersCount;
        var lobby = await h.Connect();
        var stays = await h.Connect();
        var leaves = await h.Connect();
        await h.Request(stays, new JoinRoomRequest("game"));
        await h.Request(leaves, new JoinRoomRequest("game"));
        Assert.Equal(baseline + 2, h.Model.PlayersCount);
        h.Clear(lobby, stays, leaves);

        await h.Request(leaves, new JoinRoomRequest("lobby"));

        Assert.Null(h.Model.GetPlayer(leaves.Id));
        Assert.Equal(baseline + 1, h.Model.PlayersCount);
        Assert.Contains(h.Events<PlayerLeftEvent>(stays), e => e.ClientId == leaves.Id);
        Assert.Empty(h.Events<PlayerLeftEvent>(lobby));
        Assert.Empty(h.Events<PlayerLeftEvent>(leaves));
        Assert.True(Assert.Single(h.Events<JoinRoomResultEvent>(leaves)).Success);

        // Re-entering spawns a fresh avatar.
        await h.Request(leaves, new JoinRoomRequest("game"));
        Assert.NotNull(h.Model.GetPlayer(leaves.Id));
    }

    [Fact]
    public async Task Disconnect_FromGame_RemovesAvatarAndSession_TellsSpatialMembersOnly()
    {
        await using var h = new Harness();
        var baseline = h.Model.PlayersCount;
        var lobby = await h.Connect();
        var stays = await h.Connect();
        var drops = await h.Connect();
        await h.Request(stays, new JoinRoomRequest("game"));
        await h.Request(drops, new JoinRoomRequest("game"));
        h.Clear(lobby, stays);

        h.Server.OnClientDisconnected(drops.Id);
        await h.Settle();

        Assert.Null(h.Model.GetPlayer(drops.Id));
        Assert.Null(h.Sessions.Get(drops.Id));
        Assert.Null(h.Rooms.GetClientRoom(drops.Id));
        Assert.Equal(baseline + 1, h.Model.PlayersCount);
        Assert.Contains(h.Events<PlayerLeftEvent>(stays), e => e.ClientId == drops.Id);
        Assert.Empty(h.Events<PlayerLeftEvent>(lobby));
    }

    [Fact]
    public async Task JoinUnknownRoom_FailsWithResult_MembershipUnchanged()
    {
        await using var h = new Harness();
        var a = await h.Connect();
        h.Clear(a);

        await h.Request(a, new JoinRoomRequest("nope"));

        var result = Assert.Single(h.Events<JoinRoomResultEvent>(a));
        Assert.False(result.Success);
        Assert.Equal("nope", result.RoomId);
        Assert.False(string.IsNullOrEmpty(result.Error));
        Assert.Null(result.Room);
        Assert.Equal("lobby", h.Rooms.GetClientRoom(a.Id)?.Id);
    }

    [Fact]
    public async Task Chat_ReachesOnlyTheSendersRoom()
    {
        await using var h = new Harness();
        var lobbyA = await h.Connect();
        var lobbyB = await h.Connect();
        var game = await h.Connect();
        await h.Request(game, new JoinRoomRequest("game"));
        h.Clear(lobbyA, lobbyB, game);

        await h.Request(lobbyA, new ChatMessageRequest { Message = "lobby says hi" });
        await h.Request(game, new ChatMessageRequest { Message = "game says hi" });

        Assert.Equal(["lobby says hi"], h.Events<ChatMessageEvent>(lobbyA).Select(e => e.Message));
        Assert.Equal(["lobby says hi"], h.Events<ChatMessageEvent>(lobbyB).Select(e => e.Message));
        Assert.Equal(["game says hi"], h.Events<ChatMessageEvent>(game).Select(e => e.Message));
    }

    [Fact]
    public async Task Chat_IsRateLimitedPerSession()
    {
        await using var h = new Harness(o => o.ChatCooldownSeconds = 60);
        var a = await h.Connect();
        h.Clear(a);

        await h.Request(a, new ChatMessageRequest { Message = "one" });
        await h.Request(a, new ChatMessageRequest { Message = "two" });

        Assert.Equal(["one"], h.Events<ChatMessageEvent>(a).Select(e => e.Message));
    }

    [Fact]
    public async Task Rename_InLobby_WithoutAvatar_UpdatesRoomListingAndTellsTheRoomOnly()
    {
        await using var h = new Harness();
        var a = await h.Connect();
        var lobbyPeer = await h.Connect();
        var game = await h.Connect();
        await h.Request(game, new JoinRoomRequest("game"));
        h.Clear(a, lobbyPeer, game);

        await h.Request(a, new SetPlayerNameRequest { Name = "Alice" });

        Assert.Null(h.Model.GetPlayer(a.Id));
        Assert.Equal("Alice", h.Sessions.Get(a.Id)!.Name);
        Assert.Contains(h.Events<SetPlayerNameEvent>(lobbyPeer), e => e.ClientId == a.Id && e.Name == "Alice");
        Assert.Contains(h.Events<SetPlayerNameEvent>(a), e => e.ClientId == a.Id && e.Name == "Alice");
        Assert.Empty(h.Events<SetPlayerNameEvent>(game));

        // A later user-list snapshot carries the new name, not the one captured at join.
        var late = await h.Connect();
        var users = h.Events<RoomUsersUpdateEvent>(late).Last(e => e.RoomId == "lobby").Users;
        Assert.Contains(users, u => u.ClientId == a.Id && u.Name == "Alice");

        // ...and so does the avatar spawned afterwards.
        await h.Request(a, new JoinRoomRequest("game"));
        Assert.Equal("Alice", h.Model.GetPlayer(a.Id)!.Name);
    }

    [Fact]
    public async Task Rename_InGame_RenamesAvatar_AndTellsSpatialMembers()
    {
        await using var h = new Harness();
        var a = await h.Connect();
        var peer = await h.Connect();
        var lobby = await h.Connect();
        await h.Request(a, new JoinRoomRequest("game"));
        await h.Request(peer, new JoinRoomRequest("game"));
        h.Clear(a, peer, lobby);

        await h.Request(a, new SetPlayerNameRequest { Name = "Hero" });

        Assert.Equal("Hero", h.Model.GetPlayer(a.Id)!.Name);
        Assert.Contains(h.Events<SetPlayerNameEvent>(peer), e => e.ClientId == a.Id && e.Name == "Hero");
        Assert.Empty(h.Events<SetPlayerNameEvent>(lobby));
    }

    [Fact]
    public async Task GameRequests_WithoutAvatar_AreIgnoredSafely()
    {
        await using var h = new Harness();
        var lobby = await h.Connect();
        var game = await h.Connect();
        await h.Request(game, new JoinRoomRequest("game"));
        var baseline = h.Model.PlayersCount;
        h.Clear(lobby, game);

        await h.Request(lobby, new UpdatePlayerTargetRequest { AimX = 10, AimY = 10 });
        await h.Request(lobby, new UpdatePlayerStateRequest { AimX = 10, AimY = 10, ControlsState = 1 });
        await h.Request(lobby, new PlayerShootingRequest { Weapon = 0 });
        await h.Request(lobby, new PlayerRespawnRequest());
        await h.Request(lobby, new UpdatePlayerSlotsRequest { Body = 1, Gun = 1, Armor = 1 });
        await h.Request(lobby, new SetMapObjectRequest { MapX = 1, MapY = 1, ObjectType = 0 });
        await h.Request(lobby, new DestroyMapObjectRequest { MapX = 1, MapY = 1 });
        await h.Request(lobby, new GetMapObjectsRequest());

        Assert.Equal(baseline, h.Model.PlayersCount);
        Assert.Null(h.Model.GetPlayer(lobby.Id));
        Assert.Equal(0, h.Model.BulletsCount);
        Assert.DoesNotContain(h.Events(lobby), e => e is not HeartbeatEvent);
        Assert.DoesNotContain(h.Events(game), e => e is PlayerShootingEvent or PlayerRespawnEvent
            or UpdatePlayerSlotsEvent or UpdateMapObjectsEvent);
    }

    [Fact]
    public async Task Heartbeat_ReachesLobbyClients()
    {
        await using var h = new Harness(o => o.HeartbeatIntervalSeconds = 0.05);
        var a = await h.Connect();

        await WaitUntil(() => h.Events<HeartbeatEvent>(a).Length >= 2);
    }

    [Fact]
    public async Task Heartbeat_ZeroInterval_IsDisabled()
    {
        await using var h = new Harness(o => o.HeartbeatIntervalSeconds = 0);
        var a = await h.Connect();
        await Task.Delay(200);

        Assert.Empty(h.Events<HeartbeatEvent>(a));
    }

    // ---- stage D: snapshot send rate and periodic full snapshots ----

    // Counts ticks and the snapshots `conn` received so far, atomically within each tick
    // (the handler runs on the tick thread right after the server's own OnTick work).
    private static async Task<(int ticks, byte[][] snapshots)> Observe(Harness h, RecordingConnection conn, int ticks)
    {
        var seen = 0;
        byte[][] snapshots = [];
        void Handler()
        {
            if (Volatile.Read(ref seen) >= ticks) return;
            snapshots = conn.Messages.Where(m => m[0] == GameTickUpdateEvent.TypeId).ToArray();
            Interlocked.Increment(ref seen);
        }
        h.Clear(conn);
        h.Server.OnTick += Handler;
        try { await WaitUntil(() => Volatile.Read(ref seen) >= ticks, TimeSpan.FromSeconds(10)); }
        finally { h.Server.OnTick -= Handler; }
        return (ticks, snapshots);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    public async Task Snapshots_AreSentEveryNthTick(int sendEvery)
    {
        await using var h = new Harness(o => o.SnapshotSendEveryTicks = sendEvery);
        var a = await h.Connect();
        await h.Request(a, new JoinRoomRequest("game"));

        var (ticks, snapshots) = await Observe(h, a, 60);

        var expected = ticks / sendEvery;
        Assert.InRange(snapshots.Length, expected - 1, expected + 1);
    }

    [Fact]
    public async Task IdleAvatar_IsRefreshedByPeriodicFullSnapshots()
    {
        // 5 ms ticks, a snapshot every 2nd tick (10 ms), a full one every 4 snapshots.
        await using var h = new Harness(o =>
        {
            o.SnapshotSendEveryTicks = 2;
            o.FullSnapshotIntervalSeconds = 0.04;
            o.SnapshotRepeatUnchanged = 0;
        });
        var a = await h.Connect();
        await h.Request(a, new JoinRoomRequest("game"));
        await h.Settle(); // our idle avatar has dropped out of the deltas

        var (_, raw) = await Observe(h, a, 80);
        var snapshots = raw.Select(m => MemoryPackSerializer.Deserialize<GameTickUpdateEvent>(m.AsSpan(1))!).ToArray();
        Assert.True(snapshots.Length >= 30);

        bool HasMe(GameTickUpdateEvent e) => e.MovementStates.Any(m => m.PlayerId == a.Id);
        var withMe = snapshots.Count(HasMe);
        // Our avatar never moves: it appears only in the full snapshots (1 in 4), which
        // carry every avatar; the 10 built-in bots keep moving, so deltas aren't empty.
        Assert.InRange(withMe, snapshots.Length / 4 - 1, snapshots.Length / 4 + 1);
        for (int i = 0; i + 4 <= snapshots.Length; i++)
            Assert.Contains(snapshots.Skip(i).Take(4), HasMe);
        Assert.All(snapshots.Where(HasMe), e => Assert.Equal(h.Model.PlayersCount, e.MovementStates.Length));
        Assert.Contains(snapshots, e => !HasMe(e) && e.MovementStates.Length > 0);
        // Server time advances by one send interval (2 ticks) per snapshot.
        Assert.True(snapshots.Zip(snapshots.Skip(1)).All(p => p.Second.ServerTimeMs >= p.First.ServerTimeMs));
    }
}

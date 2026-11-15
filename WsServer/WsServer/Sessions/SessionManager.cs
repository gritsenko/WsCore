using Game.Core;
using Game.ServerLogic.GameState.Events;
using Game.ServerLogic.Player.Events;
using Game.ServerLogic.Presence.Events;
using Game.ServerLogic.Rooms.Events;
using WsServer.Abstract;
using WsServer.Rooms;

namespace WsServer.Sessions;

/// <summary>
/// "A connection is not a player." Owns the per-connection <see cref="ClientSession"/>s
/// and every room-membership transition, including the one that matters for the game:
/// a client gets an avatar (<see cref="Player"/> in <see cref="GameModel"/>, id ==
/// clientId) only while it is in a room supporting <see cref="RoomCompatibility.Spatial"/>,
/// and loses it on leaving that room or disconnecting.
///
/// Message scoping:
///  * InitPlayerEvent, JoinRoomResultEvent, GameStateUpdateEvent → the client itself.
///  * PlayerJoinedEvent / PlayerLeftEvent → spatial-room members only.
///  * RoomUsersUpdateEvent → members of the affected room.
///  * RoomListEvent → pushed to clients outside spatial rooms on membership changes.
///  * SetPlayerNameEvent → everyone who displays that name: the client's room (user list,
///    chat), which for a client with an avatar is the spatial audience (3D labels).
///  * PresenceSnapshotEvent → the client that identified; PresenceUpdateEvent → every
///    identified connection, whatever room it is in.
///
/// Presence: a connection that sends IdentifyRequest is bound to a <see cref="UserAccount"/>
/// (stable across reconnects). Users are online / away / offline in the member list —
/// they are never removed from it just because their connection went away.
///
/// Threading: tick thread only (connects, disconnects and requests all arrive through
/// GameServerBase's command queue), so the session map is a plain Dictionary.
/// </summary>
public sealed class SessionManager(
    GameModel gameModel,
    RoomManager roomManager,
    IGameMessenger messenger,
    UserDirectory users,
    GameServerOptions options,
    ILogger<SessionManager> logger)
{
    /// <summary>Every new connection is placed here first.</summary>
    public const string DefaultRoomId = "lobby";

    private readonly Dictionary<uint, ClientSession> _sessions = new();
    private int _count; // volatile mirror for cross-thread diagnostics

    // Users whose away state changed since the last flush (see FlushPresence).
    private readonly HashSet<UserAccount> _presenceDirty = new();
    private long _lastPresenceFlush;

    public int Count => Volatile.Read(ref _count);

    public ClientSession? Get(uint clientId) => _sessions.GetValueOrDefault(clientId);

    // ---- connection lifecycle ---------------------------------------------------------

    public void Connect(uint clientId)
    {
        _sessions[clientId] = new ClientSession(clientId);
        Volatile.Write(ref _count, _sessions.Count);

        // First message on every connection: the client learns its id.
        messenger.Send(clientId, new InitPlayerEvent(clientId));
        JoinRoom(clientId, DefaultRoomId);
    }

    public void Disconnect(uint clientId)
    {
        if (!_sessions.Remove(clientId, out var session))
            return;
        Volatile.Write(ref _count, _sessions.Count);

        var room = roomManager.GetClientRoom(clientId);
        roomManager.LeaveRoom(clientId);
        DespawnAvatar(clientId);

        // The user stays in the member list — as offline, unless another of its
        // connections (a second tab, the reconnect that replaced this socket) is alive.
        if (session.User is { } user)
        {
            user.Sessions.Remove(session);
            session.User = null;
            PublishPresence(user);
        }

        if (room != null)
        {
            BroadcastRoomUsers(room.Id);
            BroadcastRoomList();
        }
    }

    // ---- rooms ------------------------------------------------------------------------

    /// <summary>
    /// Moves the client into <paramref name="roomId"/>, answering with a
    /// JoinRoomResultEvent either way. Joining the room the client is already in is a
    /// harmless resync (result, user list and — in a spatial room — game state again).
    /// </summary>
    public bool JoinRoom(uint clientId, string roomId)
    {
        var session = Get(clientId);
        if (session == null)
            return false; // already disconnected

        var target = roomManager.GetRoom(roomId);
        if (target == null)
        {
            logger.LogInformation("Client {ClientId}: join refused, no room {RoomId}", clientId, roomId);
            messenger.Send(clientId, JoinRoomResultEvent.Failed(roomId, "Room not found"));
            return false;
        }

        var oldRoom = roomManager.GetClientRoom(clientId);
        var changed = oldRoom?.Id != target.Id;
        if (changed && !roomManager.JoinRoom(clientId, session.Name, target.Id))
        {
            logger.LogWarning("Client {ClientId}: failed to join room {RoomId}", clientId, roomId);
            messenger.Send(clientId, JoinRoomResultEvent.Failed(roomId, "Join failed"));
            return false;
        }

        var toSpatial = target.SupportsMode(RoomCompatibility.Spatial);

        // Leaving the world: drop the avatar now that the client is no longer a spatial
        // recipient, so the PlayerLeftEvent goes to the remaining audience only.
        if (!toSpatial)
            DespawnAvatar(clientId);

        messenger.Send(clientId, JoinRoomResultEvent.Joined(RoomInfo.From(target)));

        if (toSpatial)
        {
            var player = gameModel.GetPlayer(clientId);
            var spawned = player == null;
            player ??= gameModel.SpawnPlayer(clientId, session.Name,
                session.BodyIndex, session.WeaponIndex, session.ArmorIndex);

            // The joiner gets the whole world (itself included); everyone already in it
            // gets just the newcomer.
            messenger.Send(clientId, new GameStateUpdateEvent(gameModel));
            if (spawned)
            {
                messenger.BroadcastToSpatial(new PlayerJoinedEvent(player), exceptClientId: clientId);
                logger.LogInformation("Client {ClientId} entered the game world. Players: {Count}", clientId, gameModel.PlayersCount);
            }
        }

        if (changed && oldRoom != null)
            BroadcastRoomUsers(oldRoom.Id);
        BroadcastRoomUsers(target.Id);
        if (changed)
        {
            BroadcastRoomList();
            if (session.User != null)
                PublishPresence(session.User); // the member list shows where a user is
        }
        return true;
    }

    public RoomListEvent BuildRoomList() => RoomListEvent.From(roomManager.GetAllRooms());

    private void BroadcastRoomList() => messenger.BroadcastToNonSpatial(BuildRoomList());

    private void BroadcastRoomUsers(string roomId)
    {
        var room = roomManager.GetRoom(roomId);
        if (room == null || room.IsEmpty)
            return;

        var users = room.Clients.Values
            .OrderBy(c => c.Id)
            .Select(c => new RoomUserInfo { ClientId = c.Id, Name = c.Name, UserId = Get(c.Id)?.User?.Id ?? 0 })
            .ToList();
        messenger.BroadcastToRoom(roomId, new RoomUsersUpdateEvent(roomId, users));
    }

    // ---- identity ---------------------------------------------------------------------

    /// <summary>
    /// Renames the client everywhere it is shown: its session, its room listing and its
    /// avatar (if any). An empty name resets to the default. Returns the resolved name,
    /// or null if the client is gone.
    /// </summary>
    public string? SetName(uint clientId, string requested)
    {
        var session = Get(clientId);
        if (session == null)
            return null;

        var name = string.IsNullOrEmpty(requested) ? ClientSession.DefaultName(clientId) : requested;
        session.Name = name;
        roomManager.RenameClient(clientId, name);

        var evt = new SetPlayerNameEvent(clientId, name);
        if (gameModel.SetPlayerName(clientId, name) != null)
        {
            // Has an avatar → is in a spatial room, so the spatial audience covers that
            // room's members (user list + chat) as well as everyone rendering its label.
            messenger.BroadcastToSpatial(evt);
        }
        else
        {
            var room = roomManager.GetClientRoom(clientId);
            if (room != null)
                messenger.BroadcastToRoom(room.Id, evt);
            else
                messenger.Send(clientId, evt);
        }

        if (session.User is { } user)
        {
            user.Name = name;
            PublishPresence(user);
        }
        return name;
    }

    // ---- presence ---------------------------------------------------------------------

    /// <summary>
    /// Binds the connection to the user owning <paramref name="userKey"/> (created on first
    /// sight), sets its name, and answers with the member list. One identity per
    /// connection: a second IdentifyRequest is ignored.
    /// </summary>
    public bool Identify(uint clientId, string userKey, string name)
    {
        var session = Get(clientId);
        if (session == null || session.User != null)
            return false;
        if (!UserDirectory.IsValidKey(userKey))
        {
            logger.LogInformation("Client {ClientId}: identify refused (malformed user key)", clientId);
            return false;
        }

        if (name.Length > 0)
            SetName(clientId, name); // not bound yet → no presence noise from the rename

        var user = users.GetOrCreate(userKey, session.Name);
        user.Name = session.Name;
        user.Sessions.Add(session);
        session.User = user;

        // The snapshot first (it already shows this user as online), then the update that
        // tells everyone else.
        PublishPresence(user, announce: false);
        messenger.Send(clientId, BuildPresenceSnapshot(user));
        BroadcastPresence(user, exceptClientId: clientId);

        // The room's user list was sent before the connection had a user id.
        var room = roomManager.GetClientRoom(clientId);
        if (room != null)
            BroadcastRoomUsers(room.Id);

        logger.LogInformation("Client {ClientId} identified as user {UserId}", clientId, user.Id);
        return true;
    }

    /// <summary>
    /// The client's user went idle / came back. Applied at once, announced by the next
    /// <see cref="FlushPresence"/> — away toggles are entirely client-driven, so their
    /// broadcasts are rate-limited instead of trusted.
    /// </summary>
    public void SetAway(uint clientId, bool away)
    {
        var session = Get(clientId);
        if (session == null || session.IsAway == away)
            return;
        session.IsAway = away;
        if (session.User != null)
            _presenceDirty.Add(session.User);
    }

    /// <summary>Tick thread, every tick: announces pending away changes (rate-limited).</summary>
    public void FlushPresence()
    {
        if (_presenceDirty.Count == 0)
            return;
        var now = System.Diagnostics.Stopwatch.GetTimestamp();
        if (_lastPresenceFlush != 0 &&
            now - _lastPresenceFlush < (long)(options.PresenceFlushIntervalSeconds * System.Diagnostics.Stopwatch.Frequency))
            return;
        _lastPresenceFlush = now;

        foreach (var user in _presenceDirty)
            PublishPresence(user);
        _presenceDirty.Clear();
    }

    /// <summary>
    /// Announces the user's presence if it differs from what clients were last told, and
    /// persists what should survive a restart (the name, when the user was last seen).
    /// </summary>
    private void PublishPresence(UserAccount user, bool announce = true)
    {
        var status = user.Status;
        var roomId = PresenceRoomId(user);
        if (status == user.PublishedStatus && roomId == user.PublishedRoomId && user.Name == user.PublishedName)
            return;

        var cameOrWent = (status == PresenceStatus.Offline) != (user.PublishedStatus == PresenceStatus.Offline);
        var renamed = user.Name != user.PublishedName;
        if (cameOrWent)
            user.LastSeenMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (cameOrWent || renamed)
            users.Save(user);

        user.PublishedStatus = status;
        user.PublishedRoomId = roomId;
        user.PublishedName = user.Name;

        if (announce)
            BroadcastPresence(user);
    }

    private void BroadcastPresence(UserAccount user, uint exceptClientId = 0)
        => messenger.BroadcastWhere(
            new PresenceUpdateEvent { User = PresenceOf(user) },
            id => id != exceptClientId && _sessions.TryGetValue(id, out var s) && s.User != null);

    // Where the user is: the room of an active connection if there is one.
    private string? PresenceRoomId(UserAccount user)
    {
        string? fallback = null;
        foreach (var session in user.Sessions)
        {
            var roomId = roomManager.GetClientRoom(session.Id)?.Id;
            if (roomId == null)
                continue;
            if (!session.IsAway)
                return roomId;
            fallback ??= roomId;
        }
        return fallback;
    }

    private static PresenceUserInfo PresenceOf(UserAccount user) => new()
    {
        UserId = user.Id,
        Name = user.PublishedName,
        Status = user.PublishedStatus,
        RoomId = user.PublishedRoomId,
        LastSeenMs = user.LastSeenMs,
    };

    // Everyone online, plus the most recently seen offline users (bounded: the directory
    // remembers far more users than a member list should show).
    private PresenceSnapshotEvent BuildPresenceSnapshot(UserAccount self)
    {
        var snapshot = new PresenceSnapshotEvent { YourUserId = self.Id };
        var offline = new List<UserAccount>();
        foreach (var user in users.Users)
        {
            if (user.IsOnline)
                snapshot.Users.Add(PresenceOf(user));
            else
                offline.Add(user);
        }

        offline.Sort((a, b) => b.LastSeenMs.CompareTo(a.LastSeenMs));
        var take = Math.Min(offline.Count, Math.Max(0, options.PresenceMaxOfflineUsers));
        for (var i = 0; i < take; i++)
            snapshot.Users.Add(PresenceOf(offline[i]));
        return snapshot;
    }

    // ---- avatar -----------------------------------------------------------------------

    private void DespawnAvatar(uint clientId)
    {
        if (gameModel.GetPlayer(clientId) == null)
            return;
        gameModel.RemovePlayer(clientId);
        messenger.BroadcastToSpatial(new PlayerLeftEvent(clientId));
        logger.LogInformation("Client {ClientId} left the game world. Players: {Count}", clientId, gameModel.PlayersCount);
    }
}

using Game.Core;
using Game.ServerLogic.GameState.Events;
using Game.ServerLogic.Player.Events;
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
///
/// Threading: tick thread only (connects, disconnects and requests all arrive through
/// GameServerBase's command queue), so the session map is a plain Dictionary.
/// </summary>
public sealed class SessionManager(
    GameModel gameModel,
    RoomManager roomManager,
    IGameMessenger messenger,
    ILogger<SessionManager> logger)
{
    /// <summary>Every new connection is placed here first.</summary>
    public const string DefaultRoomId = "lobby";

    private readonly Dictionary<uint, ClientSession> _sessions = new();
    private int _count; // volatile mirror for cross-thread diagnostics

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
        if (!_sessions.Remove(clientId))
            return;
        Volatile.Write(ref _count, _sessions.Count);

        var room = roomManager.GetClientRoom(clientId);
        roomManager.LeaveRoom(clientId);
        DespawnAvatar(clientId);

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
            BroadcastRoomList();
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
            .Select(c => new RoomUserInfo { ClientId = c.Id, Name = c.Name })
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
        return name;
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

using Game.ServerLogic.Push.Events;
using WsServer.Push;
using System.Collections.Concurrent;
using System.Diagnostics;
using Game.Core;
using Game.ServerLogic.Account.Events;
using Game.ServerLogic.GameState.Events;
using Game.ServerLogic.Moderation.Events;
using Game.ServerLogic.Player.Events;
using Game.ServerLogic.Presence.Events;
using Game.ServerLogic.Rooms.Events;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Moderation;
using WsServer.Persistence;
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
/// Accounts: a user starts as a guest known only by the key in one browser. ClaimAccount
/// gives it a login + password; Login then binds another device's key to it; Logout
/// drops this device's key. Passwords are hashed / verified on the thread pool and the
/// outcome is applied on a later tick (<see cref="DeliverCompleted"/>). Each answers the
/// requester with an AccountResultEvent. The profile (about, avatar version) travels with
/// presence.
///
/// Threading: tick thread only (connects, disconnects and requests all arrive through
/// GameServerBase's command queue), so the session map is a plain Dictionary.
/// </summary>
public sealed class SessionManager(
    GameModel gameModel,
    RoomManager roomManager,
    IGameMessenger messenger,
    UserDirectory users,
    ChannelPermissions permissions,
    PushService push,
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

    // Outcomes of password hashing done off-thread, applied on the tick thread.
    private readonly ConcurrentQueue<Action> _completed = new();
    // Logins being claimed right now (their password is still being hashed).
    private readonly HashSet<string> _pendingLogins = new();
    // Wrong-password streaks per (existing) login: count, and until when it is locked.
    private readonly Dictionary<string, (int Failures, long LockedUntil)> _loginFailures = new();

    public int Count => Volatile.Read(ref _count);

    /// <summary>
    /// What the connection may see may have changed: it identified / logged in / out, or
    /// its user's access or role changed (raised after the room list and permissions went
    /// out). Voice follows it (<see cref="WsServer.Voice.VoiceService"/>).
    /// </summary>
    public event Action<ClientSession>? VisibilityChanged;

    /// <summary>A channel's permissions / privacy changed, or it was deleted.</summary>
    public event Action<string>? ChannelChanged;

    /// <summary>Raises <see cref="ChannelChanged"/> (a channel deleted — no permissions to broadcast).</summary>
    public void NotifyChannelChanged(string roomId) => ChannelChanged?.Invoke(roomId);

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
        Detach(session);

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

        // A private channel exists only for those who may see it.
        if (!permissions.CanSee(session.User, target.Id))
        {
            logger.LogInformation("Client {ClientId}: join refused, no access to {RoomId}", clientId, roomId);
            messenger.Send(clientId, JoinRoomResultEvent.Failed(roomId, ModerationError.NoAccess));
            return false;
        }

        if (permissions.IsBanned(session.User, target.Id))
        {
            logger.LogInformation("Client {ClientId}: join refused, banned from {RoomId}", clientId, roomId);
            messenger.Send(clientId, JoinRoomResultEvent.Failed(roomId, ModerationError.Banned));
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

        messenger.Send(clientId, JoinRoomResultEvent.Joined(RoomInfo.From(target, permissions.IsPrivate(target.Id))));

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

    /// <summary>
    /// The rooms the client is offered: every room except hidden ones (the game room) and
    /// private channels it may not see.
    /// </summary>
    public RoomListEvent BuildRoomList(uint clientId) => BuildRoomList(Get(clientId)?.User);

    private RoomListEvent BuildRoomList(UserAccount? user) => RoomListEvent.From(
        roomManager.GetAllRooms().Where(r => !r.IsHidden && permissions.CanSee(user, r.Id)),
        r => permissions.IsPrivate(r.Id));

    /// <summary>
    /// Pushes the room list to every client outside the game world. Most see the same
    /// public list (serialized once); a user who may see a private channel gets their own.
    /// </summary>
    public void BroadcastRoomList()
    {
        var privateRooms = roomManager.GetAllRooms()
            .Where(r => !r.IsHidden && permissions.IsPrivate(r.Id)).Select(r => r.Id).ToList();
        bool SeesPrivate(uint id) => privateRooms.Count > 0 && Get(id)?.User is { } user
            && privateRooms.Any(roomId => permissions.CanSee(user, roomId));

        messenger.BroadcastWhere(BuildRoomList((UserAccount?)null),
            id => !roomManager.ShouldReceiveSpatialUpdates(id) && !SeesPrivate(id));
        if (privateRooms.Count == 0)
            return;
        foreach (var session in _sessions.Values)
        {
            if (!roomManager.ShouldReceiveSpatialUpdates(session.Id) && SeesPrivate(session.Id))
                messenger.Send(session.Id, BuildRoomList(session.User));
        }
    }

    /// <summary>
    /// What a user may see changed (access to a private channel, the server-admin role,
    /// a channel deleted): their connections get the room list and every channel's
    /// permissions again, and any of them sitting in a room it may no longer see goes
    /// back to the home room.
    /// </summary>
    public void RefreshVisibility(UserAccount user)
    {
        foreach (var session in user.Sessions.ToList())
            RefreshVisibility(session);
    }

    private void RefreshVisibility(ClientSession session)
    {
        var room = roomManager.GetClientRoom(session.Id);
        if (room != null && !permissions.CanSee(session.User, room.Id))
            JoinRoom(session.Id, DefaultRoomId); // also pushes the room list
        if (!roomManager.ShouldReceiveSpatialUpdates(session.Id))
            messenger.Send(session.Id, BuildRoomList(session.User));
        if (session.User != null)
            messenger.Send(session.Id, BuildChannelPermissions(session.User));
        VisibilityChanged?.Invoke(session);
    }

    /// <summary>Moves every client in the room that may no longer see it back to the home room.</summary>
    public void EvictUnauthorized(string roomId)
    {
        var room = roomManager.GetRoom(roomId);
        if (room == null)
            return;
        foreach (var clientId in room.GetClientIds().ToList())
        {
            if (!permissions.CanSee(Get(clientId)?.User, roomId))
                JoinRoom(clientId, DefaultRoomId);
        }
        ChannelChanged?.Invoke(roomId);
    }

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
        RenameSession(session, name);

        // A user is one name: the other devices / tabs of the same user follow, or they
        // would keep showing — and chatting under — the old one.
        if (session.User is { } user)
        {
            foreach (var other in user.Sessions)
            {
                if (other != session && other.Name != name)
                    RenameSession(other, name);
            }
            user.Name = name;
            PublishPresence(user);
        }
        return name;
    }

    private void RenameSession(ClientSession session, string name)
    {
        var clientId = session.Id;
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
        if (session == null || session.User != null || session.AuthPending)
            return false;
        if (!UserDirectory.IsValidKey(userKey))
        {
            logger.LogInformation("Client {ClientId}: identify refused (malformed user key)", clientId);
            return false;
        }

        var keyHash = UserDirectory.HashKey(userKey);
        var user = users.FindByKeyHash(keyHash);

        // Not bound yet → no presence noise from the rename. An empty name keeps what a
        // known user is called.
        if (name.Length > 0)
            SetName(clientId, name);
        else if (user != null)
            SetName(clientId, user.Name);

        if (user == null)
            user = users.Create(keyHash, session.Name);
        else
            users.BindKey(keyHash, user); // re-persisted, see UserDirectory.BindKey
        Bind(session, user, keyHash);

        logger.LogInformation("Client {ClientId} identified as user {UserId}", clientId, user.Id);
        return true;
    }

    // Makes the (anonymous, already named) session a connection of the user and tells
    // everyone concerned.
    private void Bind(ClientSession session, UserAccount user, string keyHash)
    {
        user.Name = session.Name;
        user.Sessions.Add(session);
        session.User = user;
        session.KeyHash = keyHash;

        // The snapshot first (it already shows this user as online), then the update that
        // tells everyone else.
        PublishPresence(user, announce: false);
        messenger.Send(session.Id, BuildPresenceSnapshot(user));
        messenger.Send(session.Id, BuildChannelPermissions(user));
        if (push.Keys is { } pushKeys)
            messenger.Send(session.Id, new PushConfigEvent { PublicKey = pushKeys.PublicKey });
        BroadcastPresence(user, exceptClientId: session.Id);

        // The room's user list was sent before the connection had a user id.
        var room = roomManager.GetClientRoom(session.Id);
        if (room != null)
            BroadcastRoomUsers(room.Id);
        // The user may see private channels an anonymous connection does not.
        if (permissions.CreatedChannelCount > 0 && !roomManager.ShouldReceiveSpatialUpdates(session.Id))
            messenger.Send(session.Id, BuildRoomList(user));
        VisibilityChanged?.Invoke(session);
    }

    // The session stops being a connection of its user, who stays in the member list —
    // as offline, unless another of its connections (a second tab, the reconnect that
    // replaced this socket) is alive.
    private void Detach(ClientSession session)
    {
        if (session.User is not { } user)
            return;
        user.Sessions.Remove(session);
        session.User = null;
        session.KeyHash = null;
        PublishPresence(user);
    }

    // ---- accounts ---------------------------------------------------------------------

    /// <summary>
    /// Claims the session's guest user with a login and a password (see the class
    /// comment). The password is hashed off-thread; the answer follows on a later tick.
    /// </summary>
    public void ClaimAccount(uint clientId, string login, string password)
    {
        const byte action = AccountAction.Claim;
        if (BeginAccountRequest(clientId, action) is not { } session)
            return;
        if (session.User is not { } user)
        {
            Fail(session, action, AccountError.NotIdentified);
            return;
        }
        if (user.IsClaimed)
        {
            Fail(session, action, AccountError.AlreadyClaimed);
            return;
        }
        if (UserDirectory.NormalizeLogin(login) is not { } normalized)
        {
            Fail(session, action, AccountError.InvalidLogin);
            return;
        }
        if (!UserDirectory.IsValidPassword(password))
        {
            Fail(session, action, AccountError.InvalidPassword);
            return;
        }
        if (users.FindByLogin(normalized) != null || !_pendingLogins.Add(normalized))
        {
            Fail(session, action, AccountError.LoginTaken);
            return;
        }

        session.AuthPending = true;
        var iterations = options.PasswordHashIterations;
        RunOffThread(() => PasswordHasher.Hash(password, iterations), hash =>
        {
            _pendingLogins.Remove(normalized);
            if (!ReferenceEquals(Get(clientId), session))
                return; // disconnected meanwhile
            session.AuthPending = false;

            if (hash == null || session.User != user)
                Fail(session, action, AccountError.Busy);
            else if (!users.SetCredentials(user, normalized, hash))
                Fail(session, action, user.IsClaimed ? AccountError.AlreadyClaimed : AccountError.LoginTaken);
            else
            {
                logger.LogInformation("User {UserId} claimed the account \"{Login}\"", user.Id, normalized);
                Succeed(session, action);
                PublishPresence(user); // the login is public (and may make it a server admin)
            }
        });
    }

    /// <summary>
    /// Enters the claimed account <paramref name="login"/> from this connection and makes
    /// <paramref name="userKey"/> one of its keys, so later connects just identify with
    /// it. A connection that was a guest leaves that user. The password is verified
    /// off-thread; the answer (and the member list) follows on a later tick.
    /// </summary>
    public void Login(uint clientId, string login, string password, string userKey)
    {
        const byte action = AccountAction.Login;
        if (BeginAccountRequest(clientId, action) is not { } session)
            return;
        if (!UserDirectory.IsValidKey(userKey))
        {
            Fail(session, action, AccountError.InvalidKey);
            return;
        }

        var normalized = UserDirectory.NormalizeLogin(login);
        var account = normalized == null ? null : users.FindByLogin(normalized);
        if (account?.PasswordHash is not { } passwordHash || password.Length > UserDirectory.MaxPasswordLength)
        {
            Fail(session, action, AccountError.BadCredentials);
            return;
        }
        if (_loginFailures.TryGetValue(normalized!, out var streak) && Stopwatch.GetTimestamp() < streak.LockedUntil)
        {
            Fail(session, action, AccountError.TooManyAttempts);
            return;
        }

        session.AuthPending = true;
        RunOffThread(() => PasswordHasher.Verify(password, passwordHash), ok =>
        {
            if (!ok)
                RecordLoginFailure(normalized!);
            else
                _loginFailures.Remove(normalized!);

            if (!ReferenceEquals(Get(clientId), session))
                return; // disconnected meanwhile
            session.AuthPending = false;
            if (!ok)
            {
                Fail(session, action, AccountError.BadCredentials);
                return;
            }

            Detach(session); // from its guest user, if it had identified
            SetName(clientId, account.Name);
            var keyHash = UserDirectory.HashKey(userKey);
            users.BindKey(keyHash, account);
            Succeed(session, action, account.Login);
            Bind(session, account, keyHash);
            logger.LogInformation("Client {ClientId} logged in as user {UserId}", clientId, account.Id);
        });
    }

    /// <summary>
    /// Leaves the claimed account on this device: the key the connection identified with
    /// stops working and the connection becomes anonymous. (A guest cannot log out — its
    /// key is the only way back to it.)
    /// </summary>
    public void Logout(uint clientId)
    {
        const byte action = AccountAction.Logout;
        if (BeginAccountRequest(clientId, action) is not { } session)
            return;
        if (session.User is not { } user)
        {
            Fail(session, action, AccountError.NotIdentified);
            return;
        }
        if (!user.IsClaimed)
        {
            Fail(session, action, AccountError.NotClaimed);
            return;
        }

        var keyHash = session.KeyHash;
        Detach(session);
        if (keyHash != null)
        {
            users.UnbindKey(keyHash);
            push.RemoveDevice(keyHash); // this device no longer gets the account's notifications
        }

        var room = roomManager.GetClientRoom(clientId);
        if (room != null)
            BroadcastRoomUsers(room.Id); // the connection no longer has a user id
        Succeed(session, action);
        RefreshVisibility(session); // an anonymous connection sees no private channel
        logger.LogInformation("Client {ClientId} logged out of user {UserId}", clientId, user.Id);
    }

    /// <summary>Sets the user's "about me" text.</summary>
    public void UpdateProfile(uint clientId, string about)
    {
        const byte action = AccountAction.Profile;
        if (BeginAccountRequest(clientId, action) is not { } session)
            return;
        if (session.User is not { } user)
        {
            Fail(session, action, AccountError.NotIdentified);
            return;
        }

        about = InputSanitizer.Clean(about, options.MaxAboutLength);
        if (about != user.About)
        {
            user.About = about;
            users.Save(user);
            PublishPresence(user);
        }
        Succeed(session, action);
    }

    /// <summary>Sets (or, with an empty image, removes) the user's avatar.</summary>
    public void SetAvatar(uint clientId, byte[] image)
    {
        const byte action = AccountAction.Avatar;
        if (BeginAccountRequest(clientId, action) is not { } session)
            return;
        if (session.User is not { } user)
        {
            Fail(session, action, AccountError.NotIdentified);
            return;
        }

        if (image.Length == 0)
        {
            if (user.AvatarVersion != 0)
            {
                user.AvatarVersion = 0;
                users.SaveAvatar(user, null);
                users.Save(user);
                PublishPresence(user);
            }
            Succeed(session, action);
            return;
        }

        var contentType = image.Length <= options.MaxAvatarBytes ? AvatarImage.DetectContentType(image) : null;
        if (contentType == null)
        {
            Fail(session, action, AccountError.InvalidImage);
            return;
        }

        // The version is part of the image URL, which clients cache forever: it must
        // never repeat for a different image — hence time-based rather than a counter
        // (which would restart after the avatar was removed).
        var now = (uint)DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        user.AvatarVersion = Math.Max(now, user.AvatarVersion + 1);
        users.SaveAvatar(user, new StoredAvatar(contentType, image));
        users.Save(user);
        PublishPresence(user);
        Succeed(session, action);
    }

    /// <summary>Tick thread, every tick: applies the outcomes of finished password work.</summary>
    public void DeliverCompleted()
    {
        while (_completed.TryDequeue(out var complete))
            complete();
    }

    // The session if the request may be handled now; otherwise it was answered (too fast
    // / another one in flight) or the client is gone.
    private ClientSession? BeginAccountRequest(uint clientId, byte action)
    {
        var session = Get(clientId);
        if (session == null)
            return null;
        if (session.AuthPending)
        {
            Fail(session, action, AccountError.Busy);
            return null;
        }
        if (!session.TryConsumeAccountCooldown(options.AccountRequestCooldownSeconds))
        {
            Fail(session, action, AccountError.TooFast);
            return null;
        }
        return session;
    }

    private void Succeed(ClientSession session, byte action, string? login = null)
        => messenger.Send(session.Id,
            new AccountResultEvent { Action = action, Success = true, Login = login ?? session.User?.Login });

    private void Fail(ClientSession session, byte action, string error)
        => messenger.Send(session.Id,
            new AccountResultEvent { Action = action, Success = false, Error = error, Login = session.User?.Login });

    private void RecordLoginFailure(string login)
    {
        var failures = _loginFailures.GetValueOrDefault(login).Failures + 1;
        if (failures < Math.Max(1, options.LoginMaxFailures))
        {
            _loginFailures[login] = (failures, 0);
            return;
        }
        // Locked: the streak starts over once the lock expires.
        _loginFailures[login] = (0, Stopwatch.GetTimestamp() + (long)(options.LoginLockoutSeconds * Stopwatch.Frequency));
        logger.LogWarning("Login \"{Login}\" locked for {Seconds}s after repeated wrong passwords", login, options.LoginLockoutSeconds);
    }

    // Password hashing is deliberately slow (tens of ms): never on the tick thread.
    private void RunOffThread<T>(Func<T> work, Action<T?> complete)
        => Task.Run(() =>
        {
            T? result = default;
            try { result = work(); }
            catch (Exception e) { logger.LogError(e, "Password hashing failed"); }
            _completed.Enqueue(() => complete(result));
        });

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
        if (status == user.PublishedStatus && roomId == user.PublishedRoomId && user.Name == user.PublishedName
            && user.About == user.PublishedAbout && user.AvatarVersion == user.PublishedAvatarVersion
            && user.Login == user.PublishedLogin && user.IsAdmin == user.PublishedIsAdmin)
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
        user.PublishedAbout = user.About;
        user.PublishedAvatarVersion = user.AvatarVersion;
        user.PublishedLogin = user.Login;
        user.PublishedIsAdmin = user.IsAdmin;

        if (announce)
            BroadcastPresence(user);
    }

    /// <summary>Announces a change of the user's profile / role made outside this class.</summary>
    public void RefreshPresence(UserAccount user) => PublishPresence(user);

    private void BroadcastPresence(UserAccount user, uint exceptClientId = 0)
        => messenger.BroadcastWhere(
            new PresenceUpdateEvent { User = PresenceOf(user) },
            id => id != exceptClientId && _sessions.TryGetValue(id, out var s) && s.User != null);

    /// <summary>Sends to every connection bound to a user (whatever room it is in).</summary>
    public void BroadcastToIdentified<TEvent>(TEvent evt) where TEvent : IServerEvent
        => messenger.BroadcastWhere(evt, id => _sessions.TryGetValue(id, out var s) && s.User != null);

    // Every channel's permissions the user may see, for a connection that just identified.
    private ChannelPermissionsEvent BuildChannelPermissions(UserAccount user) => new()
    {
        Reset = true,
        Channels = roomManager.GetAllRooms().OrderBy(r => r.Order)
            .Where(r => permissions.CanSee(user, r.Id))
            .Select(r => permissions.Describe(r.Id)).ToList(),
    };

    /// <summary>Sends a channel's permissions to every identified connection that may see it.</summary>
    public void BroadcastChannelPermissions(string roomId)
    {
        var evt = new ChannelPermissionsEvent { Channels = [permissions.Describe(roomId)] };
        messenger.BroadcastWhere(evt,
            id => _sessions.TryGetValue(id, out var s) && s.User != null && permissions.CanSee(s.User, roomId));
        ChannelChanged?.Invoke(roomId);
    }

    /// <summary>Sends to every identified connection that may see the channel.</summary>
    public void BroadcastToChannelViewers<TEvent>(string roomId, TEvent evt) where TEvent : IServerEvent
        => messenger.BroadcastWhere(evt,
            id => _sessions.TryGetValue(id, out var s) && s.User != null && permissions.CanSee(s.User, roomId));

    /// <summary>Every connection (tick thread).</summary>
    public IEnumerable<ClientSession> Sessions => _sessions.Values;

    // Where the user is: the room of an active connection if there is one. A private
    // channel is not told (presence goes to everyone).
    private string? PresenceRoomId(UserAccount user)
    {
        var roomId = ActiveRoomId(user);
        return roomId != null && permissions.IsPrivate(roomId) ? null : roomId;
    }

    private string? ActiveRoomId(UserAccount user)
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
        About = user.PublishedAbout,
        AvatarVersion = user.PublishedAvatarVersion,
        Login = user.PublishedLogin,
        IsAdmin = user.PublishedIsAdmin,
    };

    // Everyone online, plus the most recently seen offline users (bounded: the directory
    // remembers far more users than a member list should show).
    private PresenceSnapshotEvent BuildPresenceSnapshot(UserAccount self)
    {
        var snapshot = new PresenceSnapshotEvent { YourUserId = self.Id, YourLogin = self.Login };
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

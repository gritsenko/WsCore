using System.Text.RegularExpressions;
using Game.ServerLogic.Chat.Events;
using Game.ServerLogic.Moderation.Events;
using WsServer.Abstract;
using WsServer.Chat;
using WsServer.Rooms;
using WsServer.Sessions;

namespace WsServer.Moderation;

/// <summary>
/// Roles and permissions, Telegram-style but per channel (room) instead of per group:
/// server admins, channel admins with a set of <see cref="ChannelRights"/> and a title,
/// channel-wide member permissions and per-user restrictions (mute / no links / ban, for
/// a while or forever), plus deleting chat messages.
///
/// Rules (the same a Telegram group applies to its admins):
///  * Admin roles need a claimed account; a guest is one browser's key, not a person.
///  * Granting: AddAdmins, and only rights one has oneself; an admin with rights one does
///    not have cannot be changed. Nobody changes their own role, except a server admin
///    (e.g. their own title). Only a server admin touches another server admin.
///  * Restricting: RestrictMembers, never an admin (demote first), never oneself. The home
///    room cannot ban (every connection lands there) — it can only mute.
///  * Deleting: one's own message (while it is in the in-memory window), anyone's with
///    DeleteMessages.
///  * Channels (= rooms): a server admin creates, renames, makes private / public and
///    deletes channels (built-in rooms stay as they are). Access to a private channel is
///    given / taken with InviteUsers; whoever loses sight of a channel while inside goes
///    back to the home room.
///
/// Every change goes to every identified connection as a <see cref="ChannelPermissionsEvent"/>
/// (server-admin changes travel with presence); the requester also gets a
/// <see cref="ModerationResultEvent"/>. Tick thread only.
/// </summary>
public sealed partial class ModerationService(
    SessionManager sessions,
    UserDirectory users,
    ChannelPermissions permissions,
    RoomManager roomManager,
    ChatHistoryService history,
    IGameMessenger messenger,
    GameServerOptions options,
    ILogger<ModerationService> logger)
{
    // ---- chat -------------------------------------------------------------------------

    /// <summary>
    /// Whether the session may post <paramref name="text"/> in the room; if not, the sender
    /// is told why (a ModerationResultEvent for <see cref="ModerationAction.SendMessage"/>).
    /// </summary>
    public bool CheckCanSend(ClientSession session, string roomId, string text)
    {
        var user = session.User;
        string? error = null;
        if (permissions.IsBanned(user, roomId))
            error = ModerationError.Banned;
        else
        {
            var allowed = permissions.PermissionsOf(user, roomId);
            if ((allowed & MemberPermissions.SendMessages) == 0)
                error = ModerationError.Muted;
            else if ((allowed & MemberPermissions.SendLinks) == 0 && ContainsLink(text))
                error = ModerationError.LinksForbidden;
        }

        if (error == null)
            return true;
        Fail(session.Id, ModerationAction.SendMessage, error);
        return false;
    }

    /// <summary>
    /// A link, as far as "may send links" is concerned: a URL scheme, "www.", or a word
    /// ending in a common top-level domain. Deliberately simple — it is a speed bump.
    /// </summary>
    public static bool ContainsLink(string text) => LinkPattern().IsMatch(text);

    [GeneratedRegex(@"(https?://|www\.|\b[\p{L}\d-]+\.(com|net|org|ru|su|рф|io|me|gg|tv|xyz|dev|app|info|co|ly|ua|by|kz)\b)",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex LinkPattern();

    public void DeleteMessage(uint clientId, string roomId, uint messageId)
    {
        const byte action = ModerationAction.DeleteMessage;
        if (Begin(clientId, action) is not { } actor)
            return;
        if (roomManager.GetRoom(roomId) == null)
        {
            Fail(clientId, action, ModerationError.NoChannel);
            return;
        }

        var message = history.Find(roomId, messageId);
        var own = message != null && message.UserId != 0 && message.UserId == actor.Id;
        if (!own && !permissions.Has(actor, roomId, ChannelRights.DeleteMessages))
        {
            // Not in the in-memory window: the author is unknown without a database round
            // trip, so only a moderator may delete such an old message.
            Fail(clientId, action, message == null ? ModerationError.NoMessage : ModerationError.Forbidden);
            return;
        }

        history.Delete(roomId, messageId);
        messenger.Broadcast(new ChatMessageDeletedEvent { RoomId = roomId, MessageId = messageId });
        Succeed(clientId, action);
        if (!own)
            logger.LogInformation("User {UserId} deleted message {MessageId} in {RoomId}", actor.Id, messageId, roomId);
    }

    // ---- roles ------------------------------------------------------------------------

    public void SetAdmin(uint clientId, string roomId, uint userId, byte rights, string title)
    {
        const byte action = ModerationAction.SetAdmin;
        if (Begin(clientId, action) is not { } actor)
            return;
        if (roomManager.GetRoom(roomId) == null)
        {
            Fail(clientId, action, ModerationError.NoChannel);
            return;
        }
        if (users.FindById(userId) is not { } target)
        {
            Fail(clientId, action, ModerationError.NoUser);
            return;
        }

        rights &= ChannelRights.All;
        var actorRights = permissions.RightsOf(actor, roomId);
        var targetRights = permissions.Member(roomId, userId)?.AdminRights ?? 0;
        string? error = null;
        if ((actorRights & ChannelRights.AddAdmins) == 0)
            error = ModerationError.Forbidden;
        else if (target == actor && !actor.IsAdmin)
            error = ModerationError.Self;
        else if (target.IsAdmin && !actor.IsAdmin)
            error = ModerationError.Forbidden;
        else if ((rights & ~actorRights) != 0 || (targetRights & ~actorRights) != 0)
            error = ModerationError.Forbidden; // granting / changing more than one has
        else if (rights != 0 && !target.IsClaimed)
            error = ModerationError.NotClaimed;
        if (error != null)
        {
            Fail(clientId, action, error);
            return;
        }

        permissions.SetAdmin(roomId, userId, rights, InputSanitizer.Clean(title, options.MaxAdminTitleLength));
        BroadcastChannel(roomId);
        // Admins see a private channel: being promoted / demoted there changes that.
        if (permissions.IsPrivate(roomId))
            sessions.RefreshVisibility(target);
        Succeed(clientId, action);
        logger.LogInformation("User {ActorId} set the rights of user {UserId} in {RoomId} to {Rights}",
            actor.Id, userId, roomId, rights);
    }

    public void Restrict(uint clientId, string roomId, uint userId, byte denied, bool banned, uint durationSeconds)
    {
        const byte action = ModerationAction.Restrict;
        if (Begin(clientId, action) is not { } actor)
            return;
        if (roomManager.GetRoom(roomId) == null)
        {
            Fail(clientId, action, ModerationError.NoChannel);
            return;
        }
        if (users.FindById(userId) is not { } target)
        {
            Fail(clientId, action, ModerationError.NoUser);
            return;
        }

        string? error = null;
        if (!permissions.Has(actor, roomId, ChannelRights.RestrictMembers))
            error = ModerationError.Forbidden;
        else if (target == actor)
            error = ModerationError.Self;
        else if (permissions.RightsOf(target, roomId) != 0)
            error = ModerationError.TargetIsAdmin;
        else if (banned && roomId == SessionManager.DefaultRoomId)
            error = ModerationError.HomeRoom;
        if (error != null)
        {
            Fail(clientId, action, error);
            return;
        }

        var untilMs = durationSeconds == 0 ? 0 : permissions.NowMs() + durationSeconds * 1000L;
        permissions.SetRestriction(roomId, userId, denied, banned, untilMs);
        BroadcastChannel(roomId);
        Succeed(clientId, action);
        logger.LogInformation("User {ActorId} restricted user {UserId} in {RoomId} (denied {Denied}, banned {Banned}, {Seconds}s)",
            actor.Id, userId, roomId, denied, banned, durationSeconds);

        // A ban takes effect at once: whoever is inside goes back to the home room.
        if (banned)
        {
            foreach (var session in target.Sessions.ToList())
            {
                if (roomManager.GetClientRoom(session.Id)?.Id == roomId)
                    sessions.JoinRoom(session.Id, SessionManager.DefaultRoomId);
            }
        }
    }

    public void SetDefaults(uint clientId, string roomId, byte defaultPermissions)
    {
        const byte action = ModerationAction.SetDefaults;
        if (Begin(clientId, action) is not { } actor)
            return;
        if (roomManager.GetRoom(roomId) == null)
        {
            Fail(clientId, action, ModerationError.NoChannel);
            return;
        }
        if (!permissions.Has(actor, roomId, ChannelRights.RestrictMembers))
        {
            Fail(clientId, action, ModerationError.Forbidden);
            return;
        }

        permissions.SetDefaults(roomId, defaultPermissions);
        BroadcastChannel(roomId);
        Succeed(clientId, action);
        logger.LogInformation("User {ActorId} set the default permissions of {RoomId} to {Permissions}",
            actor.Id, roomId, defaultPermissions);
    }

    public void SetServerAdmin(uint clientId, uint userId, bool isAdmin)
    {
        const byte action = ModerationAction.SetServerAdmin;
        if (Begin(clientId, action) is not { } actor)
            return;
        if (users.FindById(userId) is not { } target)
        {
            Fail(clientId, action, ModerationError.NoUser);
            return;
        }

        string? error = null;
        if (!actor.IsAdmin)
            error = ModerationError.Forbidden;
        else if (target == actor)
            error = ModerationError.Self; // nobody locks themselves out
        else if (isAdmin && !target.IsClaimed)
            error = ModerationError.NotClaimed;
        else if (!isAdmin && users.IsConfiguredAdmin(target))
            error = ModerationError.Configured;
        if (error != null)
        {
            Fail(clientId, action, error);
            return;
        }

        if (target.IsAdmin != isAdmin)
        {
            target.IsAdmin = isAdmin;
            users.Save(target);
            sessions.RefreshPresence(target);
            sessions.RefreshVisibility(target); // server admins see every private channel
        }
        Succeed(clientId, action);
        logger.LogInformation("User {ActorId} {Change} user {UserId} as server admin",
            actor.Id, isAdmin ? "appointed" : "removed", userId);
    }

    // ---- channels ---------------------------------------------------------------------

    public void CreateChannel(uint clientId, string name, bool isPrivate)
    {
        const byte action = ModerationAction.CreateChannel;
        if (Begin(clientId, action) is not { } actor)
            return;
        name = InputSanitizer.Clean(name, options.MaxChannelNameLength);
        string? error = null;
        if (!actor.IsAdmin)
            error = ModerationError.Forbidden;
        else if (name.Length == 0)
            error = ModerationError.BadName;
        else if (permissions.CreatedChannelCount >= options.MaxCreatedChannels)
            error = ModerationError.TooMany;
        if (error != null)
        {
            Fail(clientId, action, error);
            return;
        }

        var roomId = NewChannelId();
        permissions.CreateChannel(roomId, name, isPrivate);
        GameServer.CreateChannelRoom(roomManager, roomId, name);
        sessions.BroadcastRoomList();
        BroadcastChannel(roomId);
        Succeed(clientId, action, roomId);
        logger.LogInformation("User {ActorId} created {Kind} channel {RoomId}",
            actor.Id, isPrivate ? "a private" : "a public", roomId);
    }

    public void UpdateChannel(uint clientId, string roomId, string name, bool isPrivate)
    {
        const byte action = ModerationAction.UpdateChannel;
        if (BeginCreated(clientId, action, roomId) is not { } room)
            return;
        name = InputSanitizer.Clean(name, options.MaxChannelNameLength);
        if (name.Length == 0)
        {
            Fail(clientId, action, ModerationError.BadName, roomId);
            return;
        }

        var wasPrivate = permissions.IsPrivate(roomId);
        permissions.UpdateChannel(roomId, name, isPrivate);
        room.Name = name;
        if (isPrivate && !wasPrivate)
            sessions.EvictUnauthorized(roomId);
        sessions.BroadcastRoomList();
        BroadcastChannel(roomId); // made public: that is everyone now
        Succeed(clientId, action, roomId);
        logger.LogInformation("Channel {RoomId} updated (private: {IsPrivate})", roomId, isPrivate);
    }

    public void DeleteChannel(uint clientId, string roomId)
    {
        const byte action = ModerationAction.DeleteChannel;
        if (BeginCreated(clientId, action, roomId) is not { } room)
            return;

        foreach (var id in room.GetClientIds().ToList())
            sessions.JoinRoom(id, SessionManager.DefaultRoomId);
        roomManager.RemoveRoom(roomId);
        permissions.DeleteChannel(roomId);
        history.DropRoom(roomId);
        sessions.BroadcastRoomList();
        Succeed(clientId, action, roomId);
        logger.LogInformation("Channel {RoomId} deleted", roomId);
    }

    public void SetAccess(uint clientId, string roomId, uint userId, bool hasAccess)
    {
        const byte action = ModerationAction.SetAccess;
        if (Begin(clientId, action) is not { } actor)
            return;
        if (roomManager.GetRoom(roomId) == null)
        {
            Fail(clientId, action, ModerationError.NoChannel, roomId);
            return;
        }
        if (users.FindById(userId) is not { } target)
        {
            Fail(clientId, action, ModerationError.NoUser, roomId);
            return;
        }
        if (!permissions.Has(actor, roomId, ChannelRights.InviteUsers))
        {
            Fail(clientId, action, ModerationError.Forbidden, roomId);
            return;
        }

        permissions.SetAccess(roomId, userId, hasAccess);
        BroadcastChannel(roomId);
        sessions.RefreshVisibility(target);
        Succeed(clientId, action, roomId);
        logger.LogInformation("User {ActorId} {Change} access to {RoomId} for user {UserId}",
            actor.Id, hasAccess ? "gave" : "took away", roomId, userId);
    }

    // A server admin acting on a channel created by an admin; otherwise answered.
    private Room? BeginCreated(uint clientId, byte action, string roomId)
    {
        if (Begin(clientId, action) is not { } actor)
            return null;
        string? error = null;
        var room = roomManager.GetRoom(roomId);
        if (!actor.IsAdmin)
            error = ModerationError.Forbidden;
        else if (room == null)
            error = ModerationError.NoChannel;
        else if (!room.IsCreated)
            error = ModerationError.BuiltIn;
        if (error == null)
            return room;
        Fail(clientId, action, error, roomId);
        return null;
    }

    // "c" + 10 random base-36 characters: unguessable enough not to leak a private
    // channel's existence, and never one of the built-in ids.
    private string NewChannelId()
    {
        const string alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
        while (true)
        {
            var id = "c" + string.Create(10, 0, (span, _) =>
            {
                for (var i = 0; i < span.Length; i++)
                    span[i] = alphabet[System.Security.Cryptography.RandomNumberGenerator.GetInt32(alphabet.Length)];
            });
            if (roomManager.GetRoom(id) == null)
                return id;
        }
    }

    // ---- helpers ----------------------------------------------------------------------

    // The acting user, if the request may be handled; otherwise it was answered.
    private UserAccount? Begin(uint clientId, byte action)
    {
        var session = sessions.Get(clientId);
        if (session == null)
            return null;
        if (!session.TryConsumeModerationCooldown(options.ModerationRequestCooldownSeconds))
        {
            Fail(clientId, action, ModerationError.TooFast);
            return null;
        }
        if (session.User == null)
        {
            Fail(clientId, action, ModerationError.NotIdentified);
            return null;
        }
        return session.User;
    }

    private void BroadcastChannel(string roomId) => sessions.BroadcastChannelPermissions(roomId);

    private void Succeed(uint clientId, byte action, string? roomId = null)
        => messenger.Send(clientId, new ModerationResultEvent { Action = action, Success = true, RoomId = roomId });

    private void Fail(uint clientId, byte action, string error, string? roomId = null)
        => messenger.Send(clientId, new ModerationResultEvent { Action = action, Success = false, Error = error, RoomId = roomId });
}

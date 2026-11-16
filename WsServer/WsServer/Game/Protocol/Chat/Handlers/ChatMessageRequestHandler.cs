using Game.ServerLogic.Chat.Requests;
using Microsoft.Extensions.Logging;
using WsServer;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Chat;
using WsServer.Moderation;
using WsServer.Push;
using WsServer.Rooms;
using WsServer.Sessions;

namespace Game.ServerLogic.Chat.Handlers;

public class ChatMessageRequestHandler(
    SessionManager sessions,
    RoomManager roomManager,
    IGameMessenger messenger,
    ChatHistoryService history,
    ModerationService moderation,
    PushService push,
    GameServerOptions options,
    ILogger<ChatMessageRequestHandler> logger) : RequestHandlerBase<ChatMessageRequest>
{
    protected override void Handle(uint clientId, ChatMessageRequest request)
    {
        // Chat is a session feature (works in the lobby, without an avatar); the rate
        // limit is per connection (audit §2).
        var session = sessions.Get(clientId);
        if (session == null || !session.TryConsumeChatCooldown(options.ChatCooldownSeconds))
            return;

        var room = roomManager.GetClientRoom(clientId);
        if (room == null)
            return;

        var message = InputSanitizer.Clean(request.Message, options.MaxChatLength);
        if (message.Length == 0)
            return;

        // Muted / banned / no links in this channel: the sender is told why.
        if (!moderation.CheckCanSend(session, room.Id, message))
            return;

        // Recorded first (id + timestamp assigned, cached, queued for the database), then
        // sent. Rooms have separate chats: only the sender's room hears it (sender included).
        var evt = history.Append(room.Id, clientId, session.User?.Id ?? 0, session.Name, message);
        messenger.BroadcastToRoom(room.Id, evt);
        // Users who are not looking (offline / away) get a Web Push notification.
        push.NotifyChat(room.Id, room.Name, evt.Id, evt.UserId, session.Name, message, (long)evt.SentAtMs);
        // Log length only — never raw user content — to avoid log injection (audit §2).
        logger.LogInformation("Client {ClientId} wrote to {RoomId} chat ({Length} chars)", clientId, room.Id, message.Length);
    }
}

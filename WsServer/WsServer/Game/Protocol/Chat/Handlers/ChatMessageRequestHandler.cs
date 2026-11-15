using Game.ServerLogic.Chat.Requests;
using Microsoft.Extensions.Logging;
using WsServer;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Chat;
using WsServer.Rooms;
using WsServer.Sessions;

namespace Game.ServerLogic.Chat.Handlers;

public class ChatMessageRequestHandler(
    SessionManager sessions,
    RoomManager roomManager,
    IGameMessenger messenger,
    ChatHistoryService history,
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

        // Recorded first (id + timestamp assigned, cached, queued for the database), then
        // sent. Rooms have separate chats: only the sender's room hears it (sender included).
        var evt = history.Append(room.Id, clientId, session.User?.Id ?? 0, session.Name, message);
        messenger.BroadcastToRoom(room.Id, evt);
        // Log length only — never raw user content — to avoid log injection (audit §2).
        logger.LogInformation("Client {ClientId} wrote to {RoomId} chat ({Length} chars)", clientId, room.Id, message.Length);
    }
}

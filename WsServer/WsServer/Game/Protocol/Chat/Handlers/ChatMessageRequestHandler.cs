using Game.Core;
using Game.ServerLogic.Chat.Events;
using Game.ServerLogic.Chat.Requests;
using Microsoft.Extensions.Logging;
using WsServer;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Chat.Handlers;

public class ChatMessageRequestHandler(GameModel gameModel, IGameMessenger messenger, GameServerOptions options, ILogger<ChatMessageRequestHandler> logger) : RequestHandlerBase<ChatMessageRequest>
{
    protected override void Handle(uint clientId, ChatMessageRequest request)
    {
        var player = gameModel.GetPlayer(clientId);
        if (player == null || !player.TryConsumeChatCooldown()) // rate limit (audit §2)
            return;

        var message = InputSanitizer.Clean(request.Message, options.MaxChatLength);
        if (message.Length == 0)
            return;

        messenger.Broadcast(new ChatMessageEvent(clientId, message));
        // Log length only — never raw user content — to avoid log injection (audit §2).
        logger.LogInformation("Player {ClientId} wrote to chat ({Length} chars)", clientId, message.Length);
    }
}
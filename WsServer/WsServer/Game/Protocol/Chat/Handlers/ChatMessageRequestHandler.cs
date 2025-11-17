using Game.ServerLogic.Chat.Events;
using Game.ServerLogic.Chat.Requests;
using Microsoft.Extensions.Logging;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Chat.Handlers;

public class ChatMessageRequestHandler(IGameMessenger messenger, ILogger<ChatMessageRequestHandler> logger) : RequestHandlerBase<ChatMessageRequest>
{
    protected override void Handle(uint clientId, ChatMessageRequest request)
    {
        messenger.Broadcast(new ChatMessageEvent(clientId, request.Message));
        logger.LogInformation($"Player {clientId} wrote to chat: {request.Message}");
    }
}
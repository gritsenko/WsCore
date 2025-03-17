using Game.ServerLogic.Chat.Events;
using Game.ServerLogic.Chat.Requests;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Common;

namespace Game.ServerLogic.Chat.Handlers;

public class ChatMessageRequestHandler(IGameMessenger messenger) : RequestHandlerBase<ChatMessageRequest>
{
    protected override void Handle(uint clientId, ChatMessageRequest request)
    {
        messenger.Broadcast(new ChatMessageEvent(clientId, request.Message));
        Logger.Log($"Player {clientId} wrote to chat: {request.Message}");
    }
}
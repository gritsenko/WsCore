using Game.ServerLogic.Chat.Events;
using Game.ServerLogic.Chat.Requests;
using WsServer.Common;

namespace Game.ServerLogic.Chat.Handlers;

public class ChatClientMessageHandler() : MessageHandlerBase<ChatMessageRequest>
{
    protected override void Handle(uint clientId, ChatMessageRequest messageRequest)
    {
        Messenger.Broadcast(new ChatEventEvent(clientId, messageRequest.Message));
        Logger.Log($"Player {clientId} wrote to chat: {messageRequest.Message}");
    }
}
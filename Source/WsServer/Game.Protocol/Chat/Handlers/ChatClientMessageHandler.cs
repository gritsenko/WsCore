using Game.ServerLogic.Chat.Requests;
using WsServer.Common;

namespace Game.ServerLogic.Chat.Handlers;

public class ChatClientMessageHandler() : MessageHandlerBase<ChatMessageRequest>
{
    protected override void Handle(uint clientId, ChatMessageRequest messageRequest)
    {
        Messenger.Broadcast(new ChatServerMessage(clientId, messageRequest.Message));
        Logger.Log($"Player {clientId} wrote to chat: {messageRequest.Message}");
    }
}
using Game.Protocol.Chat.Requests;
using Game.Protocol.ServerMessages;
using WsServer.Common;

namespace Game.Protocol.Chat.Handlers;

public class ChatClientMessageHandler() : MessageHandlerBase<ChatMessageRequest>
{
    protected override void Handle(uint clientId, ChatMessageRequest messageRequest)
    {
        Messenger.Broadcast(new ChatServerMessage(clientId, messageRequest.Message));
        Logger.Log($"Player {clientId} wrote to chat: {messageRequest.Message}");
    }
}
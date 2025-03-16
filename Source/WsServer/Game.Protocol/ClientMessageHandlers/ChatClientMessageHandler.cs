using Game.Protocol.ClientMessages;
using Game.Protocol.ServerMessages;
using WsServer.Common;

namespace Game.Protocol.ClientMessageHandlers;

public class ChatClientMessageHandler() : MessageHandlerBase<ChatClientMessage>
{
    protected override void Handle(uint clientId, ChatClientMessage clientMessage)
    {
        Messenger.Broadcast(new ChatServerMessage(clientId, clientMessage.Message));
        Logger.Log($"Player {clientId} wrote to chat: {clientMessage.Message}");
    }
}
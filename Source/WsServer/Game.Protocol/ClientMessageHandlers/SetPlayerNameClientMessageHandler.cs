using Game.Protocol.ClientMessages;
using Game.Protocol.ServerMessages;
using WsServer.Common;

namespace Game.Protocol.ClientMessageHandlers;

public class SetPlayerNameClientMessageHandler() : MessageHandlerBase<SetPlayerNameClientMessage>
{
    protected override void Handle(uint clientId, SetPlayerNameClientMessage clientMessage)
    {
        Game.SetPlayerName(clientId, clientMessage.Name);
        Messenger.Broadcast(new SetPlayerNameServerMessage(clientId, clientMessage.Name));
        Logger.Log($"Player {clientId} set name: {clientMessage.Name}");
    }
}
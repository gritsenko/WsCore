using Game.Protocol.Player.Requests;
using Game.Protocol.ServerMessages;
using WsServer.Common;

namespace Game.Protocol.Player.Handlers;

public class SetPlayerNameClientMessageHandler() : MessageHandlerBase<SetPlayerNameRequest>
{
    protected override void Handle(uint clientId, SetPlayerNameRequest request)
    {
        Game.SetPlayerName(clientId, request.Name);
        Messenger.Broadcast(new SetPlayerNameServerMessage(clientId, request.Name));
        Logger.Log($"Player {clientId} set name: {request.Name}");
    }
}
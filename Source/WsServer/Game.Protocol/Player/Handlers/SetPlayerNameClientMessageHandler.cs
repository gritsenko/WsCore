using Game.ServerLogic.Player.Requests;
using WsServer.Common;

namespace Game.ServerLogic.Player.Handlers;

public class SetPlayerNameClientMessageHandler() : MessageHandlerBase<SetPlayerNameRequest>
{
    protected override void Handle(uint clientId, SetPlayerNameRequest request)
    {
        Game.SetPlayerName(clientId, request.Name);
        Messenger.Broadcast(new SetPlayerNameServerMessage(clientId, request.Name));
        Logger.Log($"Player {clientId} set name: {request.Name}");
    }
}
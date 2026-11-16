using Game.ServerLogic.Chat.Requests;
using WsServer.Abstract.Messages;
using WsServer.Moderation;

namespace Game.ServerLogic.Chat.Handlers;

public class DeleteChatMessageRequestHandler(ModerationService moderation) : RequestHandlerBase<DeleteChatMessageRequest>
{
    protected override void Handle(uint clientId, DeleteChatMessageRequest request)
        => moderation.DeleteMessage(clientId, request.RoomId ?? string.Empty, request.MessageId);
}

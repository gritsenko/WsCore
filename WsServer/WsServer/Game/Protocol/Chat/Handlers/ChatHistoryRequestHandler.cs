using Game.ServerLogic.Chat.Requests;
using WsServer.Abstract.Messages;
using WsServer.Chat;
using WsServer.Rooms;
using WsServer.Sessions;

namespace Game.ServerLogic.Chat.Handlers;

/// <summary>
/// Serves a page of the client's current room history. Catch-ups and recent pages come
/// straight from the in-memory window; only deep scroll-back reaches the database (off
/// the tick thread — the answer is sent on a later tick).
/// </summary>
public class ChatHistoryRequestHandler(
    SessionManager sessions,
    RoomManager roomManager,
    ChatHistoryService history) : RequestHandlerBase<ChatHistoryRequest>
{
    protected override void Handle(uint clientId, ChatHistoryRequest request)
    {
        var session = sessions.Get(clientId);
        var room = roomManager.GetClientRoom(clientId);
        if (session == null || room == null)
            return;

        var sameEpoch = request.Epoch == history.Epoch;
        if (sameEpoch && request.BeforeId != 0)
            history.SendBefore(session, room.Id, request.BeforeId);
        else
            history.SendLatest(clientId, room.Id, sameEpoch ? request.AfterId : 0);
    }
}

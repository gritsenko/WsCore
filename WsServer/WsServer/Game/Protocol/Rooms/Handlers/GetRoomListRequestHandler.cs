using Game.ServerLogic.Rooms.Requests;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Sessions;

namespace Game.ServerLogic.Rooms.Handlers;

/// <summary>Replies with the full room list (the client's only source of rooms).</summary>
public class GetRoomListRequestHandler(SessionManager sessions, IGameMessenger messenger) : RequestHandlerBase<GetRoomListRequest>
{
    protected override void Handle(uint clientId, GetRoomListRequest request)
        => messenger.Send(clientId, sessions.BuildRoomList(clientId));
}

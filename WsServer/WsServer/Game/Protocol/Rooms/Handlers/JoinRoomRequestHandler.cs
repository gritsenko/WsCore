using Game.ServerLogic.Rooms.Requests;
using WsServer.Abstract.Messages;
using WsServer.Sessions;

namespace Game.ServerLogic.Rooms.Handlers;

/// <summary>
/// Joins the requested room. The client is answered with a JoinRoomResultEvent (success
/// or failure); entering / leaving a spatial room also spawns / removes its avatar. See
/// <see cref="SessionManager.JoinRoom"/>.
/// </summary>
public class JoinRoomRequestHandler(SessionManager sessions) : RequestHandlerBase<JoinRoomRequest>
{
    protected override void Handle(uint clientId, JoinRoomRequest request)
        => sessions.JoinRoom(clientId, request.RoomId ?? string.Empty);
}

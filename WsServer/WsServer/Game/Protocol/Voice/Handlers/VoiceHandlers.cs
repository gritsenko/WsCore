using Game.ServerLogic.Voice.Requests;
using WsServer.Abstract.Messages;
using WsServer.Voice;

namespace Game.ServerLogic.Voice.Handlers;

public class VoiceJoinRequestHandler(VoiceService voice) : RequestHandlerBase<VoiceJoinRequest>
{
    protected override void Handle(uint clientId, VoiceJoinRequest request)
        => voice.Join(clientId, request.RoomId ?? string.Empty);
}

public class VoiceLeaveRequestHandler(VoiceService voice) : RequestHandlerBase<VoiceLeaveRequest>
{
    protected override void Handle(uint clientId, VoiceLeaveRequest request) => voice.Leave(clientId);
}

public class VoiceSignalRequestHandler(VoiceService voice) : RequestHandlerBase<VoiceSignalRequest>
{
    protected override void Handle(uint clientId, VoiceSignalRequest request)
        => voice.Relay(clientId, request.TargetClientId, request.Kind, request.Data ?? string.Empty);
}

public class VoiceStateRequestHandler(VoiceService voice) : RequestHandlerBase<VoiceStateRequest>
{
    protected override void Handle(uint clientId, VoiceStateRequest request)
        => voice.SetState(clientId, request.Muted, request.Deafened);
}

using Game.ServerLogic.Moderation.Requests;
using WsServer.Abstract.Messages;
using WsServer.Moderation;

namespace Game.ServerLogic.Moderation.Handlers;

public class SetChannelAdminRequestHandler(ModerationService moderation) : RequestHandlerBase<SetChannelAdminRequest>
{
    protected override void Handle(uint clientId, SetChannelAdminRequest request)
        => moderation.SetAdmin(clientId, request.RoomId ?? string.Empty, request.UserId, request.Rights,
            request.Title ?? string.Empty);
}

public class SetChannelRestrictionRequestHandler(ModerationService moderation) : RequestHandlerBase<SetChannelRestrictionRequest>
{
    protected override void Handle(uint clientId, SetChannelRestrictionRequest request)
        => moderation.Restrict(clientId, request.RoomId ?? string.Empty, request.UserId, request.Denied,
            request.Banned, request.DurationSeconds);
}

public class SetChannelDefaultsRequestHandler(ModerationService moderation) : RequestHandlerBase<SetChannelDefaultsRequest>
{
    protected override void Handle(uint clientId, SetChannelDefaultsRequest request)
        => moderation.SetDefaults(clientId, request.RoomId ?? string.Empty, request.DefaultPermissions);
}

public class SetServerAdminRequestHandler(ModerationService moderation) : RequestHandlerBase<SetServerAdminRequest>
{
    protected override void Handle(uint clientId, SetServerAdminRequest request)
        => moderation.SetServerAdmin(clientId, request.UserId, request.IsAdmin);
}

public class CreateChannelRequestHandler(ModerationService moderation) : RequestHandlerBase<CreateChannelRequest>
{
    protected override void Handle(uint clientId, CreateChannelRequest request)
        => moderation.CreateChannel(clientId, request.Name ?? string.Empty, request.IsPrivate, request.IsVoice);
}

public class UpdateChannelRequestHandler(ModerationService moderation) : RequestHandlerBase<UpdateChannelRequest>
{
    protected override void Handle(uint clientId, UpdateChannelRequest request)
        => moderation.UpdateChannel(clientId, request.RoomId ?? string.Empty, request.Name ?? string.Empty,
            request.IsPrivate);
}

public class DeleteChannelRequestHandler(ModerationService moderation) : RequestHandlerBase<DeleteChannelRequest>
{
    protected override void Handle(uint clientId, DeleteChannelRequest request)
        => moderation.DeleteChannel(clientId, request.RoomId ?? string.Empty);
}

public class SetChannelAccessRequestHandler(ModerationService moderation) : RequestHandlerBase<SetChannelAccessRequest>
{
    protected override void Handle(uint clientId, SetChannelAccessRequest request)
        => moderation.SetAccess(clientId, request.RoomId ?? string.Empty, request.UserId, request.HasAccess);
}

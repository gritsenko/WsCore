using Game.ServerLogic.Account.Requests;
using WsServer.Abstract.Messages;
using WsServer.Sessions;

namespace Game.ServerLogic.Account.Handlers;

public class ClaimAccountRequestHandler(SessionManager sessions) : RequestHandlerBase<ClaimAccountRequest>
{
    protected override void Handle(uint clientId, ClaimAccountRequest request)
        => sessions.ClaimAccount(clientId, request.Login ?? string.Empty, request.Password ?? string.Empty);
}

public class LoginRequestHandler(SessionManager sessions) : RequestHandlerBase<LoginRequest>
{
    protected override void Handle(uint clientId, LoginRequest request)
        => sessions.Login(clientId, request.Login ?? string.Empty, request.Password ?? string.Empty,
            request.UserKey ?? string.Empty);
}

public class LogoutRequestHandler(SessionManager sessions) : RequestHandlerBase<LogoutRequest>
{
    protected override void Handle(uint clientId, LogoutRequest request) => sessions.Logout(clientId);
}

public class UpdateProfileRequestHandler(SessionManager sessions) : RequestHandlerBase<UpdateProfileRequest>
{
    protected override void Handle(uint clientId, UpdateProfileRequest request)
        => sessions.UpdateProfile(clientId, request.About ?? string.Empty);
}

public class SetAvatarRequestHandler(SessionManager sessions) : RequestHandlerBase<SetAvatarRequest>
{
    protected override void Handle(uint clientId, SetAvatarRequest request)
        => sessions.SetAvatar(clientId, request.Image ?? []);
}

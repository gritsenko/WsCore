namespace Game.Protocol;

public class ServerMessageTypeAttribute(ServerMessageType serverMessageType) : Attribute
{
    public ServerMessageType ServerMessageType { get; } = serverMessageType;
}
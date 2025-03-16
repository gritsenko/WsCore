namespace Game.Protocol;

public class ClientMessageTypeAttribute(ClientMessageType clientMessageType) : Attribute
{
    public ClientMessageType ClientMessageType { get; } = clientMessageType;
}
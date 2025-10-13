namespace WsServer.Abstract.Messages;

public interface IMessageType
{
    static abstract byte TypeId { get; }
}
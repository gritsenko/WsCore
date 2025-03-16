namespace WsServer.Abstract;

public interface IMessageType
{
    static abstract byte TypeId { get; }
}
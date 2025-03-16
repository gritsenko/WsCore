namespace WsServer.Abstract;

public interface IServerMessage
{
    static abstract byte TypeId { get; }
}
namespace WsServer.Abstract.Messages;

public interface IMessageDataWriter
{
    void Write(IWriteDestination dest, object data);
}
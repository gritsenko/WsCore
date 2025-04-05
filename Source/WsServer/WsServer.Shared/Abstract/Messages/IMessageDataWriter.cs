using WsServer.Common;

namespace WsServer.Abstract.Messages;

public interface IMessageDataWriter<in TData>: IMessageDataWriter where TData : IMessageData
{
    void Write(MyBuffer destBuffer, TData data);
}
public interface IMessageDataWriter;
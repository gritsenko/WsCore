using System;
using WsServer.Common;

namespace WsServer.Abstract.Messages;

public interface IMessageDataWriter
{
    public void SetMessageDataWriterProvider(Func<Type, IMessageDataWriter> messageDataProvider);
    void Write(MyBuffer buff, object data);
}
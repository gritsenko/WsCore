namespace WsServer.Abstract.Messages;

public abstract class MessageDataWriterBase<TMessageData> : MessageDataWriterBase where TMessageData : IMessageData
{
    public abstract void Write(IWriteDestination dest, TMessageData data);

    public override void Write(IWriteDestination dest, object data) => Write(dest, (TMessageData)data);
}

public abstract class MessageDataWriterBase : IMessageDataWriter
{
    public abstract void Write(IWriteDestination dest, object data);
}

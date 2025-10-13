namespace WsServer.DataBuffer.Abstract;

public abstract class DataBufferBufferWriterBase<TMessageData> : DataBufferBufferWriterBase where TMessageData : IBufferSerializableData
{
    public abstract void Write(IDataBuffer dest, TMessageData data);

    public override void Write(IDataBuffer dest, object data) => Write(dest, (TMessageData)data);
}

public abstract class DataBufferBufferWriterBase : IDataBufferWriter
{
    public abstract void Write(IDataBuffer dest, object data);
}

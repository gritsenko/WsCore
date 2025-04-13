namespace WsServer.DataBuffer.Abstract;

public interface IDataBufferWriter
{
    void Write(IDataBuffer dest, object data);
}
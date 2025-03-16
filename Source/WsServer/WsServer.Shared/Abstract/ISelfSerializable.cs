using WsServer.Common;

namespace WsServer.Abstract;

public interface ISelfSerializable
{
    void WriteToBuffer(MyBuffer buffer);
}
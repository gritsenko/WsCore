using WsServer.DataBuffer.Abstract;

namespace WsServer.Abstract.Messages;

public interface IServerEvent : IMessageType, IBufferSerializableData;
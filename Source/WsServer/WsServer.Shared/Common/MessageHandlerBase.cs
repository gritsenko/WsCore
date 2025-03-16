using System;
using System.Runtime.InteropServices;
using WsServer.Abstract;

namespace WsServer.Common;

public abstract class MessageHandlerBase<T> : MessageHandlerBase
    where T : struct, IClientRequest
{
    protected abstract void Handle(uint clientId, T clientMessage);

    public override bool Handle(uint clientId, byte[] buffer, int count)
    {
        var clientMessage = DecodeToMessage<T>(buffer, count);
        Handle(clientId, clientMessage);
        return true;
    }
}

public abstract class MessageHandlerBase : IMessageHandler
{
    protected IGameMessenger Messenger;
    protected IGameServer GameServer;

    public abstract bool Handle(uint clientId, byte[] buffer, int count);

    public void Initialize(IGameServer gameServer, IGameMessenger messenger)
    {
        this.GameServer = gameServer;
        this.Messenger = messenger;
    }

    protected virtual T DecodeToMessage<T>(byte[] buffer, int count) where  T : struct 
    {
        var subbuf = new ArraySegment<byte>(buffer, 1, count);
        var msg = ByteArrayToStructure<T>(subbuf.ToArray());
        return msg;
    }

    static T ByteArrayToStructure<T>(byte[] bytes) where T : struct
    {
        var handle = GCHandle.Alloc(bytes, GCHandleType.Pinned);
        var result = (T)Marshal.PtrToStructure(handle.AddrOfPinnedObject(), typeof(T));
        handle.Free();
        return result;
    }
}

public delegate void MessageHandlerMethod(uint clientId, IClientRequest msg);
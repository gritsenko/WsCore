using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using WsServer.Abstract;

namespace WsServer.Common;

public class CommonMessageHandler : MessageHandlerBase
{
    //Dictionary<ClientMessageType, MessageHandlerMethod> _handlerMethods = new();
    //Dictionary<ClientMessageType, Type> _messageTypeMapping = new();
    //public CommonMessageHandler()
    //{
    //    var methods = GetType().GetMethods();
    //    foreach (var methodInfo in methods)
    //    {
    //        var pp = methodInfo.GetParameters().ToArray();
    //        if (pp.Length != 2)
    //            continue;
                
    //        if (pp[0].Name == "clientId" && typeof(IClientMessage).IsAssignableFrom(pp[1].ParameterType))
    //        {
    //            var dlg = new MessageHandlerMethod((id, msg) => methodInfo.Invoke(this, [id, msg]));
    //            var attr = pp[1].ParameterType.GetCustomAttribute<ClientMessageTypeAttribute>();
    //            var msgType = attr.ClientMessageType;
    //            _messageTypeMapping[msgType] = pp[1].ParameterType;
    //            _handlerMethods[msgType] = dlg;
    //        }
    //    }
    //}

    //public override IEnumerable<ClientMessageType> GetMessageTypes()
    //{
    //    foreach (var messageHandlerMethod in _handlerMethods)
    //    {
    //        yield return messageHandlerMethod.Key;
    //    }
    //}

    //public override bool Handle(uint clientId, byte[] buffer, int count)
    //{
    //    throw  new NotImplementedException();
    //}

    //public override bool Handle(ClientMessageType messageType, uint clientId, byte[] buffer, int count)
    //{
    //    if (!_messageTypeMapping.TryGetValue(messageType, out var clientMessageType))
    //        return false;

    //    if (!_handlerMethods.TryGetValue(messageType, out var handlerMethod))
    //        return false;

    //    var buff = new ArraySegment<byte>(buffer, 1, count).ToArray();
    //    var gcHandle = GCHandle.Alloc(buff, GCHandleType.Pinned);
    //    var clientMessage = (IClientMessage)Marshal.PtrToStructure(gcHandle.AddrOfPinnedObject(), clientMessageType);
    //    gcHandle.Free();

    //    handlerMethod.Invoke(clientId, clientMessage);
    //    return true;
    //}
    public override bool Handle(uint clientId, byte[] buffer, int count)
    {
        throw new NotImplementedException();
    }
}
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using GameModel;
using WsServer.Abstract;

namespace WsServer.Common
{
    public abstract class MessageHandlerBase<T> : MessageHandlerBase
        where T : struct, IClientMessage
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
        protected GameState GameState;
        protected IGameMessenger Messenger;
        protected GameServer GameServer;

        public abstract bool Handle(uint clientId, byte[] buffer, int count);
        public virtual  bool Handle(ClientMessageType messageType, uint clientId, byte[] buffer, int count)
        {
            return Handle(clientId, buffer, count);
        }

        public virtual IEnumerable<ClientMessageType> GetMessageTypes()
        {
            var attributes = this.GetType().GetCustomAttributes(typeof(ClientMessageTypeAttribute));

            foreach (var attribute in attributes.OfType<ClientMessageTypeAttribute>())
            {
                yield return attribute.ClientMessageType;
            }
        }

        public void Initialize(GameServer gameServer, IGameMessenger messenger, GameState gameState)
        {
            this.GameServer = gameServer;
            this.Messenger = messenger;
            this.GameState = gameState;
        }

        protected virtual T DecodeToMessage<T>(byte[] buffer, int count) where  T : struct 
        {
            var subbuf = new ArraySegment<byte>(buffer, 1, count);
            T msg = ByteArrayToStructure<T>(subbuf.ToArray());
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

    public delegate void MessageHandlerMethod(uint clientId, IClientMessage msg);
    public class CommonMessageHandler : MessageHandlerBase
    {
        Dictionary<ClientMessageType, MessageHandlerMethod> _handlerMethods = new Dictionary<ClientMessageType, MessageHandlerMethod>();
        Dictionary<ClientMessageType, Type> _messageTypeMapping = new Dictionary<ClientMessageType, Type>();
        public CommonMessageHandler()
        {
            var methods = GetType().GetMethods();
            foreach (var methodInfo in methods)
            {
                var pp = methodInfo.GetParameters().ToArray();
                if (pp.Length != 2)
                    continue;
                
                if (pp[0].Name == "clientId" && typeof(IClientMessage).IsAssignableFrom(pp[1].ParameterType))
                {
                    var dlg = new MessageHandlerMethod((id, msg) => methodInfo.Invoke(this, new object[] {id, msg}));
                    var attr = pp[1].ParameterType.GetCustomAttribute<ClientMessageTypeAttribute>();
                    var msgType = attr.ClientMessageType;
                    _messageTypeMapping[msgType] = pp[1].ParameterType;
                    _handlerMethods[msgType] = dlg;
                }
            }
        }

        public override IEnumerable<ClientMessageType> GetMessageTypes()
        {
            foreach (var messageHandlerMethod in _handlerMethods)
            {
                yield return messageHandlerMethod.Key;
            }
        }

        public override bool Handle(uint clientId, byte[] buffer, int count)
        {
            throw  new NotImplementedException();
        }

        public override bool Handle(ClientMessageType messageType, uint clientId, byte[] buffer, int count)
        {
            if (!_messageTypeMapping.TryGetValue(messageType, out var clientMessageType))
                return false;

            if (!_handlerMethods.TryGetValue(messageType, out var handlerMethod))
                return false;

            var buff = new ArraySegment<byte>(buffer, 1, count).ToArray();
            var gcHandle = GCHandle.Alloc(buff, GCHandleType.Pinned);
            var clientMessage = (IClientMessage)Marshal.PtrToStructure(gcHandle.AddrOfPinnedObject(), clientMessageType);
            gcHandle.Free();

            handlerMethod.Invoke(clientId, clientMessage);
            return true;
        }
    }
}
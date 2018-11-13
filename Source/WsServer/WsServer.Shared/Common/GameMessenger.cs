using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using WsServer.Abstract;
using WsServer.ServerMessages;

namespace WsServer.Common
{
    public class GameMessenger : IGameMessenger
    {
        public Dictionary<uint, IWsClient> Clients = new Dictionary<uint, IWsClient>();

        public uint RegisterClient(uint id, IWsClient wsClient)
        {
            lock (Clients)
            {
                Clients[id] = wsClient;
            }
            SendMessage(id, new InitPlayerServerMessage(id));

            //client id is player id for now
            return id;
        }

        public void RemoveClient(uint clientId)
        {
            lock (Clients)
            {
                if (Clients.ContainsKey(clientId))
                {
                    Clients.Remove(clientId);
                }
            }
        }

        public void TerminateConnection(uint clientId)
        {
            lock (Clients)
            {
                if (!Clients.ContainsKey(clientId)) return;
                if (Clients[clientId] == null) return;
                try
                {
                    Clients[clientId].TryToCloseConnection();
                }
                catch (Exception e)
                {
                    Logger.Log(e);
                }
            }
        }

        public void Broadcast(IServerMessage message)
        {
            Broadcast(MessageToBuffer(message));
        }

        private MyBuffer MessageToBuffer(IServerMessage message)
        {
            if (!(message.GetType().GetCustomAttribute(typeof(ServerMessageTypeAttribute)) is ServerMessageTypeAttribute messageTypeAttr))
                throw new NotImplementedException($"Not found message type for{message.GetType().Name}");

            var mesageType = messageTypeAttr.ServerMessageType;

            var buff = MyBuffer.Create()
                .SetUint8((byte)mesageType)
                .SetData(message);

            return buff;
        }

        public void Broadcast(MyBuffer buff)
        {
            try
            {
                uint[] clients;

                lock (Clients)
                {
                    clients = Clients.Keys.ToArray();
                }

                for (var i = 0; i < clients.Length; i++)
                    SendMessage(clients[i], buff);
            }
            catch (Exception e)
            {
                Logger.Log(e);
            }
        }

        public void SendMessage(uint clientId, IServerMessage message)
        {
            SendMessage(clientId, MessageToBuffer(message));
        }

        public void SendMessage(uint clientId, MyBuffer buff)
        {
            try
            {
                IWsClient wsClient;

                lock (Clients)
                    Clients.TryGetValue(clientId, out wsClient);

                wsClient?.SendMessage(buff);
            }
            catch (ObjectDisposedException ee)
            {
                Logger.Log(ee);
                RemoveClient(clientId);
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
            }
        }

    }
}
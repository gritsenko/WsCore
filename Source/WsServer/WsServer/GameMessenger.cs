using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Game.ServerLogic.Player.Events;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer;

public class GameMessenger : IGameMessenger
{
    public Dictionary<uint, IWebSocketClient> Clients = new();

    public uint RegisterClient(uint id, IWebSocketClient webSocketClient)
    {
        lock (Clients)
        {
            Clients[id] = webSocketClient;
        }
        SendMessage(id, new InitPlayerEvent(id));

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
            if (!Clients.TryGetValue(clientId, out _)) 
                return;

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

    public void Broadcast(IServerEvent @event)
    {
        Broadcast(MessageToBuffer(@event));
    }

    private MyBuffer MessageToBuffer(IServerEvent @event)
    {
        if (!(@event.GetType().GetCustomAttribute(typeof(ServerMessageTypeAttribute)) is ServerMessageTypeAttribute messageTypeAttr))
            throw new NotImplementedException($"Not found message type for{@event.GetType().Name}");

        var mesageType = messageTypeAttr.ServerMessageType;

        var buff = MyBuffer.Create()
            .SetUint8((byte)mesageType)
            .SetData(@event);

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

    public void SendMessage(uint clientId, IServerEvent @event)
    {
        SendMessage(clientId, MessageToBuffer(@event));
    }

    public void SendMessage(uint clientId, MyBuffer buff)
    {
        try
        {
            IWebSocketClient webSocketClient;

            lock (Clients)
                Clients.TryGetValue(clientId, out webSocketClient);

            webSocketClient?.SendMessage(buff);
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
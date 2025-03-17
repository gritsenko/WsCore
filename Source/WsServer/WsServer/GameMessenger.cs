using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Game.ServerLogic.Player.Events;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer;

public class GameMessenger(IClientConnectionManager connectionManager) : IGameMessenger
{
    public void Broadcast(IServerEvent @event)
    {
        Broadcast(MessageToBuffer(@event));
    }

    public void Send(uint clientId, IServerEvent @event)
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
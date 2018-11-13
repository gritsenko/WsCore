using System.Threading.Tasks;
using WsServer.Common;

namespace WsServer.Abstract
{
    public interface IGameMessenger
    {
        uint RegisterClient(uint id, IWsClient wsClient);

        void RemoveClient(uint client);
        //void NotifyMessageRecieved(IWsClient wsClient, ref byte[] buffer, int count);
        void TerminateConnection(uint clientId);

        void Broadcast(IServerMessage message);
        void Broadcast(MyBuffer buff);

        void SendMessage(uint clientId, IServerMessage message);
        void SendMessage(uint clientId, MyBuffer buff);
    }
}
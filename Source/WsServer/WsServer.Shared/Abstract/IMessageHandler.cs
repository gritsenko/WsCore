using System.Collections.Generic;
using GameModel;
using WsServer.Common;

namespace WsServer.Abstract
{
    public interface IMessageHandler
    {
        bool Handle(uint clientId, byte[] buffer, int count);
        IEnumerable<ClientMessageType> GetMessageTypes();
        void Initialize(GameServer gameServer, IGameMessenger messenger, Game game);
    }
}

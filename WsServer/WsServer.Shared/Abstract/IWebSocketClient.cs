using System.Threading.Tasks;
using WsServer.Common;

namespace WsServer.Abstract;

public interface IWebSocketClient
{
    uint ClientId { get; set; }
    Task SendMessage(MyBuffer buffer);

    void TryToCloseConnection();
}
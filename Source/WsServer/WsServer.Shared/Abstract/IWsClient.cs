using System.Threading.Tasks;
using WsServer.Common;

namespace WsServer.Abstract
{
    public interface IWsClient
    {
        uint ClientId { get; set; }
        Task SendMessage(MyBuffer buffer);

        void TryToCloseConnection();
    }
}
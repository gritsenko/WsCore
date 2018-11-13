using System;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer
{
    public class SocketHandler : IWsClient
    {
        public const int BufferSize = 4096;
        public uint ClientId { get; set; }


        private readonly WebSocket _socket;

        private readonly IGameServer _gameServer;
        private readonly IGameMessenger _gameMessenger;

        private bool _isInitialized;
        private CancellationTokenSource _cts;

        SocketHandler(WebSocket socket, IGameServer gameServer, IGameMessenger gameMessenger)
        {
            this._socket = socket;
            _gameServer = gameServer;
            _gameMessenger = gameMessenger;
        }

        async Task EchoLoop()
        {
            _cts = new CancellationTokenSource();

            try
            {
                var buffer = new byte[BufferSize];
                var seg = new ArraySegment<byte>(buffer);

                while (this._socket.State == WebSocketState.Open || _cts.Token.IsCancellationRequested)
                {
                    try
                    {
                        if (!_isInitialized)
                        {
                            _isInitialized = true;
                            ClientId = RegisterNewClient();
                        }
                        await Task.Delay(1);
                        var incoming = await this._socket.ReceiveAsync(seg, _cts.Token);

                        if (_cts.Token.IsCancellationRequested)
                            break;

                        if (incoming.MessageType == WebSocketMessageType.Binary)
                            _gameServer.NotifyMessageRecieved(ClientId, ref buffer, incoming.Count);
                    }
                    catch (OperationCanceledException ce)
                    {
                        Logger.Log(ce);
                        break;
                    }
                    catch (WebSocketException wse)
                    {
                        Logger.Log(wse);
                        break;
                    }
                    catch (Exception e)
                    {
                        Logger.Log(e);
                    }
                }

            }
            catch (Exception ex)
            {
                Logger.Log(ex);
            }
            finally
            {
                if (ClientId != 0)
                    RemoveClient(ClientId);
            }
        }

        private uint RegisterNewClient()
        {
            var player = _gameServer.AddNewPlayer();
            var clientId = _gameMessenger.RegisterClient(player.Id, this);
            _gameServer.SendGameState(player.Id);
            return clientId;
        }

        private void RemoveClient(uint clientId)
        {
            _gameMessenger.RemoveClient(clientId);
            _gameServer.RemovePlayer(clientId);
        }

        public Task SendMessage(MyBuffer buffer)
        {
            return buffer.SendAsync(_socket);
        }

        public void TryToCloseConnection()
        {
            _cts.Cancel();
        }

        static async Task Acceptor(HttpContext hc, Func<Task> n)
        {
            if (!hc.WebSockets.IsWebSocketRequest)
                return;

            var socket = await hc.WebSockets.AcceptWebSocketAsync();

            var server = IoC.Get<IGameServer>();
            var messenger = IoC.Get<IGameMessenger>();

            var h = new SocketHandler(socket, server, messenger);
            await h.EchoLoop();
        }

        public static void Map(IApplicationBuilder app)
        {
            app.UseWebSockets();
            app.Use(Acceptor);
        }
    }
}
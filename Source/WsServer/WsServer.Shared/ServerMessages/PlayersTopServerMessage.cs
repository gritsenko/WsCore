using System;
using System.Runtime.InteropServices;
using GameModel;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ServerMessages
{
    [StructLayout(LayoutKind.Sequential)]
    [ServerMessageType(ServerMessageType.PlayersTop)]
    public struct PlayersTopServerMessage : IServerMessage
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 1024)]
        public string PlayersTop;

        public PlayersTopServerMessage(Game game) : this()
        {
            PlayersTop = game.Top ?? "";
        }
    }
}
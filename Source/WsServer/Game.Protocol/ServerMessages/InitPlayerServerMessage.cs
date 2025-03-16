using System;
using System.Runtime.InteropServices;
using WsServer.Abstract;

namespace Game.Protocol.ServerMessages;

[StructLayout(LayoutKind.Sequential)]
public readonly struct InitPlayerServerMessage(uint clientId) : IServerMessage
{
    public static byte TypeId => 255;
    public uint ClientId { get; } = clientId;
}

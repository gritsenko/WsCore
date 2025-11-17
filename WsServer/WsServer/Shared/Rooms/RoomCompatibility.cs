using System;

namespace WsServer.Rooms;

/// <summary>
/// Defines supported communication modes for rooms
/// </summary>
[Flags]
public enum RoomCompatibility
{
    TextChat,
    Spatial,
    VoiceChat,
    VideoChat
}
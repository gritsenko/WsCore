using System;
using System.Collections.Generic;
using Game.Core;
using Game.ServerLogic.Rooms.Requests;
using Game.ServerLogic.Rooms.Events;
using Microsoft.Extensions.Logging;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Rooms;

namespace Game.ServerLogic.Rooms.Handlers;

public class GetRoomListRequestHandler : RequestHandlerBase<GetRoomListRequest>
{
    private readonly IGameMessenger _messenger;
    private readonly RoomManager _roomManager;
    private readonly ILogger<GetRoomListRequestHandler> _logger;

    public GetRoomListRequestHandler(
        IGameMessenger messenger,
        RoomManager roomManager,
        ILogger<GetRoomListRequestHandler> logger)
    {
        _messenger = messenger;
        _roomManager = roomManager;
        _logger = logger;
    }

    protected override void Handle(uint clientId, GetRoomListRequest request)
    {
        try
        {
            _logger.LogInformation($"Client {clientId} requested room list");
            
            // Get all available rooms
            var rooms = _roomManager.GetAllRooms();
            
            // Convert to RoomInfo list
            var roomInfoList = new List<RoomInfo>();
            foreach (var room in rooms)
            {
                roomInfoList.Add(new RoomInfo
                {
                    Id = room.Id,
                    Name = room.Name,
                    UserCount = room.ClientCount,
                    SupportedModes = new List<string>
                    {
                        "TextChat",
                        "VoiceChat",
                        "Spatial2D", 
                        "Spatial3D"
                    }
                });
            }
            
            // Create and send room list event
            var roomListEvent = new RoomListEvent(roomInfoList);
            _messenger.Send(clientId, roomListEvent);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error handling room list request for client {clientId}");
        }
    }
}
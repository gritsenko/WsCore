using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;

namespace WsServer.Rooms;

/// <summary>
/// Manages all rooms in the system, handles room creation, joining, and client membership
/// </summary>
public class RoomManager : IDisposable
{
    private readonly ConcurrentDictionary<string, Room> _rooms = new();
    private readonly ConcurrentDictionary<uint, string> _clientRoomMap = new();
    
    /// <summary>
    /// Create a new room
    /// </summary>
    public Room CreateRoom(string roomId, string roomName, IEnumerable<CommunicationMode> supportedModes, bool isPersistent = false)
    {
        var room = new Room(roomId, roomName, supportedModes, isPersistent);
        _rooms.TryAdd(roomId, room);
        return room;
    }
    
    /// <summary>
    /// Get existing room by ID
    /// </summary>
    public Room? GetRoom(string roomId)
    {
        _rooms.TryGetValue(roomId, out var room);
        return room;
    }
    
    /// <summary>
    /// Join a client to a room
    /// </summary>
    public bool JoinRoom(uint clientId, string clientName, string roomId)
    {
        if (!_rooms.TryGetValue(roomId, out var room))
            return false;
        
        // If client is already in a room, remove them first
        if (_clientRoomMap.TryGetValue(clientId, out var existingRoomId))
        {
            LeaveRoom(clientId);
        }
        
        if (!_clientRoomMap.TryAdd(clientId, roomId))
            return false;
        
        if (!room.AddClient(clientId, clientName))
        {
            _clientRoomMap.TryRemove(clientId, out _);
            return false;
        }
        
        // Set client to first supported spatial mode, or TextChat if no spatial modes
        var room_client = room.GetClient(clientId);
        if (room_client != null)
        {
            if (room.SupportsMode(CommunicationMode.Spatial2D))
            {
                room_client.CurrentMode = CommunicationMode.Spatial2D;
            }
            else if (room.SupportsMode(CommunicationMode.Spatial3D))
            {
                room_client.CurrentMode = CommunicationMode.Spatial3D;
            }
            else if (room.SupportsMode(CommunicationMode.TextChat))
            {
                room_client.CurrentMode = CommunicationMode.TextChat;
            }
            else if (room.SupportsMode(CommunicationMode.VoiceChat))
            {
                room_client.CurrentMode = CommunicationMode.VoiceChat;
            }
        }
        
        return true;
    }
    
    /// <summary>
    /// Leave current room
    /// </summary>
    public bool LeaveRoom(uint clientId)
    {
        if (!_clientRoomMap.TryRemove(clientId, out var roomId))
            return false;
        
        if (_rooms.TryGetValue(roomId, out var room))
        {
            room.RemoveClient(clientId);
            
            // Remove empty rooms only if they're not persistent
            if (room.IsEmpty && !room.IsPersistent)
            {
                _rooms.TryRemove(roomId, out _);
            }
        }
        
        return true;
    }
    
    /// <summary>
    /// Get client's current room
    /// </summary>
    public Room? GetClientRoom(uint clientId)
    {
        if (!_clientRoomMap.TryGetValue(clientId, out var roomId))
            return null;
        
        return GetRoom(roomId);
    }
    
    /// <summary>
    /// Change client's communication mode within their room
    /// </summary>
    public bool SetClientMode(uint clientId, CommunicationMode mode)
    {
        var room = GetClientRoom(clientId);
        if (room == null || !room.SupportsMode(mode))
            return false;
        
        var client = room.GetClient(clientId);
        if (client == null)
            return false;
        
        client.CurrentMode = mode;
        return true;
    }
    
    /// <summary>
    /// Check if client should receive spatial updates
    /// </summary>
    public bool ShouldReceiveSpatialUpdates(uint clientId)
    {
        var room = GetClientRoom(clientId);
        if (room == null) return false; // No spatial updates if no room
        
        var client = room.GetClient(clientId);
        if (client == null) return false;
        
        return client.CurrentMode == CommunicationMode.Spatial2D || 
               client.CurrentMode == CommunicationMode.Spatial3D;
    }
    
    /// <summary>
    /// Get all rooms
    /// </summary>
    public IEnumerable<Room> GetAllRooms()
    {
        return _rooms.Values;
    }
    
    /// <summary>
    /// Get clients in a specific room
    /// </summary>
    public IEnumerable<uint> GetRoomClientIds(string roomId)
    {
        if (_rooms.TryGetValue(roomId, out var room))
        {
            return room.GetClientIds();
        }
        return Enumerable.Empty<uint>();
    }
    
    /// <summary>
    /// Remove all clients and dispose all rooms
    /// </summary>
    public void ClearAll()
    {
        _clientRoomMap.Clear();
        _rooms.Clear();
    }
    
    public void Dispose()
    {
        ClearAll();
    }
}
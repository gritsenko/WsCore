using System;
using System.Collections.Concurrent;
using System.Collections.Generic;

namespace WsServer.Rooms;

/// <summary>
/// Represents a room with specific communication modes and client membership
/// </summary>
public class Room
{
    public string Id { get; }
    public string Name { get; set; }
    public HashSet<CommunicationMode> SupportedModes { get; }
    public ConcurrentDictionary<uint, RoomClient> Clients { get; }
    public DateTime CreatedAt { get; }
    public uint? HostClientId { get; set; }
    
    public int ClientCount => Clients.Count;
    
    public Room(string id, string name, IEnumerable<CommunicationMode> supportedModes, bool isPersistent = false)
    {
        Id = id;
        Name = name;
        SupportedModes = new HashSet<CommunicationMode>(supportedModes);
        Clients = new ConcurrentDictionary<uint, RoomClient>();
        CreatedAt = DateTime.UtcNow;
        IsPersistent = isPersistent;
    }
    
    /// <summary>
    /// Whether this room should be kept even when empty (e.g., default rooms like lobby)
    /// </summary>
    public bool IsPersistent { get; }
    
    /// <summary>
    /// Check if the room supports a specific communication mode
    /// </summary>
    public bool SupportsMode(CommunicationMode mode)
    {
        return SupportedModes.Contains(mode);
    }
    
    /// <summary>
    /// Add a client to the room
    /// </summary>
    public bool AddClient(uint clientId, string clientName)
    {
        return Clients.TryAdd(clientId, new RoomClient(clientId, clientName));
    }
    
    /// <summary>
    /// Remove a client from the room
    /// </summary>
    public bool RemoveClient(uint clientId)
    {
        return Clients.TryRemove(clientId, out _);
    }
    
    /// <summary>
    /// Get client by ID
    /// </summary>
    public RoomClient? GetClient(uint clientId)
    {
        return Clients.GetValueOrDefault(clientId);
    }
    
    /// <summary>
    /// Get all client IDs in the room
    /// </summary>
    public IEnumerable<uint> GetClientIds()
    {
        return Clients.Keys;
    }
    
    /// <summary>
    /// Check if room has any clients
    /// </summary>
    public bool IsEmpty => Clients.IsEmpty;
}

/// <summary>
/// Represents a client within a room
/// </summary>
public class RoomClient
{
    public uint Id { get; }
    public string Name { get; }
    public DateTime JoinedAt { get; }
    public CommunicationMode CurrentMode { get; set; }
    
    public RoomClient(uint id, string name)
    {
        Id = id;
        Name = name;
        JoinedAt = DateTime.UtcNow;
        CurrentMode = CommunicationMode.TextChat; // Default mode
    }
}